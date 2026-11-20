'use strict';

const { createHash } = require('node:crypto');
const path = require('node:path');
const { positiveInteger, shortText } = require('./protocol');

function activeFolder(vscode) {
  const uri = vscode.window.activeTextEditor?.document.uri;
  return (uri && vscode.workspace.getWorkspaceFolder(uri)) ?? vscode.workspace.workspaceFolders?.[0];
}

function editorFile(vscode) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return null;
  const { uri } = editor.document;
  return shortText(vscode.workspace.getWorkspaceFolder(uri)
    ? vscode.workspace.asRelativePath(uri, false) : path.posix.basename(uri.path), 240);
}

function problems(vscode) {
  const actual = { errors: 0, warnings: 0, information: 0, hints: 0 };
  const keys = ['errors', 'warnings', 'information', 'hints'];
  const active = vscode.window.activeTextEditor?.document.uri.toString();
  for (const [uri, entries] of vscode.languages.getDiagnostics()) {
    if (uri.toString() !== active && !vscode.workspace.getWorkspaceFolder(uri)) continue;
    for (const entry of entries) {
      const key = keys[entry.severity];
      if (key) actual[key]++;
    }
  }
  return actual;
}

async function readWorkspaceFile(vscode, folder, parts, maximum) {
  if (!folder) return null;
  try {
    const uri = vscode.Uri.joinPath(folder.uri, ...parts);
    const stat = await vscode.workspace.fs.stat(uri);
    if (stat.type !== vscode.FileType.File || stat.size > maximum) return null;
    const bytes = await vscode.workspace.fs.readFile(uri);
    if (bytes.byteLength > maximum) return null;
    return { text: Buffer.from(bytes).toString('utf8'), updatedAt: positiveInteger(stat.mtime) };
  } catch {
    return null;
  }
}

function gitRepository(vscode, git, folder) {
  const uri = vscode.window.activeTextEditor?.document.uri;
  if (uri && git.getRepository) {
    const repo = git.getRepository(uri);
    if (repo) return repo;
  }
  if (folder && git.getRepository) return git.getRepository(folder.uri);
  return git.repositories?.length === 1 ? git.repositories[0] : null;
}

async function currentBranch(vscode, folder) {
  try {
    const extension = vscode.extensions.getExtension('vscode.git');
    const git = extension?.isActive && extension.exports?.getAPI?.(1);
    const head = git && gitRepository(vscode, git, folder)?.state?.HEAD;
    if (head?.name) return shortText(head.name);
    if (head?.commit) return `Detached HEAD (${head.commit.slice(0, 8)})`;
  } catch {
    // The Git extension may run in the remote extension host.
  }
  const file = await readWorkspaceFile(vscode, folder, ['.git', 'HEAD'], 4_096);
  const head = file?.text.trim();
  if (head?.startsWith('ref: refs/heads/')) return shortText(head.slice('ref: refs/heads/'.length));
  return /^[0-9a-f]{40,64}$/i.test(head ?? '') ? `Detached HEAD (${head.slice(0, 8)})` : null;
}

function reportPath(value) {
  if (typeof value !== 'string' || value.length > 240 || /[\\:\u0000-\u001f]/.test(value)) return null;
  const parts = value.split('/');
  return parts.every((part) => part && part !== '.' && part !== '..') ? parts : null;
}

async function jestResults(vscode, folder, parts) {
  if (!parts) return null;
  const file = await readWorkspaceFile(vscode, folder, parts, 2 * 1024 * 1024);
  if (!file) return null;
  let raw;
  try { raw = JSON.parse(file.text); } catch { return null; }
  const passed = positiveInteger(raw?.numPassedTests);
  const failed = positiveInteger(raw?.numFailedTests);
  const pending = positiveInteger(raw?.numPendingTests);
  const todo = positiveInteger(raw?.numTodoTests ?? 0);
  const skipped = pending === null || todo === null ? null : positiveInteger(pending + todo);
  if ([passed, failed, skipped].includes(null) || typeof raw.success !== 'boolean') return null;
  return { passed, failed, skipped, success: raw.success, updatedAt: file.updatedAt };
}

function taskId(task) {
  const key = JSON.stringify([task.name, task.source, task.definition?.type,
    typeof task.scope === 'object' ? task.scope.uri.toString() : task.scope]);
  return createHash('sha256').update(key).digest('hex').slice(0, 32);
}

module.exports = { activeFolder, editorFile, problems, currentBranch, reportPath, jestResults, taskId };
