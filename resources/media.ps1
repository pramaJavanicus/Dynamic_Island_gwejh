# ---------------------------------------------------------------------------
# Dynamic Island - Windows Media Session bridge (SMTC)
# Uses Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager
# (built into Windows 10 1809+ / Windows 11) - no native Node module needed.
#
# Protocol (line based, UTF-8):
#   stdout -> one JSON object per line describing the current media state
#   stdin  <- commands: toggle | play | pause | next | prev | refresh
# The process exits automatically when stdin is closed (parent app died).
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8

Add-Type -AssemblyName System.Runtime.WindowsRuntime

# Generic helper to await WinRT IAsyncOperation<T> from PowerShell 5.1
$script:asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
        $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    })[0]

function Await($op, [Type]$type) {
    $task = $script:asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
    $null = $task.Wait(-1)
    return $task.Result
}

$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]

$manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) `
([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

$script:lastKey = $null
$script:thumb = $null
$script:thumbChanged = $false
$script:thumbRetries = 0

function Write-Line([string]$text) {
    [Console]::Out.WriteLine($text)
    [Console]::Out.Flush()
}

# Prefer Spotify; fall back to whatever session Windows considers "current"
function Get-Session {
    $spotify = $manager.GetSessions() | Where-Object { $_.SourceAppUserModelId -like '*spotify*' } | Select-Object -First 1
    if ($spotify) { return $spotify }
    return $manager.GetCurrentSession()
}

function Get-ThumbDataUrl($props) {
    if ($null -eq $props.Thumbnail) { return $null }
    try {
        $ras = Await ($props.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
        $stream = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($ras)
        $ms = New-Object System.IO.MemoryStream
        $stream.CopyTo($ms)
        $bytes = $ms.ToArray()
        $stream.Dispose(); $ms.Dispose()
        if ($bytes.Length -eq 0) { return $null }
        $mime = $ras.ContentType
        if ([string]::IsNullOrEmpty($mime)) { $mime = 'image/png' }
        return "data:$mime;base64," + [Convert]::ToBase64String($bytes)
    }
    catch { return $null }
}

function Get-State {
    $s = Get-Session
    if ($null -eq $s) { return [ordered]@{ active = $false } }

    $props = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    $info = $s.GetPlaybackInfo()
    $tl = $s.GetTimelineProperties()

    $key = "$($s.SourceAppUserModelId)|$($props.Title)|$($props.Artist)"
    if ($key -ne $script:lastKey) {
        $script:lastKey = $key
        $script:thumb = Get-ThumbDataUrl $props
        $script:thumbChanged = $true
        $script:thumbRetries = 0
    }
    elseif ($null -eq $script:thumb -and $script:thumbRetries -lt 5) {
        # Spotify sometimes publishes the artwork a moment after the title
        $script:thumbRetries++
        $script:thumb = Get-ThumbDataUrl $props
        if ($script:thumb) { $script:thumbChanged = $true }
    }

    return [ordered]@{
        active      = $true
        app         = $s.SourceAppUserModelId
        isSpotify   = ($s.SourceAppUserModelId -like '*spotify*')
        title       = $props.Title
        artist      = $props.Artist
        album       = $props.AlbumTitle
        status      = "$($info.PlaybackStatus)"   # Playing | Paused | Stopped | ...
        canPrev     = $info.Controls.IsPreviousEnabled
        canNext     = $info.Controls.IsNextEnabled
        position    = [math]::Round($tl.Position.TotalSeconds, 2)
        duration    = [math]::Round($tl.EndTime.TotalSeconds, 2)
        lastUpdated = $tl.LastUpdatedTime.ToUnixTimeMilliseconds()
    }
}

function Invoke-MediaCommand([string]$cmd) {
    $s = Get-Session
    if ($null -eq $s) { return }
    switch ($cmd) {
        'toggle' { $null = Await ($s.TryTogglePlayPauseAsync()) ([bool]) }
        'play' { $null = Await ($s.TryPlayAsync()) ([bool]) }
        'pause' { $null = Await ($s.TryPauseAsync()) ([bool]) }
        'next' { $null = Await ($s.TrySkipNextAsync()) ([bool]) }
        'prev' { $null = Await ($s.TrySkipPreviousAsync()) ([bool]) }
    }
}

# Truly asynchronous stdin reader (Console.In.ReadLineAsync blocks on .NET Framework)
$reader = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), $utf8)
$readTask = $reader.ReadLineAsync()
$lastJson = ''
$nextPoll = [DateTime]::MinValue

while ($true) {
    if ($readTask.IsCompleted) {
        $line = $readTask.Result
        if ($null -eq $line) { break }                   # stdin closed -> exit
        $cmd = $line.Trim().ToLowerInvariant()
        if ($cmd -eq 'refresh') { $lastJson = '' }
        else { try { Invoke-MediaCommand $cmd } catch {} }
        $readTask = $reader.ReadLineAsync()
        $nextPoll = (Get-Date).AddMilliseconds(250)      # quick refresh after a command
    }

    if ((Get-Date) -ge $nextPoll) {
        $nextPoll = (Get-Date).AddMilliseconds(1000)
        try { $state = Get-State } catch { $state = [ordered]@{ active = $false; error = $_.Exception.Message } }
        $json = $state | ConvertTo-Json -Compress
        if ($script:thumbChanged) {
            $script:thumbChanged = $false
            $state['thumb'] = $script:thumb
            Write-Line ($state | ConvertTo-Json -Compress)
            $lastJson = $json
        }
        elseif ($json -ne $lastJson) {
            Write-Line $json
            $lastJson = $json
        }
    }
    Start-Sleep -Milliseconds 80
}
