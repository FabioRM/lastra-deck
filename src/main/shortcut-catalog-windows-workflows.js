// @ts-check
'use strict';

const review = require('../../profiles/windows-workflow-shortcuts.json');
const { createReferenceApplication } = require('./shortcut-catalog-reference');

const workflows = [
  { id: 'zoom-meeting-reference', name: 'Zoom Workplace meeting (Windows reference)',
    edition: 'Zoom Workplace desktop', rows: 'zoom', source: 'zoom',
    availability: 'Requires a matching Zoom Workplace version, meeting window and configured shortcut.' },
  { id: 'slack-desktop-reference', name: 'Slack Desktop navigation (Windows reference)',
    edition: 'Slack desktop', rows: 'slack', source: 'slack',
    availability: 'Requires verification in the active Slack surface with its search preferences.' },
  { id: 'visual-studio-2022-reference', name: 'Visual Studio 2022 (Windows reference)',
    edition: 'Visual Studio 2022 IDE · General development settings', rows: 'visualStudio2022', source: 'visualStudio2022',
    availability: 'Requires the Visual Studio IDE, selected development settings and active editor scope.' },
  { id: 'visual-studio-2026-reference', name: 'Visual Studio 2026 (Windows reference)',
    edition: 'Visual Studio 2026 IDE · General development settings', rows: 'visualStudio2026', source: 'visualStudio2026',
    availability: 'Requires the Visual Studio IDE, selected development settings and active editor scope.' },
];

const windowsWorkflowApplications = workflows.map(({ rows, source, ...application }) => {
  const bindings = review[rows].map(([context, id, label, keys, options]) => [context, id, label, keys, {
    ...options, ...(/^(?:Window\.|Edit\.|IDM_)/.test(id) ? { command: id } : {}),
  }]);
  return createReferenceApplication({ ...review, bindings }, { ...application, groups: [{ rows: 'bindings', source }] });
});

module.exports = { windowsWorkflowApplications };
