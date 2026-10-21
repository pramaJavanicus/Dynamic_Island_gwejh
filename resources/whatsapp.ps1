# ---------------------------------------------------------------------------
# Dynamic Island - WhatsApp Web / Desktop Automation Bridge
# Supports:
#   - Opening or focusing an existing WhatsApp Web tab in Google Chrome
#   - Searching a contact by name
#   - Sending a chat message automatically
#   - Initiating a voice or video call
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
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

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

    public static void ClickAt(int x, int y) {
        SetCursorPos(x, y);
        Thread.Sleep(35);
        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
        Thread.Sleep(35);
        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
    }

    public static void TapKey(byte vk) {
        keybd_event(vk, 0, 0, UIntPtr.Zero);
        Thread.Sleep(30);
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

    // Ctrl + Alt + / (WhatsApp Web universal shortcut to focus search bar)
    public static void CtrlAltSlash() {
        keybd_event(VK_CONTROL, 0, 0, UIntPtr.Zero);
        keybd_event(VK_MENU, 0, 0, UIntPtr.Zero);
        Thread.Sleep(30);
        keybd_event(VK_OEM_2, 0, 0, UIntPtr.Zero);
        Thread.Sleep(35);
        keybd_event(VK_OEM_2, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        Thread.Sleep(25);
        keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
    }
}
"@

$wshell = New-Object -ComObject WScript.Shell

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

function Focus-Window([IntPtr]$hwnd, [int]$procId) {
    if ($hwnd -eq [IntPtr]::Zero) { return }
    if ([WaWin32]::IsIconic($hwnd)) {
        [void][WaWin32]::ShowWindow($hwnd, 9) # SW_RESTORE
    } else {
        [void][WaWin32]::ShowWindow($hwnd, 5) # SW_SHOW
    }
    [void][WaWin32]::SetForegroundWindow($hwnd)
    if ($procId -gt 0) {
        try { $null = $wshell.AppActivate($procId) } catch {}
    }
}

# 1. Check if WhatsApp Web is already open in any Chrome window (either active tab or background tab)
$targetHwnd = [IntPtr]::Zero
$targetPid = 0
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
                    Focus-Window $targetHwnd $targetPid
                    Start-Sleep -Milliseconds 200
                    # Select/click the WhatsApp tab so we don't open a duplicate tab
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
    Focus-Window $targetHwnd $targetPid
    Start-Sleep -Milliseconds 450
} else {
    # Open WhatsApp Web in Chrome
    $chromeExe = Find-ChromeExe
    if ($chromeExe) {
        Start-Process $chromeExe -ArgumentList "--force-renderer-accessibility", "https://web.whatsapp.com"
    } else {
        Start-Process "https://web.whatsapp.com"
    }

    # Wait up to 15s for the Chrome window with WhatsApp title to appear
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Milliseconds 500
        $p = Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -match 'WhatsApp' } | Select-Object -First 1
        if ($p) {
            $targetHwnd = $p.MainWindowHandle
            $targetPid = $p.Id
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

    Focus-Window $targetHwnd $targetPid
    # Wait for WhatsApp Web to finish syncing/rendering its chat list
    Start-Sleep -Milliseconds 6800
}

if ($Action -eq "open" -or [string]::IsNullOrWhiteSpace($Contact)) {
    Write-Output '{"ok":true,"action":"open"}'
    exit 0
}

# Ensure window is focused and wake up Chrome UI Automation tree
Focus-Window $targetHwnd $targetPid
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
        # Look for the Search input or button in the left pane of WhatsApp Web
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
    # Click inside the left pane so keyboard focus is definitely inside the WhatsApp Web webpage (not Chrome address bar)
    $safeX = [int]($winRect.Left + 210)
    $safeY = [int]($winRect.Top + 150)
    [WaWin32]::ClickAt($safeX, $safeY)
    Start-Sleep -Milliseconds 150
}

# Press Escape to clear any previous search/modal, then Ctrl+Alt+/ (WhatsApp Web's built-in Focus Search shortcut)
[WaWin32]::TapKey([WaWin32]::VK_ESCAPE)
Start-Sleep -Milliseconds 150
[WaWin32]::CtrlAltSlash()
Start-Sleep -Milliseconds 320

# Clear any leftover text in the search box
[WaWin32]::CtrlKey([WaWin32]::VK_A)
Start-Sleep -Milliseconds 80
[WaWin32]::TapKey([WaWin32]::VK_BACK)
Start-Sleep -Milliseconds 120

# 3. Paste Contact Name and open the top matching chat
[System.Windows.Forms.Clipboard]::SetText($Contact.Trim())
Start-Sleep -Milliseconds 80
[WaWin32]::CtrlKey([WaWin32]::VK_V)

# Wait for WhatsApp Web to filter the contact list
Start-Sleep -Milliseconds 1400

# Press Enter directly in the search box (WhatsApp Web immediately opens the #1 result and focuses the message input box)
[WaWin32]::TapKey([WaWin32]::VK_RETURN)

# Wait for the chat pane and message composer to open
Start-Sleep -Milliseconds 950

# 4A. Send Message
if ($Action -eq "send" -and -not [string]::IsNullOrWhiteSpace($Message)) {
    # If UI Automation finds the message box ("Ketik pesan" / "Type a message"), click it to be 100% sure it's focused
    if ($rootEl -ne $null -and $winRect -ne $null) {
        try {
            $editCond = New-Object System.Windows.Automation.PropertyCondition(
                [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                [System.Windows.Automation.ControlType]::Edit
            )
            $edits = $rootEl.FindAll([System.Windows.Automation.TreeScope]::Descendants, $editCond)
            foreach ($ed in $edits) {
                $er = $ed.Current.BoundingRectangle
                $en = "$($ed.Current.Name)"
                if ($er.Top -gt ($winRect.Bottom - 180) -and $er.Left -gt ($winRect.Left + 300)) {
                    [WaWin32]::ClickAt([int]($er.Left + 80), [int]($er.Top + $er.Height / 2))
                    Start-Sleep -Milliseconds 120
                    break
                }
            }
        } catch {}
    }

    [System.Windows.Forms.Clipboard]::SetText($Message.Trim())
    Start-Sleep -Milliseconds 100
    [WaWin32]::CtrlKey([WaWin32]::VK_V)
    Start-Sleep -Milliseconds 350
    [WaWin32]::TapKey([WaWin32]::VK_RETURN)

    Write-Output '{"ok":true,"action":"send"}'
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
                # Match call button in the chat header (top-right area of WhatsApp)
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

            # If a secondary dropdown/confirmation button appears (e.g. "Voice call" / "Panggilan suara"), click it too
            if ($callClicked) {
                Start-Sleep -Milliseconds 650
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

Write-Output '{"ok":true}'
