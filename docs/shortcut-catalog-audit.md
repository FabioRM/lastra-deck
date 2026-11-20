# Shortcut catalog reports

Run the audit with Node.js 22.13 or later. It generates an in-memory SQLite database from Lastra’s bundled shortcut catalog for the selected language. Reports use JSON by default and can emit CSV for inspection with other tools.

```powershell
node scripts/shortcut-audit.js --report coverage --language it-IT
node scripts/shortcut-audit.js --report provenance --app blender-factory-reference
node scripts/shortcut-audit.js --report versions --format csv
node scripts/shortcut-audit.js --report overlaps --app blender-factory-reference --format csv
```

- **Coverage** counts reference rows, unassigned commands, inventory entries, and bindings the Windows parser can normalize.
- **Provenance** groups by app, source identifier, URL, revision, and verification status.
- **Versions** lists the recorded platforms, editions, app versions, keyboard layouts, shortcut languages, and Windows build requirements.
- **Overlaps** lists distinct action pairs with equivalent inputs and the same recorded app, context set, platform, edition, version, layout, language, build, mode, condition, and trigger. Distinct documented scopes produce separate groups. Use the results to pick candidates for app testing.

The index uses strict types, unique binding IDs, and a composite foreign key that ties each context to its application. The importer rolls back its transaction if any record violates a constraint. The overlap report preserves the order of sequences and distinguishes virtual keys, physical scan codes and logical characters. Unsupported gestures remain available in coverage and provenance.

