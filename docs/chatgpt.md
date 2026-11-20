# ChatGPT app view

Open **Apps → ChatGPT** for the web app, saved conversations and Projects, and local prompt shortcuts. The app view can be pinned or selected automatically when the ChatGPT desktop executable is in focus.

**Open Windows companion** uses the documented `Alt+Space` shortcut with the ChatGPT Windows app running. Lastra verifies the app and window immediately before sending the shortcut. Bring ChatGPT to the foreground if Windows blocks the switch or multiple windows are open. The shortcut follows the default Windows app configuration. [ChatGPT on Windows](https://help.openai.com/en/articles/9982051-using-the-chatgpt-windows-app)

## Saved links

Select **Edit links** to open `chatgpt.json`. Add links from the ChatGPT browser address bar or a shared conversation link. Choose **Reload** after saving the file. Lastra opens each link in the default browser using its existing sign-in and permissions. Link addresses are reduced to their conversation or Project path. [ChatGPT Projects](https://help.openai.com/en/articles/10169521-projects-in-chatgpt) · [Shared links](https://help.openai.com/en/articles/7925741-chatgpt-shared-links-faq)

```json
{
  "version": 1,
  "links": [
    {
      "id": "release-project",
      "name": "Release project",
      "url": "https://chatgpt.com/g/g-p-0123456789abcdef0123456789abcdef-release/project"
    },
    {
      "id": "release-chat",
      "name": "Release conversation",
      "url": "https://chatgpt.com/c/01234567-89ab-4cde-8123-456789abcdef"
    }
  ]
}
```

## Prompt shortcuts

Select **Edit prompts** to open the local `snippets.json` library. Use `kind: "prompt"` for entries in this view. Fields such as `{{topic}}` can appear more than once in a template. Choose **Reload**, search for an entry, and fill its fields with the touch keyboard. **Copy to clipboard** copies the reviewed draft for you to paste in ChatGPT.

```json
{
  "version": 1,
  "snippets": [
    {
      "id": "outline",
      "name": "Outline a topic",
      "kind": "prompt",
      "text": "Outline {{topic}} for {{audience}}. Include the most important decisions."
    }
  ]
}
```

ChatGPT sign-in stays in the browser or Windows app. API-powered workflows use a separate connection. This view reads its links and templates from local files.
