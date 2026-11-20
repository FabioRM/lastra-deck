// @ts-check
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const run = promisify(execFile);

/** @param {string} file */
async function isFile(file) {
  return (await fs.stat(file).catch(() => null))?.isFile() ?? false;
}

/** Locate the .NET Framework 4 C# compiler that ships with Windows, preferring the 64-bit one. */
async function findCompiler(env = process.env) {
  const framework = path.join(env.SystemRoot || 'C:\\Windows', 'Microsoft.NET');
  for (const folder of ['Framework64', 'Framework']) {
    const file = path.join(framework, folder, 'v4.0.30319', 'csc.exe');
    if (await isFile(file)) return file;
  }
  return null;
}

/**
 * Compile a C# helper with csc.exe once and reuse it from a cache folder named after the source
 * (plus an optional fingerprint of its inputs), so an edited source or dependency rebuilds it.
 * The executable is renamed into place only after a successful build.
 * @param {object} options
 * @param {string} options.cache Cache root folder.
 * @param {string} options.source Path of the .cs file.
 * @param {string} options.exeName File name of the cached executable.
 * @param {string[]} options.args Compiler options placed between /nologo and /out.
 * @param {string} [options.fingerprint] Extra input to the cache signature.
 * @param {string} [options.unavailableCode] `code` for the error thrown when csc.exe is missing.
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<string>} Path of the compiled executable.
 */
async function compileDotNetHelper({ cache, source, exeName, args, fingerprint, unavailableCode, signal }) {
  const hash = createHash('sha256').update(await fs.readFile(source));
  if (fingerprint !== undefined) hash.update(fingerprint);
  const directory = path.join(cache, hash.digest('hex').slice(0, 16));
  const exe = path.join(directory, exeName);
  if (await isFile(exe)) return exe;

  const compiler = await findCompiler();
  if (!compiler) {
    const error = new Error('.NET Framework compiler is unavailable');
    throw unavailableCode ? Object.assign(error, { code: unavailableCode }) : error;
  }

  await fs.mkdir(directory, { recursive: true });
  const temporary = path.join(directory, `${path.basename(exeName, '.exe')}-${randomUUID()}.exe`);
  try {
    await run(compiler, ['/nologo', ...args, `/out:${temporary}`, source], { windowsHide: true, signal, timeout: 15000 });
    await fs.rename(temporary, exe);
  } finally {
    await fs.unlink(temporary).catch(() => {});
  }
  return exe;
}

module.exports = { compileDotNetHelper, findCompiler, isFile };
