# ---------------------------------------------------------------------------
# Dynamic Island - VS Code Integration Bridge
# Actions:
#   - open    : Launch or focus Visual Studio Code
#   - read    : Read the current file's code from the active VS Code editor
#   - write   : Replace the active VS Code editor content with fixed code from CodeFile
#   - format  : Trigger Format Document (Shift + Alt + F) in VS Code
#   - terminal: Toggle integrated terminal (Ctrl + `) in VS Code
# ---------------------------------------------------------------------------
param(
    [string]$Action = "open",
    [string]$CodeFile = ""
)

$ErrorActionPreference = 'SilentlyContinue'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8

Add-Type -AssemblyName System.Windows.Forms

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Threading;

public static class VsWin32 {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    public const uint MOUSEEVENTF_LEFTUP   = 0x0004;
    public const uint KEYEVENTF_KEYUP      = 0x0002;

    public const byte VK_ESCAPE  = 0x1B;
    public const byte VK_RIGHT   = 0x27;
    public const byte VK_CONTROL = 0x11;
    public const byte VK_SHIFT   = 0x10;
    public const byte VK_MENU    = 0x12; // Alt
    public const byte VK_A       = 0x41;
    public const byte VK_C       = 0x43;
    public const byte VK_F       = 0x46;
    public const byte VK_S       = 0x53;
    public const byte VK_V       = 0x56;
    public const byte VK_OEM_3   = 0xC0; // `~ key

    public static void ClickAt(int x, int y) {
        SetCursorPos(x, y);
        Thread.Sleep(30);
        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
        Thread.Sleep(30);
        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
    }

