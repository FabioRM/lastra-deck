using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Threading;
using System.Web.Script.Serialization;
using LibreHardwareMonitor.Hardware;

internal static class Program
{
    // This build uses the Windows physical drive number in /nvme, /ssd and /hdd sensor identifiers.
    private const string VerifiedStorageBuild = "0.9.6+3d331e3370efb858411f19511373eff65a218701";

    private static int Main(string[] args)
    {
        string libraryDirectory = args[0];
        AppDomain.CurrentDomain.AssemblyResolve += (_, request) =>
        {
            var file = Path.Combine(libraryDirectory, new AssemblyName(request.Name).Name + ".dll");
            return File.Exists(file) ? Assembly.LoadFrom(file) : null;
        };

        int interval = ParseInterval(args.Length > 1 ? args[1] : null);
        if (interval == 0) interval = 2000;
        using (var parentGone = new ManualResetEvent(false))
        using (var intervalChanged = new AutoResetEvent(false))
        {
            // The parent can adjust the cadence without reopening the sensors.
            // An end of file also stops the helper after its parent exits.
            var watchParent = new Thread(() =>
            {
                try
                {
                    string line;
                    while ((line = Console.ReadLine()) != null)
                    {
                        int next = ParseInterval(line);
                        if (next != 0 && Interlocked.Exchange(ref interval, next) != next) intervalChanged.Set();
                    }
                    parentGone.Set();
                }
                catch (ObjectDisposedException) { }
                catch (IOException)
                {
                    try { parentGone.Set(); } catch (ObjectDisposedException) { }
                }
            });
            watchParent.IsBackground = true;
            watchParent.Start();
            try
            {
                ReportSensors(new WaitHandle[] { parentGone, intervalChanged }, () => Volatile.Read(ref interval));
                return 0;
            }
            catch (Exception error)
            {
                Console.Error.WriteLine(error.Message);
                return 1;
            }
        }
    }

    private static int ParseInterval(string value)
    {
        int parsed;
        return int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out parsed)
            && (parsed == 2000 || parsed == 5000 || parsed == 10000) ? parsed : 0;
    }

    [MethodImpl(MethodImplOptions.NoInlining)]
    private static void ReportSensors(WaitHandle[] wake, Func<int> getInterval)
    {
        var computer = new Computer
        {
            IsCpuEnabled = true, IsGpuEnabled = true, IsMemoryEnabled = true,
            IsStorageEnabled = true, IsMotherboardEnabled = true, IsControllerEnabled = true
        };
        var json = new JavaScriptSerializer();
        var build = (AssemblyInformationalVersionAttribute)Attribute.GetCustomAttribute(
            typeof(Computer).Assembly, typeof(AssemblyInformationalVersionAttribute));
        var storageNumbersVerified = build != null && build.InformationalVersion == VerifiedStorageBuild;
        try
        {
            computer.Open();
            var cpu = computer.Hardware.FirstOrDefault(device => device.HardwareType == HardwareType.Cpu);
            var gpu = computer.Hardware
                .Where(device => device.HardwareType == HardwareType.GpuNvidia ||
                                 device.HardwareType == HardwareType.GpuAmd ||
                                 device.HardwareType == HardwareType.GpuIntel)
                .OrderBy(device => device.HardwareType == HardwareType.GpuIntel)
                .FirstOrDefault();

            do
            {
                var devices = computer.Hardware.SelectMany(Walk).ToArray();
                foreach (var device in devices) device.Update();
                var cpuTemp = Read(cpu, SensorType.Temperature, "CPU Package", "Core (Tctl/Tdie)", "CPU (Tctl/Tdie)", "Core Max");
                var gpuLoad = Read(gpu, SensorType.Load, "GPU Core", "GPU D3D 3D");
                var gpuTemp = Read(gpu, SensorType.Temperature, "GPU Core", "GPU Temperature");
                var readings = (from device in devices
                                from sensor in device.Sensors
                                where Detailed(sensor)
                                select new
                                {
                                    id = sensor.Identifier.ToString(), device = device.Name,
                                    kind = device.HardwareType.ToString(), type = sensor.SensorType.ToString(),
                                    name = sensor.Name, value = Finite(sensor.Value)
                                }).Take(256).ToArray();
                Console.WriteLine(json.Serialize(new
                {
                    gpu = Finite(gpuLoad / 100), gpuDevice = gpu == null ? null : gpu.Identifier.ToString(),
                    cpuTemp = Finite(cpuTemp), gpuTemp = Finite(gpuTemp), readings, storageNumbersVerified
                }));
            } while (WaitHandle.WaitAny(wake, getInterval()) != 0);
        }
        finally
        {
            computer.Close();
        }
    }

    private static float? Read(IHardware device, SensorType type, params string[] names)
    {
        if (device == null) return null;
        var values = device.Sensors.Where(sensor => sensor.SensorType == type && sensor.Value.HasValue);
        foreach (var name in names)
        {
            var sensor = values.FirstOrDefault(value => name.Equals(value.Name, StringComparison.OrdinalIgnoreCase));
            if (sensor != null) return sensor.Value;
        }
        return null;
    }

    private static IEnumerable<IHardware> Walk(IHardware device)
    {
        yield return device;
        foreach (var child in device.SubHardware)
            foreach (var nested in Walk(child))
                yield return nested;
    }

    private static bool Detailed(ISensor sensor)
    {
        switch (sensor.SensorType.ToString())
        {
            case "Fan":
            case "Timing":
                return true;
            case "Clock":
            case "Power":
            case "Temperature":
            case "Load":
                return !sensor.Name.StartsWith("CPU Core #", StringComparison.OrdinalIgnoreCase)
                    || sensor.SensorType == SensorType.Clock;
            case "Data":
            case "SmallData":
            case "Throughput":
                return true;
            default:
                return false;
        }
    }

    private static float? Finite(float? value)
    {
        return value.HasValue && !float.IsNaN(value.Value) && !float.IsInfinity(value.Value) ? value : null;
    }
}
