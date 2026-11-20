# Snippet library

Open **Apps → Snippet library** to find reusable replies, prompts and text. Use the type buttons and the search field to narrow the list. Select an entry, fill in its fields, and review the draft. Select **Copy to clipboard** when it is ready to paste into the app you choose.

**Edit snippets** opens the local `snippets.json` file. Use **Reload snippets** after saving your changes. The ChatGPT view lists the `prompt` entries from the same file. [ChatGPT prompt setup](chatgpt.md#prompt-shortcuts)

```json
{
  "version": 1,
  "snippets": [
    { "id": "review", "name": "Review reply", "kind": "reply", "text": "Thanks, {{name}}. I will review {{topic}}." },
    { "id": "summary", "name": "Summarise notes", "kind": "prompt", "text": "Summarise the notes about {{topic}}." },
    { "id": "footer", "name": "Report footer", "kind": "text", "text": "Prepared for {{team}}." }
  ]
}
```

IDs are unique in the library. Use `{{field-name}}` for a field and reuse the same name to fill it everywhere in the draft. Each entry can have up to eight fields. The library accepts up to 60 entries. If a template changes while open, reload it and review the new draft before copying.
