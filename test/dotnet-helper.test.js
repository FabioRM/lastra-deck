'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { join } = require('node:path');
const { test } = require('node:test');
const { compileDotNetHelper } = require('../src/main/dotnet-helper');
const { tempDir } = require('./helpers/temp-dir');

function useDirectory(t) {
  const directory = tempDir(t, 'lastra-dotnet-helper-');
  return directory;
}

function useSystemRoot(t, value) {
  const previous = process.env.SystemRoot;
  process.env.SystemRoot = value;
  t.after(() => {
    if (previous === undefined) delete process.env.SystemRoot;
    else process.env.SystemRoot = previous;
  });
}

test('a cached helper is reused from the folder named after its source and inputs', async (t) => {
  const directory = useDirectory(t);
  useSystemRoot(t, join(directory, 'no-windows'));
  const source = join(directory, 'helper.cs');
  fs.writeFileSync(source, 'class Helper {}');
  const fingerprint = JSON.stringify(['library.dll', 1, 2]);
  const signature = createHash('sha256').update(fs.readFileSync(source)).update(fingerprint).digest('hex').slice(0, 16);
  const cached = join(directory, 'cache', signature, 'Helper.exe');
  fs.mkdirSync(join(directory, 'cache', signature), { recursive: true });
  fs.writeFileSync(cached, '');

  const options = { cache: join(directory, 'cache'), source, exeName: 'Helper.exe', args: [] };
  assert.equal(await compileDotNetHelper({ ...options, fingerprint }), cached);
  // A different fingerprint needs a new build, and the compiler is unavailable here.
  await assert.rejects(compileDotNetHelper({ ...options, fingerprint: 'other' }), (error) =>
    error.message === '.NET Framework compiler is unavailable' && error.code === undefined);
  await assert.rejects(compileDotNetHelper({ ...options, unavailableCode: 'MEDIA_UNSUPPORTED' }), { code: 'MEDIA_UNSUPPORTED' });
});
