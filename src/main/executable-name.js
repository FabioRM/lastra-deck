// @ts-check
'use strict';

const EXE = /^[^\\/:*?"<>|\x00-\x1f]+\.exe$/i;

function isExecutableName(value) {
  // LibreOffice's foreground process uses a .bin suffix on Windows.
  if (typeof value !== 'string') return false;
  const name = value.trim();
  return EXE.test(name) || /^soffice\.bin$/i.test(name);
}

module.exports = { isExecutableName };
