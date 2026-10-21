# ---------------------------------------------------------------------------
# Dynamic Island - Safe VS Code Window Helper (No simulated mouse clicks or
# destructive keystrokes; file reading/fixing is done directly on disk in Node)
# ---------------------------------------------------------------------------
param(
    [string]$Action = "status",
    [string]$FolderPath = "",
    [string]$FilePath = ""
)

$ErrorActionPreference = 'SilentlyContinue'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class VsSafeWin32 {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
}
"@

$wshell = New-Object -ComObject WScript.Shell

function Find-VsCodeExe {
    $candidates = @(
        "$env:LOCALAPPDATA\Programs\Microsoft VS Code\Code.exe",
        "$env:ProgramFiles\Microsoft VS Code\Code.exe",
        "${env:ProgramFiles(x86)}\Microsoft VS Code\Code.exe"
    )
    foreach ($c in $candidates) {
        if ($c -and (Test-Path $c)) { return $c }
    }
    return $null
}

$vsWindows = @(Get-Process Code -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle })
# Prefer a VS Code window that has a folder/file open (contains " - ")
$vsProc = $vsWindows | Where-Object { $_.MainWindowTitle -like '* - *' } | Select-Object -First 1
if (-not $vsProc) {
    $vsProc = $vsWindows | Select-Object -First 1
}

if ($Action -eq "status") {
    if ($vsProc) {
        Write-Output (@{
            ok      = $true
            running = $true
            title   = $vsProc.MainWindowTitle
            titles  = @($vsWindows | ForEach-Object { $_.MainWindowTitle })
        } | ConvertTo-Json -Compress)
    } else {
        Write-Output (@{ ok = $true; running = $false; title = ""; titles = @() } | ConvertTo-Json -Compress)
    }
    exit 0
}

if ($Action -eq "open") {
    $exe = Find-VsCodeExe
    if ($vsProc -and [string]::IsNullOrWhiteSpace($FolderPath) -and [string]::IsNullOrWhiteSpace($FilePath)) {
        $hwnd = $vsProc.MainWindowHandle
        if ([VsSafeWin32]::IsIconic($hwnd)) {
            [void][VsSafeWin32]::ShowWindow($hwnd, 9)
        } else {
            [void][VsSafeWin32]::ShowWindow($hwnd, 5)
        }
        [void][VsSafeWin32]::SetForegroundWindow($hwnd)
        try { $null = $wshell.AppActivate($vsProc.Id) } catch {}
        Write-Output (@{ ok = $true; status = "focused"; title = $vsProc.MainWindowTitle } | ConvertTo-Json -Compress)
        exit 0
    }

    $argsList = @("--reuse-window")
    if (-not [string]::IsNullOrWhiteSpace($FolderPath) -and (Test-Path $FolderPath)) {
        $argsList += $FolderPath
    }
    if (-not [string]::IsNullOrWhiteSpace($FilePath) -and (Test-Path $FilePath)) {
        $argsList += $FilePath
    }

    if ($exe) {
        Start-Process $exe -ArgumentList $argsList
    } else {
        Start-Process "cmd.exe" -ArgumentList "/c code" -WindowStyle Hidden
    }

    Start-Sleep -Milliseconds 350
    if ($vsProc) {
        [void][VsSafeWin32]::SetForegroundWindow($vsProc.MainWindowHandle)
    }
    Write-Output (@{ ok = $true; status = "opened" } | ConvertTo-Json -Compress)
    exit 0
}

Write-Output (@{ ok = $true } | ConvertTo-Json -Compress)
