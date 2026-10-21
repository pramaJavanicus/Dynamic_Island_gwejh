# ---------------------------------------------------------------------------
# Dynamic Island - system stats bridge
# (temperature, CPU load, Bluetooth battery, Master Volume, Network Speed)
# Usage: sysinfo.ps1 [intervalSeconds]
#   stdout -> one JSON object per sample
#   stdin  <- "refresh" | "vol:<0-100>" | "mute:toggle" | "mute:0" | "mute:1"
# ---------------------------------------------------------------------------
param([int]$Interval = 10)
$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8

Add-Type -TypeDefinition @"
using System;
using System.Net.NetworkInformation;
using System.Runtime.InteropServices;

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
    int RegisterControlChangeNotify(IntPtr pNotify);
    int UnregisterControlChangeNotify(IntPtr pNotify);
    int GetChannelCount(out int pnChannelCount);
    int SetMasterVolumeLevel(float fLevelDB, ref Guid pguidEventContext);
    int SetMasterVolumeLevelScalar(float fLevel, ref Guid pguidEventContext);
    int GetMasterVolumeLevel(out float pfLevelDB);
    int GetMasterVolumeLevelScalar(out float pfLevel);
    int SetChannelVolumeLevel(uint nChannel, float fLevelDB, ref Guid pguidEventContext);
    int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, ref Guid pguidEventContext);
    int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
    int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, ref Guid pguidEventContext);
    int GetMute([MarshalAs(UnmanagedType.Bool)] out bool pbMute);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
    int Activate(ref Guid id, int clsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
}

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IntPtr ppDevices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppEndpoint);
}

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class MMDeviceEnumeratorComObject { }

public static class SysAudioNet {
    [DllImport("user32.dll")]
    private static extern short GetAsyncKeyState(int vKey);

    private static bool wasZeroDown = false;

    public static bool CheckZeroHotkey() {
        bool shift = (GetAsyncKeyState(0x10) & 0x8000) != 0;
        bool ctrl  = (GetAsyncKeyState(0x11) & 0x8000) != 0;
        bool alt   = (GetAsyncKeyState(0x12) & 0x8000) != 0;
        bool zeroDown = ((GetAsyncKeyState(0x30) & 0x8000) != 0) || ((GetAsyncKeyState(0x60) & 0x8000) != 0);

        if (zeroDown && !wasZeroDown && !shift && !ctrl && !alt) {
            wasZeroDown = true;
            return true;
        }
        if (!zeroDown) {
            wasZeroDown = false;
        }
        return false;
    }

    private static IAudioEndpointVolume GetEp() {
        var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
        IMMDevice dev;
        if (enumerator.GetDefaultAudioEndpoint(0, 1, out dev) != 0 || dev == null) return null;
        Guid iid = typeof(IAudioEndpointVolume).GUID;
        object epObj;
        if (dev.Activate(ref iid, 23, IntPtr.Zero, out epObj) != 0 || epObj == null) return null;
        return (IAudioEndpointVolume)epObj;
    }

    public static int GetVolume() {
        try {
            var ep = GetEp();
            if (ep == null) return 50;
            float v;
            ep.GetMasterVolumeLevelScalar(out v);
            return (int)Math.Round(v * 100.0f);
        } catch { return 50; }
    }

    public static bool GetMute() {
        try {
            var ep = GetEp();
            if (ep == null) return false;
            bool m;
            ep.GetMute(out m);
            return m;
        } catch { return false; }
    }

    public static void SetVolume(int pct) {
        try {
            var ep = GetEp();
            if (ep == null) return;
            float v = Math.Max(0f, Math.Min(1f, pct / 100.0f));
            Guid g = Guid.Empty;
            ep.SetMasterVolumeLevelScalar(v, ref g);
            if (pct > 0) ep.SetMute(false, ref g);
        } catch { }
    }

    public static void SetMute(bool mute) {
        try {
            var ep = GetEp();
            if (ep == null) return;
            Guid g = Guid.Empty;
            ep.SetMute(mute, ref g);
        } catch { }
    }

    private static long lastRx = -1;
    private static long lastTx = -1;
    private static long lastTick = 0;
    private static long cachedDown = 0;
    private static long cachedUp = 0;

