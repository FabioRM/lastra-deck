# Agent activity on the deck

Enable local agent access from the Lastra tray. Choose **Grant access → Publish agent run activity** while the activity profile you want is selected. Connect the MCP client using the grant copied by Lastra. On the deck, open **Apps → Agent activity**. Use the app view’s pin to put Agent activity near the top of Apps.

Call `agent_run` with a run ID unique to that client and a positive revision. Send a greater revision for each change or heartbeat. Retrying an identical revision returns the original acknowledgement and expiry. The summary is required. Project, step, and percentage are optional. Use a wait reason for `waiting`.

```json
{
  "command": "publish",
  "run": "package-build",
  "revision": 2,
  "state": "waiting",
  "summary": "Check the desktop build",
  "project": "Lastra",
  "step": "Review the packaging output",
  "waitReason": "Waiting for local review",
  "progress": 75
}
```

Use `completed` or `failed` to finish the run. Use `{"command":"withdraw","run":"package-build","revision":2}` with the latest revision to remove its card. Each card shows the publishing agent, its latest reported status, and the last update time. The deck user can pin individual cards for this Lastra session. Pinned cards appear first and follow the same expiry rules.

Running and waiting cards expire after two minutes without an update. Completed and failed cards expire after ten minutes. Lastra keeps at most four entries per agent and twelve in total. Windows lock, suspend, and pausing or disabling agent access clear the cards. Revoking a grant removes that agent’s cards. The grant covers only its assigned activity and gives the agent no access to other agents’ cards.

Treat the card as a report from the agent. Lastra displays the submitted fields as plain text and records the operation and result in Action history. Session links and attachments are outside the current card format.