    public static void TapKey(byte vk) {
        keybd_event(vk, 0, 0, UIntPtr.Zero);
        Thread.Sleep(25);
        keybd_event(vk, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
    }

    public static void CtrlKey(byte vk) {
        keybd_event(VK_CONTROL, 0, 0, UIntPtr.Zero);
        Thread.Sleep(25);
        keybd_event(vk, 0, 0, UIntPtr.Zero);
        Thread.Sleep(30);
        keybd_event(vk, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        Thread.Sleep(25);
        keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
    }

    public static void ShiftAltF() {
        keybd_event(VK_SHIFT, 0, 0, UIntPtr.Zero);
        keybd_event(VK_MENU, 0, 0, UIntPtr.Zero);
        Thread.Sleep(25);
        keybd_event(VK_F, 0, 0, UIntPtr.Zero);
        Thread.Sleep(35);
        keybd_event(VK_F, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        Thread.Sleep(25);
        keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        keybd_event(VK_SHIFT, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
    }
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

function Get-VsCodeWindow {
    return Get-Process Code -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
}

function Focus-VsCode($proc, [bool]$clickEditor = $false) {
    if (-not $proc) { return }
    $hwnd = $proc.MainWindowHandle
    if ([VsWin32]::IsIconic($hwnd)) {
        [void][VsWin32]::ShowWindow($hwnd, 9)
    } else {
        [void][VsWin32]::ShowWindow($hwnd, 5)
    }
    [void][VsWin32]::SetForegroundWindow($hwnd)
    try { $null = $wshell.AppActivate($proc.Id) } catch {}
    Start-Sleep -Milliseconds 220

    if ($clickEditor) {
        $rect = New-Object VsWin32+RECT
        if ([VsWin32]::GetWindowRect($hwnd, [ref]$rect)) {
            $w = $rect.Right - $rect.Left
            $h = $rect.Bottom - $rect.Top
            if ($w -gt 300 -and $h -gt 200) {
                # Click near the center of the main code editor pane
                $cx = [int]($rect.Left + ($w * 0.58))
                $cy = [int]($rect.Top + ($h * 0.42))
                [VsWin32]::ClickAt($cx, $cy)
                Start-Sleep -Milliseconds 120
            }
        }
    }
}

$vsProc = Get-VsCodeWindow

if ($Action -eq "open") {
    if ($vsProc) {
        Focus-VsCode $vsProc $false
        Write-Output (@{ ok = $true; status = "focused"; title = $vsProc.MainWindowTitle } | ConvertTo-Json -Compress)
        exit 0
    }
    $exe = Find-VsCodeExe
    if ($exe) {
        Start-Process $exe
    } else {
        Start-Process "cmd.exe" -ArgumentList "/c code" -WindowStyle Hidden
    }
    Write-Output (@{ ok = $true; status = "launched" } | ConvertTo-Json -Compress)
    exit 0
}

if (-not $vsProc) {
    Write-Output (@{ ok = $false; error = "VS Code is not open." } | ConvertTo-Json -Compress)
    exit 0
}

if ($Action -eq "format") {
    Focus-VsCode $vsProc $true
    [VsWin32]::ShiftAltF()
    Start-Sleep -Milliseconds 150
    [VsWin32]::CtrlKey([VsWin32]::VK_S)
    Write-Output (@{ ok = $true; action = "format" } | ConvertTo-Json -Compress)
    exit 0
}

if ($Action -eq "terminal") {
    Focus-VsCode $vsProc $false
    [VsWin32]::CtrlKey([VsWin32]::VK_OEM_3)
    Write-Output (@{ ok = $true; action = "terminal" } | ConvertTo-Json -Compress)
    exit 0
}

if ($Action -eq "read") {
    $oldClip = ""
    try { $oldClip = [System.Windows.Forms.Clipboard]::GetText() } catch {}

    Focus-VsCode $vsProc $true
    [VsWin32]::TapKey([VsWin32]::VK_ESCAPE)
    Start-Sleep -Milliseconds 80

    $sentinel = "__JARVIS_EMPTY_CLIP__"
    try { [System.Windows.Forms.Clipboard]::SetText($sentinel) } catch {}
    Start-Sleep -Milliseconds 60

    # Select entire file and copy
    [VsWin32]::CtrlKey([VsWin32]::VK_A)
    Start-Sleep -Milliseconds 120
    [VsWin32]::CtrlKey([VsWin32]::VK_C)
    Start-Sleep -Milliseconds 180
    # Deselect so the editor doesn't stay highlighted blue
    [VsWin32]::TapKey([VsWin32]::VK_RIGHT)

    $copied = ""
    try { $copied = [System.Windows.Forms.Clipboard]::GetText() } catch {}

    # Restore previous clipboard
    if (-not [string]::IsNullOrEmpty($oldClip)) {
        try { [System.Windows.Forms.Clipboard]::SetText($oldClip) } catch {}
    }

    if ($copied -eq $sentinel -or [string]::IsNullOrWhiteSpace($copied)) {
        Write-Output (@{ ok = $false; error = "No code found in the active VS Code editor." } | ConvertTo-Json -Compress)
        exit 0
    }

    Write-Output (@{
        ok    = $true
        title = $vsProc.MainWindowTitle
        code  = $copied
    } | ConvertTo-Json -Compress)
    exit 0
}

if ($Action -eq "write" -and -not [string]::IsNullOrWhiteSpace($CodeFile) -and (Test-Path $CodeFile)) {
    $newCode = [System.IO.File]::ReadAllText($CodeFile, $utf8)
    if ([string]::IsNullOrWhiteSpace($newCode)) {
        Write-Output (@{ ok = $false; error = "Empty fixed code." } | ConvertTo-Json -Compress)
        exit 0
    }

    $oldClip = ""
    try { $oldClip = [System.Windows.Forms.Clipboard]::GetText() } catch {}

    Focus-VsCode $vsProc $true
    [VsWin32]::TapKey([VsWin32]::VK_ESCAPE)
    Start-Sleep -Milliseconds 80

    [System.Windows.Forms.Clipboard]::SetText($newCode)
    Start-Sleep -Milliseconds 100

    # Replace entire file content and save
    [VsWin32]::CtrlKey([VsWin32]::VK_A)
    Start-Sleep -Milliseconds 100
    [VsWin32]::CtrlKey([VsWin32]::VK_V)
    Start-Sleep -Milliseconds 220
    [VsWin32]::CtrlKey([VsWin32]::VK_S)

    if (-not [string]::IsNullOrEmpty($oldClip)) {
        Start-Sleep -Milliseconds 150
        try { [System.Windows.Forms.Clipboard]::SetText($oldClip) } catch {}
    }

    Write-Output (@{ ok = $true; action = "write" } | ConvertTo-Json -Compress)
    exit 0
}

Write-Output (@{ ok = $false; error = "Unknown action" } | ConvertTo-Json -Compress)
