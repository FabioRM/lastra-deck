# Lastra telemetry

The Deck side panel shows current CPU load, RAM usage, and GPU load as percentages. **N/A** indicates an unavailable reading. Add a **System metric** graph widget for load, memory, or temperature history. [Widget guide](widgets.md)

## Retained Stats history

Choose **Lastra → Settings → Stats → History and refresh options → Local Stats history** and select **1 hour** or **24 hours**. The feature starts off. Open **Stats → Overview** and use **History** to change the chart window. The long charts show averages of CPU, RAM, GPU load, and available temperatures. The headline readings show the latest provider values. Per-device charts cover the latest minute.

Lastra saves one-minute aggregates in `%APPDATA%\Lastra\telemetry-history.json`, up to 512 KiB. It reduces long charts to at most 60 points and leaves gaps for missing samples. Existing measurements are available on the next startup while history is enabled. **Off** stops collection and hides the longer ranges. Delete the history file while Lastra is closed to clear the saved measurements.

Lastra keeps up to 15 minutes of readings in memory. Gaps in a chart show when readings were unavailable. History starts again when Lastra restarts.

Lastra marks system readings as stale after 3 seconds. The stale threshold for LibreHardwareMonitor depends on the configured sampling interval. The last value stays visible with a stale indicator. If the managed process stops sending recent readings, Lastra can use the local HTTP server you already configured.

## Stats

Use the view switch to cycle **Deck Keys → Dashboard → Stats**. The header shows a clock and short date beside the group tabs. Open a group, then use **Device** to change devices or the arrows to see more readings. In portrait the tabs wrap beside the clock. Comparable charts share a scale and show the latest minute of samples. Cards show the measurement unit and source. A **Cached** card retains the last measured value and opens the original sample time when you select its label. An unavailable sensor shows **N/A**.

Stats hides unavailable readings by default. Turn on **Show unavailable** to see missing readings and the reason the source could not supply them. Readings explicitly placed in the Overview keep their positions when a sensor goes offline.

The desktop Stats settings list groups unavailable readings at the end in a different color. They can be selected and arranged like any other reading.

Key readouts and metric widgets mark retained values as **Cached** with the original update time. On keys, the full update time is in the tooltip and accessible description. Dashboard and media widgets show the update time beside a live or cached track. Cached playback time stays at the last verified position.

Use `npm start -- --preview=stats.png --verify-stats-layout` to check the header and readings with two GPUs, two monitors, and two volumes. The check runs with the default settings and with 125% text and high contrast. Add `--preview-portrait` to repeat the check at 720 × 2560. Use `--profile=<path>` to include that profile's persistent bar in the check.

Windows provides CPU load, RAM, display refresh rate, local fixed volume space and activity, and configured memory speed. LibreHardwareMonitor supplies supported CPU and GPU temperatures, clocks and power, GPU memory use, memory timings, disk temperatures, and fan speeds. Availability depends on the hardware and driver access.

### App frame performance

Open **Lastra → Settings → Stats** on the desktop to choose up to seven Overview readings. Search by metric, device, source, or unit. Clear the selection to build a new set, or select **Use default readings** and save to restore the original overview. A saved reading keeps its place and shows **N/A** while its sensor is unavailable.

Under **Overview layout**, drag cards or use the arrow buttons to reorder them. **Widen** gives a card two columns in Cards and Chart view. **Narrow** returns it to one column. Save to apply the layout. A dense custom layout can scroll, and card order carries over to Readings view.

Choose a line, filled area, step, bar, or point chart in the same settings. Bars and points plot observed samples individually and leave gaps when readings are missing. Save a default layout there or switch layouts with **Layout** on the deck for the current session. **Cards** balances values and charts, **Chart view** expands the histories, and **Readings view** displays the current values in rows. The **Power** group keeps CPU and GPU utilization and watts in separate charts. [Battery and power](power.md)

In **Stats → Storage**, choose a volume to see its capacity, free space, active time, read and write rates, and drive temperature. Lastra associates a temperature with a volume when Windows maps a basic partition to one direct disk and the supported managed LibreHardwareMonitor sensor reports the same disk number and model. A volume with an ambiguous or unavailable association shows **N/A** for temperature. Individual physical sensors remain available in Storage, including readings from the HTTP source when it exposes them. [Windows partition metadata](https://learn.microsoft.com/en-us/windows-hardware/drivers/storage/msft-partition) · [Supported LibreHardwareMonitor build](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/releases/tag/v0.9.6)

Open **Stats → Processes** to rank up to twelve Windows processes by CPU, private working set, or GPU engine use. CPU is shown as a share of the total capacity across logical processors. GPU is the busiest engine for that process and needs two samples from a supported Windows driver. The table includes the process ID so you can identify an entry in Task Manager. Lastra samples while the panel is open and keeps the readings in memory. [Windows performance counters](https://learn.microsoft.com/en-us/windows/win32/wmisdk/wmi-tasks--performance-monitoring) · [GPU use in Task Manager](https://devblogs.microsoft.com/directx/gpus-in-the-task-manager/)

Download the x64 **PresentMon Console Application** 2.6 or later from the official releases and set `LASTRA_PRESENTMON_EXE` to the full path of its executable in the environment used to start Lastra. Open Stats with a rendering app in the foreground. PresentMon samples that process in three-second windows while Stats is visible. FPS and frame times describe frames presented by the busiest swap chain of the foreground process. Windows requires permission to create an ETW session, typically membership in **Performance Log Users**. The view displays the capture error if permission is missing. [PresentMon releases](https://github.com/GameTechDev/PresentMon/releases)

## Hardware thresholds

Open **Apps → Hardware thresholds** and select **Edit thresholds** to configure sustained alerts. Lastra shows whether each rule is in range, confirming a violation, alerting, or missing a fresh reading. The configuration is stored as `hardware-thresholds.json` in Lastra's application data folder and reloads on save.

```json
{
  "version": 1,
  "rules": [
    { "id": "hot-gpu", "name": "High GPU temperature", "metric": "gpuTemp", "direction": "above", "limit": 85, "holdSeconds": 20 }
  ]
}
```

Use `cpu`, `ram`, or `gpu` for percentages from 0 to 100, or `cpuTemp` and `gpuTemp` for degrees Celsius. `above` and `below` include the limit. A rule must stay outside its range for the configured hold time, which defaults to 15 seconds. Repeated cached readings, missing sensors, and gaps cannot sustain a pending alert. The alert inbox groups repeated episodes and shows recovery after a fresh reading returns to range. [Alert inbox](service-health.md#alert-inbox)
