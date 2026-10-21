# ---------------------------------------------------------------------------
# Dynamic Island - Stealth Background WhatsApp Web Automation Bridge
# Works invisibly in the background when the user is coding in VS Code or
# working in another app:
#   - Temporarily cloaks the WhatsApp Chrome window (Alpha=1) if it is not
#     the active foreground window so it NEVER covers the screen
#   - Searches contact, sends message or starts voice/video call
#   - Pushes WhatsApp window to the background and restores focus to VS Code
# ---------------------------------------------------------------------------
param(
    [string]$Action = "open",
    [string]$Contact = "",
    [string]$Message = ""
)

$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Threading;

public static class WaWin32 {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
    [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);
    [DllImport("user32.dll")] public static extern bool SetLayeredWindowAttributes(IntPtr hwnd, uint crKey, byte bAlpha, uint dwFlags);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT lpPoint);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    [StructLayout(LayoutKind.Sequential)]
    public struct POINT {
        public int X;
        public int Y;
    }

    public const int GWL_EXSTYLE = -20;
    public const int WS_EX_LAYERED = 0x00080000;
    public const uint LWA_ALPHA = 0x00000002;

    public static readonly IntPtr HWND_BOTTOM = new IntPtr(1);
    public const uint SWP_NOSIZE = 0x0001;
    public const uint SWP_NOMOVE = 0x0002;
    public const uint SWP_NOACTIVATE = 0x0010;

    public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    public const uint MOUSEEVENTF_LEFTUP   = 0x0004;
    public const uint KEYEVENTF_KEYUP      = 0x0002;

    public const byte VK_RETURN  = 0x0D;
    public const byte VK_ESCAPE  = 0x1B;
    public const byte VK_DOWN    = 0x28;
    public const byte VK_BACK    = 0x08;
    public const byte VK_CONTROL = 0x11;
    public const byte VK_MENU    = 0x12; // Alt
    public const byte VK_OEM_2   = 0xBF; // '/' key
    public const byte VK_A       = 0x41;
    public const byte VK_V       = 0x56;

    public static void SetCloak(IntPtr hWnd, bool cloak) {
        if (hWnd == IntPtr.Zero) return;
        int ex = GetWindowLong(hWnd, GWL_EXSTYLE);
        if (cloak) {
            SetWindowLong(hWnd, GWL_EXSTYLE, ex | WS_EX_LAYERED);
            SetLayeredWindowAttributes(hWnd, 0, 1, LWA_ALPHA); // 99.6% transparent (invisible)
        } else {
            SetLayeredWindowAttributes(hWnd, 0, 255, LWA_ALPHA);
        }
    }

    public static void SendToBack(IntPtr hWnd) {
        if (hWnd == IntPtr.Zero) return;
        SetWindowPos(hWnd, HWND_BOTTOM, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
    }

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
        Thread.Sleep(20);
        keybd_event(vk, 0, 0, UIntPtr.Zero);
        Thread.Sleep(25);
        keybd_event(vk, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        Thread.Sleep(20);
        keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
    }

    // Ctrl + Alt + / (WhatsApp Web universal shortcut to focus search bar)
    public static void CtrlAltSlash() {
        keybd_event(VK_CONTROL, 0, 0, UIntPtr.Zero);
        keybd_event(VK_MENU, 0, 0, UIntPtr.Zero);
        Thread.Sleep(25);
        keybd_event(VK_OEM_2, 0, 0, UIntPtr.Zero);
        Thread.Sleep(30);
        keybd_event(VK_OEM_2, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        Thread.Sleep(20);
        keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
    }
}
"@

$wshell = New-Object -ComObject WScript.Shell
$prevHwnd = [WaWin32]::GetForegroundWindow()
$savedCursor = New-Object WaWin32+POINT
[void][WaWin32]::GetCursorPos([ref]$savedCursor)
$oldClipboard = ""
try { $oldClipboard = [System.Windows.Forms.Clipboard]::GetText() } catch {}

$stealthMode = ($Action -ne "open")
$targetHwnd = [IntPtr]::Zero
$targetPid = 0
$wasMinimized = $false
$cloaked = $false

function Find-ChromeExe {
    $candidates = @(
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
    )
    foreach ($c in $candidates) {
        if ($c -and (Test-Path $c)) { return $c }
    }
    return $null
}

function Focus-Window([IntPtr]$hwnd, [int]$procId, [bool]$useCloak) {
    if ($hwnd -eq [IntPtr]::Zero) { return }
    if ($useCloak -and $hwnd -ne $prevHwnd) {
        [WaWin32]::SetCloak($hwnd, $true)
        $script:cloaked = $true
    }
    if ([WaWin32]::IsIconic($hwnd)) {
        $script:wasMinimized = $true
        [void][WaWin32]::ShowWindow($hwnd, 9) # SW_RESTORE (invisible while cloaked!)
    } else {
        [void][WaWin32]::ShowWindow($hwnd, 5) # SW_SHOW
    }
    [void][WaWin32]::SetForegroundWindow($hwnd)
    if ($procId -gt 0) {
        try { $null = $wshell.AppActivate($procId) } catch {}
    }
}

try {
    # 1. Check if WhatsApp Web is already open in any Chrome window
    $alreadyOpen = $false
    $chromeWindows = Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }
    foreach ($p in $chromeWindows) {
        if ($p.MainWindowTitle -match 'WhatsApp') {
            $targetHwnd = $p.MainWindowHandle
            $targetPid = $p.Id
            $alreadyOpen = $true
            break
        }
    }

    # If not the active tab title, check all TabItem elements inside open Chrome windows
    if (-not $alreadyOpen) {
        foreach ($p in $chromeWindows) {
            try {
                $root = [System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)
                $tabCond = New-Object System.Windows.Automation.PropertyCondition(
                    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                    [System.Windows.Automation.ControlType]::TabItem
                )
                $tabs = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $tabCond)
                foreach ($tab in $tabs) {
                    $tName = "$($tab.Current.Name)"
                    if ($tName -match 'WhatsApp') {
                        $targetHwnd = $p.MainWindowHandle
                        $targetPid = $p.Id
                        $alreadyOpen = $true
                        Focus-Window $targetHwnd $targetPid $stealthMode
                        Start-Sleep -Milliseconds 180
                        $selPat = $null
                        $invPat = $null
                        if ($tab.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$selPat)) {
                            $selPat.Select()
                        } elseif ($tab.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$invPat)) {
                            $invPat.Invoke()
                        } else {
                            $rect = $tab.Current.BoundingRectangle
                            if ($rect.Width -gt 5) {
                                $cx = [int]($rect.Left + $rect.Width / 2)
                                $cy = [int]($rect.Top + $rect.Height / 2)
                                [WaWin32]::ClickAt($cx, $cy)
                            }
                        }
                        break
                    }
                }
                if ($alreadyOpen) { break }
            } catch {}
        }
    }

    if ($alreadyOpen) {
        Focus-Window $targetHwnd $targetPid $stealthMode
        Start-Sleep -Milliseconds 380
    } else {
        # Launch WhatsApp Web in Chrome in a new window so we can cloak it without hiding the user's other tabs
        $chromeExe = Find-ChromeExe
        if ($chromeExe) {
            $args = if ($stealthMode) {
                @("--new-window", "--force-renderer-accessibility", "https://web.whatsapp.com")
            } else {
                @("--force-renderer-accessibility", "https://web.whatsapp.com")
            }
            Start-Process $chromeExe -ArgumentList $args
        } else {
            Start-Process "https://web.whatsapp.com"
        }

        # As soon as the new Chrome window appears, cloak it immediately if in stealth mode!
        for ($i = 0; $i -lt 35; $i++) {
            Start-Sleep -Milliseconds 350
            $p = Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -match 'WhatsApp' } | Select-Object -First 1
            if ($p) {
                $targetHwnd = $p.MainWindowHandle
                $targetPid = $p.Id
                if ($stealthMode) {
                    [WaWin32]::SetCloak($targetHwnd, $true)
                    $cloaked = $true
                }
                break
            }
        }

        if ($targetHwnd -eq [IntPtr]::Zero) {
            $p = Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
            if ($p) {
                $targetHwnd = $p.MainWindowHandle
                $targetPid = $p.Id
            }
        }

        Focus-Window $targetHwnd $targetPid $stealthMode
        # Return focus to the user's coding window while WhatsApp Web finishes syncing in the background
        if ($stealthMode -and $prevHwnd -ne [IntPtr]::Zero -and $prevHwnd -ne $targetHwnd) {
            [void][WaWin32]::SetForegroundWindow($prevHwnd)
        }
        Start-Sleep -Milliseconds 6500
    }

    if ($Action -eq "open" -or [string]::IsNullOrWhiteSpace($Contact)) {
        Write-Output '{"ok":true,"action":"open"}'
        exit 0
    }

    # Re-focus cloaked WhatsApp window briefly for the 1.8s background input sequence
    Focus-Window $targetHwnd $targetPid $stealthMode
    $winRect = $null
    $rootEl = $null
    if ($targetHwnd -ne [IntPtr]::Zero) {
        try {
            $rootEl = [System.Windows.Automation.AutomationElement]::FromHandle($targetHwnd)
            $winRect = $rootEl.Current.BoundingRectangle
        } catch {}
    }

    # 2. Focus WhatsApp Web search bar
    $searchClicked = $false
    if ($rootEl -ne $null -and $winRect -ne $null) {
        try {
            $allEls = $rootEl.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
            foreach ($el in $allEls) {
                $n = "$($el.Current.Name)"
                $ct = $el.Current.ControlType
                $r = $el.Current.BoundingRectangle
                if ($r.Width -gt 40 -and $r.Top -gt ($winRect.Top + 90) -and $r.Top -lt ($winRect.Top + 260) -and $r.Left -lt ($winRect.Left + 480)) {
                    if (($ct -eq [System.Windows.Automation.ControlType]::Edit -or $ct -eq [System.Windows.Automation.ControlType]::Button -or $ct -eq [System.Windows.Automation.ControlType]::Custom) -and ($n -match 'Cari|Search|chat baru|new chat|pencarian')) {
                        $cx = [int]($r.Left + $r.Width / 2)
                        $cy = [int]($r.Top + $r.Height / 2)
                        [WaWin32]::ClickAt($cx, $cy)
                        $searchClicked = $true
                        break
                    }
                }
            }
        } catch {}
    }

    if (-not $searchClicked -and $winRect -ne $null -and $winRect.Width -gt 400) {
        $safeX = [int]($winRect.Left + 210)
        $safeY = [int]($winRect.Top + 150)
        [WaWin32]::ClickAt($safeX, $safeY)
        Start-Sleep -Milliseconds 120
    }

    [WaWin32]::TapKey([WaWin32]::VK_ESCAPE)
    Start-Sleep -Milliseconds 120
    [WaWin32]::CtrlAltSlash()
    Start-Sleep -Milliseconds 280

    # Clear any leftover text in the search box
    [WaWin32]::CtrlKey([WaWin32]::VK_A)
    Start-Sleep -Milliseconds 60
    [WaWin32]::TapKey([WaWin32]::VK_BACK)
    Start-Sleep -Milliseconds 100

    # 3. Paste Contact Name and open the top matching chat
    [System.Windows.Forms.Clipboard]::SetText($Contact.Trim())
    Start-Sleep -Milliseconds 70
    [WaWin32]::CtrlKey([WaWin32]::VK_V)

    # Wait for WhatsApp Web to filter the contact list
    Start-Sleep -Milliseconds 1250

    # Press Enter directly in the search box to open the #1 result and focus the message composer
    [WaWin32]::TapKey([WaWin32]::VK_RETURN)
    Start-Sleep -Milliseconds 850

    # 4A. Send Message
    if ($Action -eq "send" -and -not [string]::IsNullOrWhiteSpace($Message)) {
        if ($rootEl -ne $null -and $winRect -ne $null) {
            try {
                $editCond = New-Object System.Windows.Automation.PropertyCondition(
                    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                    [System.Windows.Automation.ControlType]::Edit
                )
                $edits = $rootEl.FindAll([System.Windows.Automation.TreeScope]::Descendants, $editCond)
                foreach ($ed in $edits) {
                    $er = $ed.Current.BoundingRectangle
                    if ($er.Top -gt ($winRect.Bottom - 180) -and $er.Left -gt ($winRect.Left + 300)) {
                        [WaWin32]::ClickAt([int]($er.Left + 80), [int]($er.Top + $er.Height / 2))
                        Start-Sleep -Milliseconds 100
                        break
                    }
                }
            } catch {}
        }

        [System.Windows.Forms.Clipboard]::SetText($Message.Trim())
        Start-Sleep -Milliseconds 80
        [WaWin32]::CtrlKey([WaWin32]::VK_V)
        Start-Sleep -Milliseconds 300
        [WaWin32]::TapKey([WaWin32]::VK_RETURN)
        Start-Sleep -Milliseconds 250

        Write-Output '{"ok":true,"action":"send","stealth":true}'
        exit 0
    }

    # 4B. Voice Call or Video Call
    if ($Action -eq "call" -or $Action -eq "videocall") {
        $callClicked = $false
        $pattern = if ($Action -eq "videocall") { 'Video call|Panggilan video|Video' } else { 'Voice call|Panggilan suara|Telepon|Audio call|Call|Panggilan' }

        if ($rootEl -ne $null -and $winRect -ne $null) {
            try {
                $btnCond = New-Object System.Windows.Automation.PropertyCondition(
                    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                    [System.Windows.Automation.ControlType]::Button
                )
                $btns = $rootEl.FindAll([System.Windows.Automation.TreeScope]::Descendants, $btnCond)
                foreach ($b in $btns) {
                    $bn = "$($b.Current.Name)"
                    $br = $b.Current.BoundingRectangle
                    if ($bn -match $pattern -and $br.Top -gt ($winRect.Top + 65) -and $br.Top -lt ($winRect.Top + 210) -and $br.Left -gt ($winRect.Left + 420)) {
                        $inv = $null
                        if ($b.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$inv)) {
                            $inv.Invoke()
                        } else {
                            [WaWin32]::ClickAt([int]($br.Left + $br.Width / 2), [int]($br.Top + $br.Height / 2))
                        }
                        $callClicked = $true
                        break
                    }
                }

                if ($callClicked) {
                    Start-Sleep -Milliseconds 600
                    $btns2 = $rootEl.FindAll([System.Windows.Automation.TreeScope]::Descendants, $btnCond)
                    foreach ($b2 in $btns2) {
                        $bn2 = "$($b2.Current.Name)"
                        $br2 = $b2.Current.BoundingRectangle
                        if ($bn2 -match $pattern -and $br2.Top -gt ($winRect.Top + 120) -and $br2.Top -lt ($winRect.Top + 340) -and $br2.Left -gt ($winRect.Left + 420)) {
                            [WaWin32]::ClickAt([int]($br2.Left + $br2.Width / 2), [int]($br2.Top + $br2.Height / 2))
                            break
                        }
                    }
                }
            } catch {}
        }

        Write-Output ("{`"ok`":true,`"action`":`"$Action`",`"callClicked`":" + ($callClicked.ToString().ToLower()) + "}")
        exit 0
    }
} finally {
    # Always restore cursor position, clipboard, window Z-order, and user's foreground window (e.g. VS Code)!
    if ($stealthMode -and $targetHwnd -ne [IntPtr]::Zero) {
        if ($wasMinimized) {
            [void][WaWin32]::ShowWindow($targetHwnd, 6) # SW_MINIMIZE back to taskbar
        } elseif ($prevHwnd -ne [IntPtr]::Zero -and $prevHwnd -ne $targetHwnd) {
            [WaWin32]::SendToBack($targetHwnd)
        }
        if ($cloaked) {
            [WaWin32]::SetCloak($targetHwnd, $false)
        }
    }
    if ($stealthMode) {
        [void][WaWin32]::SetCursorPos($savedCursor.X, $savedCursor.Y)
        if ($prevHwnd -ne [IntPtr]::Zero -and $prevHwnd -ne $targetHwnd) {
            [void][WaWin32]::SetForegroundWindow($prevHwnd)
        }
        if (-not [string]::IsNullOrEmpty($oldClipboard)) {
            try { [System.Windows.Forms.Clipboard]::SetText($oldClipboard) } catch {}
        }
    }
}
