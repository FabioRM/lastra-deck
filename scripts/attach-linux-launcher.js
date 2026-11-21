'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

module.exports = async ({ electronPlatformName, appOutDir, packager }) => {
  if (electronPlatformName !== 'linux') return;
  const executable = path.join(appOutDir, packager.executableName);
  const launcher = await fs.readFile(path.join(__dirname, 'lastra-linux.sh'), 'utf8');
  await fs.rename(executable, path.join(appOutDir, 'lastra-electron'));
  await fs.writeFile(executable, launcher.replaceAll('\r\n', '\n'), { mode: 0o755 });
};
