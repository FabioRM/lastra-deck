# Timers and stopwatches

Lastra runs up to 12 named countdowns and stopwatches at once. They keep time by the Windows clock, so a countdown ends on time after sleep and keeps running while Lastra is closed. Timers are saved in `%APPDATA%\Lastra\timers.json`. The Dashboard **Pomodoro** is separate and keeps its own rounds. [Pomodoro](pomodoro.md)

Open **Deck Keys → Tools** for 1-, 5-, 15-, and 30-minute countdowns, a stopwatch, and the shared Pomodoro controls.

## Start a timer from a key

In the editor, choose **Timer** as a key's action. Enter a name, choose **Countdown** or **Stopwatch**, and set the minutes and seconds for a countdown. A countdown lasts from 1 second to 24 hours.

**When pressed** sets what the key does.

| Setting | Effect |
| --- | --- |
| **Start, pause or resume** | Starts the timer. Further presses pause and resume it. A press on a finished countdown dismisses it. |
| **Start again from the beginning** | Starts the timer from its full duration, also while it is running. |
| **Remove the timer** | Removes the timer in any state. |

Assign two of these to **Tap** and **Long press** to pause with a tap and start again with a hold.

The key shows **Ready**, **Running**, **Paused**, or **Finished** with the time, for example **Running · 2:39 left**. Set the key's **Key value** to **Off** to show the state only. Two keys with the same timer ID control the same timer.

In JSON, set `type` to `timer` and give the timer a stable `id` and a `label`. A countdown needs `durationMs`. Add `"kind": "stopwatch"` for a stopwatch, which has no duration. The optional `command` is `toggle`, `restart`, or `remove`.

```json
{ "id": "tea", "label": "Tea", "icon": "timer", "action": { "type": "timer", "id": "tea", "label": "Tea", "durationMs": 180000 } }
```

## Follow timers in a widget

Add the **Timers** widget to a page or the persistent bar. It lists every timer with its time. Tap **Ⅱ** or **▶** to pause or resume a timer and **✕** to remove it or to dismiss a finished one. **+ 5 min** starts a countdown and **+ Stopwatch** starts a stopwatch. Set **Quick countdown (minutes)** in the widget settings to change the length from 1 to 180 minutes.

View-only mode keeps the readings and disables the controls.

## When a countdown ends

The timer reads **Finished** on its key and in the widget until you dismiss it or start it again. Lastra adds an alert named after the timer to the **Alert inbox**, and the **Apps** badge counts it until you acknowledge it. A countdown that ended while Lastra was closed raises its alert at the next start. Dismissing the timer marks the alert as recovered. [Navigation badges](navigation-badges.md)

The idle screen lists each timer under the clock with its remaining or elapsed time. [Idle screen](idle-screen.md)
