# Claude and Claude Code

Open **Apps → Claude and Claude Code**. The Claude web button and saved chats use your normal browser. A configured desktop shortcut opens the installed app. A running Claude Desktop window can also be brought to the foreground.

## Saved chats and Claude Desktop

Select **Edit Claude settings** to create `%APPDATA%\Lastra\claude.json`. Add private `/chat/` links or existing shared `/share/` links from `claude.ai`. Lastra uses the browser’s existing Claude session for private chats.

```json
{
  "version": 1,
  "links": [
    {
      "id": "planning",
      "name": "Planning chat",
      "url": "https://claude.ai/chat/01234567-89ab-cdef-0123-456789abcdef"
    }
  ]
}
```

To launch Claude Desktop even when it is closed, add an optional `desktop` entry with either `path` or `appId`. Use an absolute path to `Claude.exe` or `Claude.lnk`. For a packaged install, run `Get-StartApps -Name Claude` in PowerShell and copy Claude’s `AppID` into `desktop.appId`. [Install Claude Desktop](https://support.claude.com/en/articles/10065433-installing-claude-desktop)

## Share local Claude Code activity with Lastra

Use a Claude Code version that supports command hooks with an `args` array. From the Lastra repository, generate a settings fragment with Node.js. Use the second command when Claude Code runs status-line commands through PowerShell because Git Bash is absent.

```powershell
node .\extensions\lastra-claude-code\hook.js --settings
node .\extensions\lastra-claude-code\hook.js --settings --powershell
```

Merge the generated `hooks` entries into `%USERPROFILE%\.claude\settings.json` or the trusted project’s `.claude/settings.local.json`. Add each Lastra matcher to the existing event array. Add the generated `statusLine` if you want context use, reported cost, and periodic activity updates. If you already have a status-line script, you can keep its display by passing a copy of its input JSON to the same helper with `--status-observe` in place of `--status`. The generator prints settings. You choose where to apply them.

Open or resume a Claude Code session and visit the Lastra view. Lastra shows the project, session reference, and the activity reported by Claude Code. When Claude Code emits a terminal permission notification, the session displays **Waiting for approval**. Permission notifications may arrive several seconds after the prompt first appears. Review and answer the prompt in Claude Code. When available, context use and estimated cost come directly from the status-line readings. [Claude Code hooks](https://code.claude.com/docs/en/hooks) · [Claude Code status line](https://code.claude.com/docs/en/statusline)

The helper stores activity, project paths, session IDs, optional terminal labels, and usage metrics locally in `%APPDATA%\Lastra\claude-code`. The activity view expires after three minutes without updates. Session-end hooks remove a session from the active view. The helper discards activity files older than one day when a new session starts. Prompts, transcripts, tool inputs, results, and permission decisions are excluded. Remove the Lastra hook entries and its status-line command to stop sharing.

## Return to the session terminal

For a direct return link, use a Windows Terminal window with a unique tab title starting with `Lastra Claude `, followed by letters, digits, hyphens, underscores, or periods. This example opens a dedicated window and keeps its tab title stable.

```powershell
wt.exe -w new new-tab --title 'Lastra Claude example' --suppressApplicationTitle
```

In that tab, set the matching title and open Claude Code.

```powershell
$env:LASTRA_CLAUDE_TERMINAL_TITLE = 'Lastra Claude example'
claude
```

**Return to terminal** appears when one open Windows Terminal window displays that exact title and one active Claude Code session reports it. Keep the linked tab selected in its window. **Open project shell** starts a separate tab in a local Windows project directory. For approvals, use the original Claude Code terminal. [Windows Terminal command-line options](https://learn.microsoft.com/windows/terminal/command-line-arguments)
