'use strict';

const path = require('node:path');
const { createHash } = require('node:crypto');

function localProjectDirectory(value) {
  if (typeof value !== 'string' || value.length > 1024 || !/^[a-z]:[\\/]/i.test(value)
      || /[<>:"|?*%;\u0000-\u001f\u007f]/.test(value.slice(2))) return null;
  const location = path.win32.normalize(value);
  if (location.slice(3).split('\\').some((part) => /[. ]$/.test(part))) return null;
  return location.length > 3 ? location.replace(/\\$/, '') : location;
}

function projectDirectoryKey(value) {
  const location = localProjectDirectory(value);
  return location && createHash('sha256').update(location.toLowerCase()).digest('hex');
}

function currentProjectKey(vscode) {
  if (!vscode.workspace.isTrusted || vscode.env.remoteName) return null;
  const uri = vscode.window.activeTextEditor?.document.uri;
  const folders = vscode.workspace.workspaceFolders;
  const folder = (uri && vscode.workspace.getWorkspaceFolder(uri)) ?? (folders?.length === 1 ? folders[0] : null);
  return folder?.uri.scheme === 'file' ? projectDirectoryKey(folder.uri.fsPath) : null;
}

module.exports = { localProjectDirectory, projectDirectoryKey, currentProjectKey };
