'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/** Create a temporary directory that is removed when the test `t` finishes. */
function tempDir(t, prefix = 'lastra-test-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

module.exports = { tempDir };
