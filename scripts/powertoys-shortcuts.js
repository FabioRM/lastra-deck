// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { MAX_MANIFEST_BYTES, exportManifest, inspectManifest, readBoundedFile, decode } = require('./powertoys-manifest');

const INSPECT = '[--review review.json]';
const EXPORT = '--page ID --package NAME --process EXE [--locale en-US] [--background] [--output FILE]';
const USAGE = `node scripts/powertoys-shortcuts.js inspect manifest.yml ${INSPECT}\nnode scripts/powertoys-shortcuts.js export profile.json ${EXPORT}`;

function run(args) {
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write(USAGE + '\n');
    return 0;
  }
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    review: { type: 'string' }, page: { type: 'string' }, package: { type: 'string' }, process: { type: 'string' },
    locale: { type: 'string' }, background: { type: 'boolean' }, output: { type: 'string' },
  } });
  const [command, file] = positionals;
  if (positionals.length !== 2 || !['inspect', 'export'].includes(command)) throw new Error(USAGE);
  if (command === 'inspect') {
    if (Object.keys(values).some((option) => option !== 'review')) throw new Error(USAGE);
    const bytes = readBoundedFile(file, MAX_MANIFEST_BYTES);
    const review = values.review === undefined ? undefined : JSON.parse(decode(readBoundedFile(values.review, MAX_MANIFEST_BYTES)));
    process.stdout.write(JSON.stringify(inspectManifest(bytes, { filename: file, review }), null, 2) + '\n');
    return 0;
  }
  if (values.review !== undefined || !values.page || !values.package || !values.process) throw new Error(USAGE);
  const profile = JSON.parse(decode(readBoundedFile(file, 4 * 1024 * 1024)));
  const result = exportManifest(profile, { page: values.page, packageName: values.package, windowFilter: values.process,
    locale: values.locale, backgroundProcess: values.background });
  if (values.output && result.yaml) {
    if (path.basename(values.output) !== result.filename) throw new Error(`Choose the output filename ${result.filename}.`);
    fs.writeFileSync(values.output, result.yaml, { encoding: 'utf8', flag: 'wx' });
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  return values.output && !result.yaml ? 2 : 0;
}

try { process.exitCode = run(process.argv.slice(2)); }
catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
