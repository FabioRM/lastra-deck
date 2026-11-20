# Integration setup in the editor

Open **Integration setup** to see OBS Studio, Spotify Connect, VS Code, Claude Code, ChatGPT, Service health and Windows audio. Select an integration to see its observed status, controls and permissions that Lastra can report. **Refresh status** rereads existing local state. It does not start a provider check, authorize an account or run a control.

**Not observed** means Lastra has no suitable local evidence for that state. Spotify may show an account as configured before a playback observation arrives. Workspace trust is reported from the local VS Code extension. Browser sign-in and Windows microphone privacy remain unobserved in this inspector.

**Open existing settings** opens the configured local file in the system editor. If the file does not exist, use the setup guide or the original app view’s setup control. **Open Windows Sound settings** opens the existing device picker. The inspector does not change profiles, install extensions, create settings files or start account authorization. Complete those steps in the linked setup and refresh the inspector afterward.

The panel displays only fixed setup labels, availability, permission summaries and observation times. Credentials, account and device names, workspace names, service endpoints, saved links and file paths stay out of its responses.
