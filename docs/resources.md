# Lastra resource monitoring

Open **Apps**, search for **Lastra resources**, and select the view. Lastra samples process usage every two seconds by default while this view is visible. Sampling stops when you leave the view or the deck becomes hidden. It does not start either helper.

The **Lastra** row includes the main process, Chromium renderers, GPU process and utilities. CPU is the share of the logical processors available to Lastra and is calculated between samples. The first reading shows **Measuring…**. The working set estimates how much process memory is resident in RAM, and totals can count shared pages more than once.

**Hardware monitor** and **Windows media helper** show the helpers Lastra starts for LibreHardwareMonitor sensors and Windows media controls. An idle helper has its own **Inactive** indicator. An external LibreHardwareMonitor server, source applications and transient compilers are outside these readings.

## Refresh intervals

In **Lastra → Settings → Stats → History and refresh options**, choose **Refresh intervals** and select an interval for each source. Lastra saves these choices in `monitoring.json` in its application data folder.

| Source | Intervals | When it runs |
| --- | --- | --- |
| **Process usage** | 2, 5 or 10 seconds | While this app view is visible. |
| **Managed hardware** | 2, 5 or 10 seconds | While Lastra runs on the Edge. The helper adjusts without restarting. |
| **Hardware HTTP** | 2, 5 or 10 seconds | When managed readings are missing or stale and a local HTTP sensor source responds. Failed requests retry more slowly. |
| **Media updates** | 1, 2 or 3 seconds | While Dashboard, an app view, or a widget reads media. The Spotify widget keeps its 1.25-second default. |

The first interval in each row is the default. Lastra adjusts the stale-reading window to the hardware source's interval. The Windows audio, push-to-talk, CPU and RAM sampling cadence is independent. Service checks keep the intervals in [their own settings](service-health.md).
