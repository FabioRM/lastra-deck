# Lastra for VS Code

Open **Apps → Visual Studio Code** on the Lastra deck to see the workspace, active file, Git branch, problem counts, debugger status and configured tasks. The view shows each connected VS Code window separately. The foreground window is selected when it can be identified. Select a different workspace on the deck to keep it in view.

## Install and enable

Use VS Code 1.90 or later on Windows. From this extension's directory, build the VSIX package in PowerShell.

```powershell
$vsix = Join-Path $env:TEMP 'lastra-vscode.vsix'
npx --yes @vscode/vsce package --allow-missing-repository --out $vsix
```

In VS Code, select **Extensions → Install from VSIX…** and choose the generated package. Install **Locally** when a remote workspace is open. Open **User** Settings and turn on **Lastra: Enabled**. The Windows extension host writes a separate snapshot for each window to `%APPDATA%\Lastra\vscode-bridge`. Lastra refreshes the view when the editor connects. [VS Code extension installation](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace#_install-from-a-vsix) · [VS Code Remote Development](https://code.visualstudio.com/api/advanced-topics/remote-extensions)

The extension uses the active editor and workspace APIs. It reads the branch from the built-in Git extension when that API is available. A typical repository can also supply its branch through `.git/HEAD` using the workspace file API. In WSL, SSH, Containers and Codespaces, the readings depend on what the local extension host can access in that workspace. The deck labels unavailable readings. [VS Code API](https://code.visualstudio.com/api/references/vscode-api) · [Built-in Git API](https://github.com/microsoft/vscode/blob/main/extensions/git/README.md)

Version 0.1.1 also lets **Apps → Projects** match a configured project to a focused, trusted local VS Code folder. The bridge includes a folder hash for that match. Lastra keeps it inside the local bridge.

## Run tasks and see results

Set **Lastra: Allowed Tasks** in **User** Settings to the exact names of the workspace tasks you want on the deck. Open the matching trusted workspace in VS Code. Lastra shows a tile for each discovered task and its latest observed result. A tile stays pending until VS Code acknowledges the request. Process-based tasks show the exit result and elapsed time. Label a task with the `test` group in `tasks.json` to show it as a **Test task**. [VS Code tasks](https://code.visualstudio.com/docs/debugtest/tasks) · [Workspace Trust](https://code.visualstudio.com/docs/editing/workspaces/workspace-trust)

For Jest case counts, configure a task to use `--json --outputFile=reports/jest.json` and set **Lastra: Jest Report** to `reports/jest.json` in **User** Settings. The report is resolved relative to the active workspace folder. The deck shows counts and the report timestamp. Use VS Code's **Testing** view for results from other test adapters. [Jest JSON output](https://jestjs.io/docs/cli#--json) · [Testing in VS Code](https://code.visualstudio.com/docs/debugtest/testing)

```json
{
  "lastra.enabled": true,
  "lastra.allowedTasks": ["Build", "Verify"],
  "lastra.jestReport": "reports/jest.json"
}
```
