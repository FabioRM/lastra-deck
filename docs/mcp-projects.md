# Agent project inventory

In the Lastra tray, issue a client grant for **Project and development inventory** while the intended activity is active. `project_inventory` reads configured desktop Projects and pinned Windows Terminal commands for that activity grant. It reports the source status and sample time along with configured destination types, associated commands, active elapsed time, and the last exit result.

```json
{
  "section": "all",
  "limit": 16
}
```

Use `section` to list `projects`, `commands`, or both with `all`. Pass a project alias as `project` to filter the listing. Continue a partial result using `nextCursor` with the same options. If the inventory changes, start a fresh listing. Aliases are specific to the client, activity, and Lastra session.

Pass `metadata: true` when you need the configured display labels. Lastra removes paths and links from labels. The command records carry status, exit code, duration in milliseconds and an indication of whether a log is available in the local Terminal view. Folder locations, command lines, URLs and log contents stay in the desktop app. Use the normal Apps view to open destinations and run or stop configured commands. [Configure Projects](projects.md) · [Configure Windows Terminal commands](app-views.md#windows-terminal-and-shells)

## Request a registered command

Grant **Project and development inventory and Request registered project commands** while the intended activity is active. A configured command needs an absolute path to a local Windows `.exe` and an existing local working directory. The inventory returns a revision for commands eligible for local review.

Call `project_command` with `command: "run"`, the command alias as `id`, its current `revision` and a unique `idempotencyKey` of 8–64 letters, digits, hyphens or underscores. Lastra shows the exact executable, arguments, working directory, timeout and output setting on the deck. The command starts after local approval while the registered definition and target still match.

The returned request ID is specific to the requesting client and activity. Use `command: "status"` with that ID as `request` to read elapsed time and the exit outcome, or `command: "cancel"` to close a pending review or ask Windows to stop the direct child that request started. Windows exit confirms a stop or timeout. Local Terminal commands continue to use the deck controls. Read captured output through **Open log** on the deck.

**Apps → Action history** records the client ID prefix, command alias, time, and outcome when each request ends. An exit code of zero is successful. A nonzero exit, timeout, or launch error is failed. A declined, expired, withdrawn, or interrupted request is cancelled. Executable paths, arguments, log contents, and exit codes stay out of Action history.