    public static long[] SampleNetSpeed() {
        long now = Environment.TickCount & Int32.MaxValue;
        double dt = (now - lastTick) / 1000.0;
        if (lastRx >= 0 && dt >= 0 && dt < 0.45) {
            return new long[] { cachedDown, cachedUp };
        }
        long rx = 0, tx = 0;
        try {
            foreach (var ni in NetworkInterface.GetAllNetworkInterfaces()) {
                if (ni.OperationalStatus != OperationalStatus.Up) continue;
                if (ni.NetworkInterfaceType == NetworkInterfaceType.Loopback || ni.NetworkInterfaceType == NetworkInterfaceType.Tunnel) continue;
                var st = ni.GetIPStatistics();
                rx += st.BytesReceived;
                tx += st.BytesSent;
            }
        } catch { }
        if (lastRx < 0 || dt <= 0) {
            lastRx = rx; lastTx = tx; lastTick = now;
            return new long[] { cachedDown, cachedUp };
        }
        cachedDown = (long)Math.Max(0, Math.Round((rx - lastRx) / dt));
        cachedUp   = (long)Math.Max(0, Math.Round((tx - lastTx) / dt));
        lastRx = rx; lastTx = tx; lastTick = now;
        return new long[] { cachedDown, cachedUp };
    }
}

public static class BtCfg {
    [StructLayout(LayoutKind.Sequential)]
    public struct DEVPROPKEY {
        public Guid fmtid;
        public uint pid;
    }

    [DllImport("CfgMgr32.dll", CharSet = CharSet.Unicode)]
    public static extern int CM_Locate_DevNodeW(out uint pdnDevInst, string pDeviceID, int ulFlags);

    [DllImport("CfgMgr32.dll", CharSet = CharSet.Unicode)]
    public static extern int CM_Get_DevNode_PropertyW(
        uint dnDevInst,
        ref DEVPROPKEY PropertyKey,
        out uint PropertyType,
        byte[] PropertyBuffer,
        ref uint PropertyBufferSize,
        int ulFlags);

    private static DEVPROPKEY KEY_BATT = new DEVPROPKEY { fmtid = new Guid("104EA319-6EE2-4701-BD47-8DDBF425BBE5"), pid = 2 };
    private static DEVPROPKEY KEY_CONN = new DEVPROPKEY { fmtid = new Guid("83DA6326-97A6-4088-9453-A1923F573B29"), pid = 15 };
    private static DEVPROPKEY KEY_CID  = new DEVPROPKEY { fmtid = new Guid("8C7ED206-3F8A-4827-B3AB-AE9E1FAEFC6C"), pid = 2 };

    public static int GetBattery(string instanceId) {
        uint devInst;
        if (CM_Locate_DevNodeW(out devInst, instanceId, 0) != 0) return -1;
        uint propType, size = 4;
        byte[] buf = new byte[4];
        if (CM_Get_DevNode_PropertyW(devInst, ref KEY_BATT, out propType, buf, ref size, 0) == 0 && size >= 1) {
            return buf[0];
        }
        return -1;
    }

    public static bool IsConnected(string instanceId) {
        uint devInst;
        if (CM_Locate_DevNodeW(out devInst, instanceId, 0) != 0) return false;
        uint propType, size = 4;
        byte[] buf = new byte[4];
        if (CM_Get_DevNode_PropertyW(devInst, ref KEY_CONN, out propType, buf, ref size, 0) == 0 && size >= 1) {
            return buf[0] != 0;
        }
        return false;
    }

    public static string GetContainerId(string instanceId) {
        uint devInst;
        if (CM_Locate_DevNodeW(out devInst, instanceId, 0) != 0) return null;
        uint propType, size = 16;
        byte[] buf = new byte[16];
        if (CM_Get_DevNode_PropertyW(devInst, ref KEY_CID, out propType, buf, ref size, 0) == 0 && size == 16) {
            return new Guid(buf).ToString();
        }
        return null;
    }
}
"@

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$script:asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
        $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    })[0]
function Await($op, [Type]$type) {
    $task = $script:asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
    $null = $task.Wait(-1)
    return $task.Result
}
$null = [Windows.Devices.Enumeration.DeviceInformation, Windows.Devices.Enumeration, ContentType = WindowsRuntime]
$emptyProps = [System.Collections.Generic.List[string]]@()

$script:tempSource = $null
$script:nextTempProbe = (Get-Date).AddSeconds(20)
$script:emaTemp = 45.0

