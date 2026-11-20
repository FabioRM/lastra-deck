# Battery and power

Open **Apps → Battery and power** to check charge percentage, estimated runtime, and charging or discharging power in watts when Windows reports it. Lastra lists up to five recent power changes observed during the current session. Windows reports a combined reading for the system battery when it has one.

Open **Stats → Power** for CPU and GPU load in percent beside watt readings and their histories. CPU watts come from a recognized package sensor. GPU watts use a recognized power sensor on the same GPU as the load reading. The overview adds a watt badge to CPU or GPU load when its source can be identified. These measurements are separate from battery charge and whole-PC power.

Choose **Load and watts** to overlay both series on the same time axis. The load series uses 0–100 percent. The dashed power series uses a separate watt scale shown in the legend. Missing watt samples leave gaps. **Separate readings** shows one chart per metric.

The view reads power status every four seconds while visible. Lastra listens for Windows power events and makes no changes to power plans or devices.

## Optional UPS source

If a UPS tool can export a status snapshot, have it write `ups-status.json` in the Lastra application data folder. The optional reading uses the existing file and starts no extra monitor. The tool that writes the file remains responsible for collecting readings from the UPS.

```json
{
  "version": 1,
  "source": "ac",
  "percent": 96,
  "watts": 185.4,
  "remainingSeconds": 2400,
  "sampledAt": "2026-11-19T12:00:00.000Z"
}
```

Use `ac`, `battery`, or `unknown` for `source` and the actual sample time for `sampledAt`. Charge, runtime and measured output watts are optional. Write to a temporary file and replace the status file when a new sample is ready. Readings older than two minutes appear as stale.

[Windows system power status](https://learn.microsoft.com/windows/win32/api/winbase/nf-winbase-getsystempowerstatus) · [Battery charge and discharge rate](https://learn.microsoft.com/windows/win32/api/winnt/ns-winnt-system_battery_state)
