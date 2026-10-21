# ---------------------------------------------------------------------------
# Dynamic Island - Windows Media Session bridge (SMTC) + Spotify Deep Play
# Protocol (line based, UTF-8):
#   stdout -> one JSON object per line describing the current media state
#   stdin  <- commands:
#             toggle | play | pause | next | prev | refresh
#             play-track:<spotifyTrackId>
#             play-search:<searchQuery>
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8

Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class SpWin32 {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    public static void TapKey(byte vk) {
        keybd_event(vk, 0, 0, UIntPtr.Zero);
        System.Threading.Thread.Sleep(35);
        keybd_event(vk, 0, 2, UIntPtr.Zero);
    }
}
"@

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
$script:wshell = New-Object -ComObject WScript.Shell

function Write-Line([string]$text) {
    [Console]::Out.WriteLine($text)
    [Console]::Out.Flush()
}

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
        status      = "$($info.PlaybackStatus)"
        canPrev     = $info.Controls.IsPreviousEnabled
        canNext     = $info.Controls.IsNextEnabled
        position    = [math]::Round($tl.Position.TotalSeconds, 2)
        duration    = [math]::Round($tl.EndTime.TotalSeconds, 2)
        lastUpdated = $tl.LastUpdatedTime.ToUnixTimeMilliseconds()
    }
}

function Find-SpotifyExe {
    $candidates = @(
        "$env:APPDATA\Spotify\Spotify.exe",
        "$env:LOCALAPPDATA\Microsoft\WindowsApps\Spotify.exe"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { return $c }
    }
    return $null
}

function Open-SpotifyUriAndPlay([string]$uri) {
    $spProcs = Get-Process Spotify -ErrorAction SilentlyContinue
    $winProc = $spProcs | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
    $spExe = Find-SpotifyExe

    if (-not $winProc -and $spProcs) {
        # Spotify is running minimized in tray or headless; pass --uri directly to Spotify.exe
        if ($spExe) {
            Start-Process $spExe -ArgumentList "--uri=$uri"
        } else {
            Start-Process $uri
        }
    } elseif ($spExe -and -not $spProcs) {
        Start-Process $spExe -ArgumentList "--uri=$uri"
    } else {
        Start-Process $uri
    }

    # Wait up to 4.5s for Spotify window to appear
    $hwnd = [IntPtr]::Zero
    $spPid = 0
    for ($i = 0; $i -lt 18; $i++) {
        Start-Sleep -Milliseconds 250
        $p = Get-Process Spotify -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
        if ($p) {
            $hwnd = $p.MainWindowHandle
            $spPid = $p.Id
            break
        }
    }

    if ($hwnd -ne [IntPtr]::Zero) {
        [void][SpWin32]::ShowWindow($hwnd, 9) # SW_RESTORE
        [void][SpWin32]::SetForegroundWindow($hwnd)
        try { $null = $script:wshell.AppActivate($spPid) } catch {}
    }

    # Wait for Spotify to finish rendering the track/search page
    Start-Sleep -Milliseconds 1500

    # Try clicking the Play button in the main content view via UI Automation
    $invoked = $false
    if ($hwnd -ne [IntPtr]::Zero) {
        try {
            $root = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
            $winRect = $root.Current.BoundingRectangle
            $cond = New-Object System.Windows.Automation.PropertyCondition(
                [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                [System.Windows.Automation.ControlType]::Button
            )
            $btns = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
            foreach ($b in $btns) {
                $name = "$($b.Current.Name)"
                $r = $b.Current.BoundingRectangle
                # Match Play / Putar button in the middle content area (not the bottom player bar)
                if ($name -match '^(Play|Putar)\b' -and $r.Top -gt ($winRect.Top + 100) -and $r.Bottom -lt ($winRect.Bottom - 95)) {
                    $pat = $null
                    if ($b.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pat)) {
                        $pat.Invoke()
                        $invoked = $true
                        break
                    }
                }
            }
        } catch {}
    }

    if (-not $invoked) {
        # Fallback: press Enter on the focused track page in Spotify
        if ($hwnd -ne [IntPtr]::Zero) {
            [void][SpWin32]::SetForegroundWindow($hwnd)
            Start-Sleep -Milliseconds 120
            [SpWin32]::TapKey(0x0D) # VK_RETURN
        }
    }

    Start-Sleep -Milliseconds 400
    try {
        $s = Get-Session
        if ($s) {
            $info = $s.GetPlaybackInfo()
            if ("$($info.PlaybackStatus)" -ne 'Playing') {
                $null = Await ($s.TryPlayAsync()) ([bool])
            }
        }
    } catch {}
}

function Invoke-MediaCommand([string]$rawCmd) {
    if ($rawCmd -like 'play-track:*') {
        $id = $rawCmd.Substring(11).Trim()
        if ($id) { Open-SpotifyUriAndPlay "spotify:track:$id" }
        return
    }
    if ($rawCmd -like 'play-search:*') {
        $q = [System.Uri]::EscapeDataString($rawCmd.Substring(12).Trim())
        if ($q) { Open-SpotifyUriAndPlay "spotify:search:$q" }
        return
    }

    $cmd = $rawCmd.ToLowerInvariant()
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

$reader = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), $utf8)
$readTask = $reader.ReadLineAsync()
$lastJson = ''
$nextPoll = [DateTime]::MinValue

while ($true) {
    if ($readTask.IsCompleted) {
        $line = $readTask.Result
        if ($null -eq $line) { break }
        $cmd = $line.Trim()
        if ($cmd -eq 'refresh') { $lastJson = '' }
        else { try { Invoke-MediaCommand $cmd } catch {} }
        $readTask = $reader.ReadLineAsync()
        $nextPoll = (Get-Date).AddMilliseconds(250)
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
