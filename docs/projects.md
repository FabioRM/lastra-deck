# Projects palette

Open **Apps → Projects** on the deck. Choose **Edit projects** to open `projects.json` in the Lastra user data folder. Assign a unique ID and Windows folder to each project. Repository, issue and documentation destinations are optional.

```json
{
  "version": 1,
  "projects": [
    {
      "id": "studio",
      "name": "Studio",
      "directory": "C:\\Workspace\\Studio",
      "repository": "https://github.com/example/studio",
      "issues": "https://github.com/example/studio/issues",
      "documentation": "docs/README.md"
    }
  ]
}
```

Choose a project and tap **Repository**, **Issues**, **Terminal**, or **Documentation**. Web destinations use HTTPS without credentials. Documentation can also point to a Markdown or text file within the project. Lastra checks where the file resolves before opening it. **Terminal** opens a new Windows Terminal tab in the verified project folder.

With version 0.1.1 of the opt-in VS Code extension, **Current VS Code folder** selects the matching project for a focused, trusted local workspace. In a workspace with multiple folders, the active editor identifies the folder. Choose a project manually when there is no match or the VS Code session uses WSL, SSH, a dev container, or Codespaces. [Install or update the Lastra for VS Code extension](../extensions/lastra-vscode/README.md#install-and-enable)