function Get-TempFromLHM {
    foreach ($ns in 'root/LibreHardwareMonitor', 'root/OpenHardwareMonitor') {
        try {
            $s = Get-CimInstance -Namespace $ns -ClassName Sensor -Filter "SensorType='Temperature'" -ErrorAction Stop |
                Where-Object { $_.Name -match 'CPU Package|Tctl|Tdie|Core Average|CPU Core' } |
                Sort-Object { if ($_.Name -match 'Package|Tctl|Tdie') { 0 } else { 1 } } | Select-Object -First 1
            if ($s) { return [double]$s.Value }
        }
        catch {}
    }
    return $null
}

function Get-TempFromPerf {
    $z = Get-CimInstance Win32_PerfFormattedData_Counters_ThermalZoneInformation -ErrorAction SilentlyContinue
    $t = $z | ForEach-Object { if ($_.HighPrecisionTemperature) { $_.HighPrecisionTemperature / 10 - 273.15 } elseif ($_.Temperature) { $_.Temperature - 273.15 } } |
        Where-Object { $_ -gt 5 -and $_ -lt 120 } | Measure-Object -Maximum
    if ($t.Count) { return [double]$t.Maximum }
    return $null
}

function Get-TempFromAcpi {
    try {
        $z = Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction Stop
        $t = $z | ForEach-Object { $_.CurrentTemperature / 10 - 273.15 } | Where-Object { $_ -gt 5 -and $_ -lt 120 } | Measure-Object -Maximum
        if ($t.Count) { return [double]$t.Maximum }
    }
    catch {}
    return $null
}

function Get-CpuMetrics {
    try {
        $p = Get-CimInstance Win32_PerfFormattedData_Counters_ProcessorInformation -Filter "Name='_Total'" -ErrorAction Stop
        return @{
            load = [int][math]::Min(100, [math]::Max(0, $p.PercentProcessorTime))
            perf = [int][math]::Max(50, $p.PercentProcessorPerformance)
        }
    }
    catch {
        try {
            $p2 = Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'" -ErrorAction Stop
            return @{ load = [int]$p2.PercentProcessorTime; perf = 100 }
        }
        catch {
            return @{ load = 15; perf = 100 }
        }
    }
}

function Get-Temperature([hashtable]$cpu) {
    if ($null -eq $script:tempSource -and (Get-Date) -ge $script:nextTempProbe) {
        foreach ($src in @('lhm', 'perf', 'acpi')) {
            $v = switch ($src) { 'lhm' { Get-TempFromLHM } 'perf' { Get-TempFromPerf } 'acpi' { Get-TempFromAcpi } }
            if ($null -ne $v) {
                $script:tempSource = $src
                return [int][math]::Round($v)
            }
        }
        $script:tempSource = $null
        $script:nextTempProbe = (Get-Date).AddSeconds(60)
    }
    elseif ($script:tempSource) {
        $v = switch ($script:tempSource) { 'lhm' { Get-TempFromLHM } 'perf' { Get-TempFromPerf } 'acpi' { Get-TempFromAcpi } }
        if ($null -ne $v) { return [int][math]::Round($v) }
        $script:tempSource = $null
    }

    $boostFactor = [math]::Max(0, ($cpu.perf - 80) / 100.0) * 6.0
    $target = 41.0 + ($cpu.load * 0.36) + $boostFactor
    $script:emaTemp = ($script:emaTemp * 0.65) + ($target * 0.35)
    return [int][math]::Round($script:emaTemp)
}

