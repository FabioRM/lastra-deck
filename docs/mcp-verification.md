# Verify the Lastra MCP connection

Run the test client from the Lastra repository with Node.js 20 or later. It starts the bundled stdio server, negotiates the requested MCP revision, follows every discovery cursor and measures a fixed set of read calls. It reports discovery counts, enabled tools and elapsed millisecond percentiles. A cold catalog lookup is included in each report.

```powershell
node scripts/mcp-check.js --rounds 30
node scripts/mcp-check.js --protocol 2025-03-26 --rounds 30
node scripts/mcp-check.js --protocol 2024-11-05 --rounds 30
```

For a live check, enable local Agent access, select the target activity, and issue a separate **Provider availability** grant for the test client. Set `LASTRA_AGENT_CREDENTIAL` in the environment of the shell running the test without displaying it. Leave Windows unlocked and Lastra running on the deck.

```powershell
node scripts/mcp-check.js --live --rounds 30
```

The live report measures the connection and the provider read when granted. A missing connection produces `ok: false` and exits with status 1. The offline check ignores a shell credential. The report omits the credential, profile contents, action payloads and provider readings. Open two shells with distinct grants to compare clients or run the automated Windows fixture.

If discovery works and the connection is unavailable, check **Lastra → Settings → System → Agent access**, the current activity, and the Windows session. Reconnect after resuming access or restarting Lastra. Issue a fresh grant if the previous grant was revoked or copied under a different Windows user. After reconnecting, subscribe again and reread any snapshot with an expired cursor. When a legacy client expects JSON text, match its negotiated protocol revision and rerun the offline check after an upgrade.

For a matched panel measurement, hold the display, activity, providers, and physical tap sequence fixed across two runs. Run the live check during the second measurement and compare the Lastra resource samples and tap-to-feedback timings with the baseline. The test client’s timings include stdio and local pipe round trips. The panel recorder measures the separate input and renderer costs. [Panel measurement procedure](panel-measurement.md)

In 30 requests against an isolated Windows Electron instance, the 95th percentiles were 1.13 ms for `connection` and 0.67 ms for `provider_status`. The same instance completed the workflow below through the local deck approval windows and restored the disposable profile.

## Exercise draft, preview, action and rollback

Use a disposable activity profile and a grant for **Deck layout**, **Draft edits**, **Request profile changes**, and **Request saved key actions**. The example adds a delay-only key to a new page so there is no application to launch or input to send. The visual preview, profile comparison, and action request each use their own exact revision.

1. Call `profile_draft` with `{"command":"create","source":"active"}`. Keep the returned draft ID and revision.
2. Use `profile_draft` again with `command:"edit"`, `draft`, the returned `revision`, and these two edits in a single batch. If `mcp-smoke` already exists, choose a new page ID and use it throughout.

   ```json
   [
     { "op": "add-page", "id": "mcp-smoke", "name": "MCP smoke test" },
     { "op": "set-key", "surface": "mcp-smoke", "slot": 0, "key": {
       "id": "sample-delay", "label": "Sample delay", "action": { "type": "delay", "ms": 100 }
     } }
   ]
   ```

3. Call `preview_draft` with `draft`, the new `revision`, `page:"mcp-smoke"`, and `compareCurrent:true`. Review the preview and call `profile_changes` with `command:"compare"` and the same draft revision.
4. Call `profile_changes` with `command:"apply"` and the same draft revision. Approve once on the deck and poll `command:"status"` with the returned `request` until the save is confirmed. Note `baseVersion` for the change and the time of the approval so you can identify the backup.
5. On the deck open **Deck Keys → Pages → MCP smoke test**. Call `profile_layout` to obtain the active page and revision and `profile_snapshot` to confirm the saved key. Send `registered_action` with `command:"run"`, the active `page`, `id:"sample-delay"`, `gesture:"tap"`, the active `revision`, and a unique `idempotencyKey`. Approve once and poll `command:"status"` with the action request ID.
6. Call `profile_changes` with `command:"backups"`. Choose the backup saved immediately before the apply and retain the current `baseVersion` from the backups response. Call `profile_changes` with `command:"restore"`, `backup`, and that current `baseVersion`. Approve once, poll the request, and check that `mcp-smoke` is gone from `profile_snapshot`.

The automated suite covers grant separation, unsafe or stale requests, disconnected providers, cancellation, subscription cursor expiry, offline malformed drafts, and concurrent Windows connections. Run `npm test` for the full suite, or `node --test test/mcp-check.test.js test/mcp-local.test.js` for the connection and test-client fixtures. [Agent access and setup](agent-access.md)
