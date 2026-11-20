# Conditional macros

## Repeat a key while held

Hold **Volume up** or **Volume down** to repeat. Lastra starts at the profile's long-press threshold and gradually shortens the gap between taps. Release the key or move away to stop.

For a single arrow, Page Up, Page Down or Ctrl-plus/minus zoom shortcut, open the key in the desktop profile editor and choose **Hold repeat → Repeat the tap**. **Automatic** repeats volume keys and leaves navigation and zoom as single taps. **One tap only** disables repeat for the selected key. Hold repeat is available for a single unconfirmed tap with **Ignore extra presses** selected.

## Reuse a parameterized macro

Open **Profile settings → Shared macros** in the editor. Choose **New macro**, edit its JSON definition, and select **Apply to draft**. Choose **Run shared macro** as a key action, pick the macro, and fill in the arguments for that key. A change to the shared definition applies to every call when you save the profile. The key keeps its own label, confirmation, and gestures.

```json
{
  "id": "camera-scene",
  "label": "Select a camera scene",
  "parameters": [
    { "id": "scene", "type": "string" },
    { "id": "pause", "type": "integer", "default": 150 }
  ],
  "action": {
    "type": "sequence",
    "steps": [
      { "type": "delay", "ms": { "parameter": "pause" } },
      { "type": "obs-scene", "scene": { "parameter": "scene" } }
    ]
  }
}
```

A parameter accepts a `string`, `integer`, or `boolean`. Omit `default` to require an argument at every call. A reference replaces a supported action value in full. Use a reference for values such as a delay, target path, text, scene name, a condition's expected value, or a nested macro argument. Action types, condition names, target-app rules, and shortcut guards use literal values. Lastra validates the expanded actions and their confirmation and retry requirements before saving. Circular calls are rejected.

In the profile JSON, the library is `macros` and each call has the shape `{ "type": "macro", "macro": "camera-scene", "args": { "scene": "Wide shot" } }`. Duplicating a key inside the current profile keeps the call. Clipboard copies carry the expanded actions so another profile can paste them without the library.

## Calculate values with scoped variables

Open **Profile variables** in Profile settings, **Page variables** in the selected page's settings, or **Run variables** in a key's inspector. Each definition has an `id`, a `type` (`string`, `integer`, or `boolean`), and a literal or calculated `value`. Every reference names its scope. Profile variables are available across the deck. Page variables can also read profile variables. Each key gesture gets a fresh run scope with access to its page and profile. Persistent bar keys use profile and run variables. Shared actions in linked controls use profile variables so every placement keeps the same behavior. Placement labels and icons can still use their own variables.

For example, add a profile variable named `transition` with type `integer` and value `200`. In the key's **Delay in milliseconds** field, open **Expression** and enter the following JSON to add 50 milliseconds to the saved transition time.

```json
{
  "expression": {
    "op": "add",
    "args": [{ "scope": "profile", "var": "transition" }, 50]
  }
}
```

Use **Preview value** to see `250` before selecting **Apply to draft**. The inspector shows the computed value or the reason it is unavailable. Use **Use literal value** to return to the ordinary input. Expressions can supply key labels and icon names, launch arguments, shortcut chords, timeouts, the expected values in waits and conditions, and shared macro arguments. The selected action type, condition source, and shortcut guard stay literal. The saved gesture uses the computed values and the normal validation, target and confirmation checks.

Supported operators are `concat`, `to-string`, `add`, `subtract`, `multiply`, `divide`, `modulo`, `less-than`, `equal`, `not`, `and`, `or`, and `if`. Arithmetic uses safe integers and `divide` rounds toward zero. `equal` and the two result branches of `if` require matching types. `concat` takes two to twelve strings. Use `to-string` to include numbers or booleans in a label. Missing references, cycles, invalid operand types, and out-of-range results produce an error. Clipboard copies carry the calculated values as literals so they can be pasted into another profile.

## Conditions and step policies

Open **Live variables** in the editor toolbar to search current Windows audio, OBS, telemetry, and Windows media readings. The table shows the provider and the last sample time where available. Select a key or widget before opening it to preview its configured reading. The read-only inspector shares the deck's provider samples and marks stale or unavailable values.

In the profile editor, choose a key's **Type** or **Browse actions**. Add a **Sequence** to run several steps in order.

- **Wait for state** waits for the selected Windows or OBS condition. Set a timeout from 100 to 30,000 milliseconds. The default is five seconds. A timed-out step reports the condition it was waiting for.
- **If / else** runs **If matched** when a condition is true. Add **Otherwise** to run a different action when it is false. If the source cannot report its state, the action reports an error.
- **If this step fails** sets how an individual sequence step responds. It can stop the macro, continue and report the skipped error, or retry a wait or program launch up to three total attempts. A launch is only retried after it reports failure before startup.

Conditions include the foreground executable, mute state for the default speakers and the microphone group, OBS connection, program scene, recording, and streaming. A microphone group is muted when Windows confirms mute for every active input. OBS scene and output conditions use the live OBS connection.

Select a key in the editor and choose **Test key**. Select its gesture and set any required sample states. **Simulate** checks the draft, evaluates branches, and shows each step's outcome, including skipped branches and retry attempts. Delays and timeouts use a virtual clock. Simulation leaves files, apps, and devices untouched. To review a live run, use the saved key from the deck and open **Apps → Action history → Step results**.

## Follow or stop a running macro

Tap the key's running indicator to see the current step, repeat iteration and retry attempt. Select **Stop macro** to end an active local delay or state wait and skip later steps. While a choice is open, select **Cancel** to stop the macro. Lastra also drops a queued press of the same key.

An operation already underway can still finish. Its actual result remains in **Step results**. If it was the final step, the macro reports its outcome. A stopped macro shows completed, stopped and skipped steps separately.

## Repeat a block of steps

Choose **Bounded repeat** and add the steps to run in each iteration. Set a maximum of 1 to 10 iterations and a timeout. **Fixed count** runs each iteration. **While condition matches** checks the selected Windows or OBS value before starting each iteration and finishes early when it differs from the expected value. The editor checks the limit of 100 step attempts per repeat, including retries.

The key badge shows the current iteration. Open the badge and tap **Stop repeat** to end the run and clear its queued press. The deck also ends the run when the page, view, target window, or Windows session changes. The editor simulator and **Action history** show which iteration reached each step.

## Choose the next action on the deck

Choose **Ask for a choice** in the editor. Enter the prompt, set a timeout, and define two to six buttons with an action for each one. The chosen action runs before the macro moves to the next step. A choice can contain a sequence of steps. To test a draft, select a sample answer in **Test key** and run **Simulate**.

The deck keeps keyboard focus in the target app while the prompt is open. **Cancel**, a timeout, or a change of foreground window, deck view, page, or Windows session ends the macro before it can continue. Action history identifies the selected branch and the branches it skipped.

## Run a random action

Choose **Random action** in the editor and add 2 to 10 options. Each press runs one option picked at random. Turn on **Never run the same option twice in a row** to exclude the previous pick. Lastra remembers the last pick for each random action until it restarts.

The picked action runs with its own target checks, and a shortcut that asks for confirmation makes the key ask before any option runs. The result reads **Ran option 2 of 3**, and **Action history** lists the picked option and the ones it skipped. An option can be a sequence, a condition, or another random action, up to three levels deep.

In JSON, set `type` to `random`, give it a stable `id`, and list the actions in `pool`. Add `"avoidRepeat": true` to exclude the previous pick. An offline gesture simulation accepts a `seed` from 0 to 4294967295 and then makes the same picks every time, so a saved fixture replays one known option. Without a seed the simulation picks as the deck does.