function Get-BluetoothBatteries {
    $list = New-Object System.Collections.ArrayList
    $aqs = 'System.Devices.Present:=System.StructuredQueryType.Boolean#True'
    $nodes = Await ([Windows.Devices.Enumeration.DeviceInformation]::FindAllAsync($aqs, $emptyProps,
            [Windows.Devices.Enumeration.DeviceInformationKind]::Device)) ([Windows.Devices.Enumeration.DeviceInformationCollection])

    $containers = @{}
    foreach ($n in $nodes) {
        $id = $n.Id
        if ($id -notlike 'BTH*' -and $id -notlike '*MMDEVAPI*') { continue }
        $cid = [BtCfg]::GetContainerId($id)
        if (-not $cid -or $cid -eq '00000000-0000-0000-ffff-ffffffffffff' -or $cid -eq '00000000-0000-0000-0000-000000000000') { continue }

        if (-not $containers.ContainsKey($cid)) {
            $containers[$cid] = @{ name = $null; connected = $false; battery = $null }
        }
        $entry = $containers[$cid]
        $conn = [BtCfg]::IsConnected($id)
        $batt = [BtCfg]::GetBattery($id)

        if ($conn -and ($id -like 'BTH*' -or $id -like '*MMDEVAPI*')) {
            $entry.connected = $true
            if ($id -match '^BTH(ENUM|LE)\\Dev_' -and $n.Name) {
                $entry.name = $n.Name.Trim()
            }
        }
        if (-not $entry.name -and $n.Name) {
            $clean = ($n.Name -replace '^(Headphones|Headset)\s*\((.*)\)$', '$2' -replace '\s+(Hands-Free( AG)?( Audio)?|Stereo|Avrcp Transport|A2DP.*|AG Audio|LE)$', '').Trim()
            if ($clean -and $clean -notmatch 'Enumerator|RFCOMM|Adapter|Transport|Intel|Microsoft|Personal Area') {
                $entry.name = $clean
            }
        }
        if ($batt -ge 0) {
            if ($null -eq $entry.battery -or $batt -gt $entry.battery) {
                $entry.battery = $batt
            }
        }
    }

    foreach ($c in ($containers.Values | Where-Object { $_.connected -and $_.name } | Sort-Object { $_.name })) {
        $null = $list.Add([ordered]@{
            name    = $c.name
            battery = $c.battery
        })
    }
    return ,$list
}

# Initial network baseline
$null = [SysAudioNet]::SampleNetSpeed()

$script:cachedTemp = 45
$script:cachedCpu = 12
$script:cachedBt = @()

function Update-HeavyStats {
    $cpu = Get-CpuMetrics
    $script:cachedCpu = $cpu.load
    $script:cachedTemp = Get-Temperature $cpu
}

function Get-FullPayload {
    try {
        $bt = Get-BluetoothBatteries
        $script:cachedBt = $bt.ToArray()
    } catch {}
    $net = [SysAudioNet]::SampleNetSpeed()
    $vol = [SysAudioNet]::GetVolume()
    $muted = [SysAudioNet]::GetMute()
    return [ordered]@{
        temp       = $script:cachedTemp
        tempSource = if ($script:tempSource) { $script:tempSource } else { 'cpu-thermal' }
        cpu        = $script:cachedCpu
        bluetooth  = $script:cachedBt
        volume     = $vol
        muted      = $muted
        netDown    = $net[0]
        netUp      = $net[1]
        ts         = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    }
}

$reader = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), $utf8)
$readTask = $reader.ReadLineAsync()
$nextHeavySample = [DateTime]::MinValue
$nextFastSample = [DateTime]::MinValue

while ($true) {
    $emitImmediate = $false
    if ($readTask.IsCompleted) {
        if ($null -eq $readTask.Result) { break }
        $cmd = $readTask.Result.Trim()
        if ($cmd -eq 'refresh') {
            $nextHeavySample = [DateTime]::MinValue
            $nextFastSample = [DateTime]::MinValue
        }
        elseif ($cmd -like 'vol:*') {
            $v = 0
            if ([int]::TryParse($cmd.Substring(4), [ref]$v)) {
                [SysAudioNet]::SetVolume($v)
                $emitImmediate = $true
            }
        }
        elseif ($cmd -like 'mute:*') {
            $arg = $cmd.Substring(5)
            if ($arg -eq 'toggle') {
                [SysAudioNet]::SetMute((-not [SysAudioNet]::GetMute()))
            } else {
                [SysAudioNet]::SetMute(($arg -eq '1' -or $arg -eq 'true'))
            }
            $emitImmediate = $true
        }
        $readTask = $reader.ReadLineAsync()
    }

    if ([SysAudioNet]::CheckZeroHotkey()) {
        [Console]::Out.WriteLine('{"hotkey":"jarvis"}')
        [Console]::Out.Flush()
    }

    $now = Get-Date
    if ($now -ge $nextHeavySample) {
        $nextHeavySample = $now.AddSeconds($Interval)
        try { Update-HeavyStats } catch {}
        $emitImmediate = $true
    }

    if ($emitImmediate -or $now -ge $nextFastSample) {
        $nextFastSample = $now.AddSeconds(2)
        try { $json = Get-FullPayload | ConvertTo-Json -Compress -Depth 4 }
        catch { $json = (@{ error = $_.Exception.Message } | ConvertTo-Json -Compress) }
        [Console]::Out.WriteLine($json)
        [Console]::Out.Flush()
    }
    Start-Sleep -Milliseconds 45
}
