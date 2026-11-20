// @ts-check
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { localProjectDirectory, projectDirectoryKey } = require('../../extensions/lastra-vscode/project-location');
const { readMonitorConfig, openMonitorConfig } = require('./monitoring-config');

const ID = /^[a-z0-9_-]{1,48}$/;
const DOC_EXTENSION = /\.(?:md|markdown|txt)$/i;
const ACTIONS = ['repository', 'issues', 'terminal', 'documentation'];
const PROJECT_FIELDS = ['id', 'name', 'directory', 'repository', 'issues', 'documentation'];

function webLink(value) {
  if (typeof value !== 'string' || value.length > 2048 || !/^https:\/\//i.test(value) || /[\s\\\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function relativeDocument(value) {
  if (typeof value !== 'string' || value.length > 240 || /[\\<>:"|?*%\u0000-\u001f\u007f]/.test(value) || !DOC_EXTENSION.test(value)) return null;
  const parts = value.split('/');
  return parts.every((part) => part && !/[. ]$/.test(part)) ? parts : null;
}

function normalizeProjects(raw) {
  if (raw?.version !== 1 || !Array.isArray(raw.projects) || raw.projects.length > 32) {
    throw new Error('Use version 1 and a list of up to 32 projects.');
  }
  const ids = new Set();
  const locations = new Set();
  return raw.projects.map((entry, index) => {
    const number = `Project ${index + 1}`;
    if (!entry || typeof entry !== 'object' || Object.keys(entry).some((key) => !PROJECT_FIELDS.includes(key))
        || typeof entry.id !== 'string' || !ID.test(entry.id) || ids.has(entry.id)) throw new Error(`${number} needs a unique lowercase ID.`);
    const { id } = entry;
    const name = typeof entry.name === 'string' && entry.name.trim();
    if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error(`${number} needs a name of up to 80 characters.`);
    const directory = localProjectDirectory(entry.directory);
    const key = projectDirectoryKey(directory);
    if (!key || locations.has(key)) throw new Error(`${number} needs a unique absolute local Windows directory.`);
    const repository = webLink(entry.repository);
    const issues = webLink(entry.issues);
    if ((entry.repository !== undefined && !repository) || (entry.issues !== undefined && !issues)) {
      throw new Error(`${number} repository and issue links must use HTTPS without credentials.`);
    }
    const docsLink = webLink(entry.documentation);
    const docsFile = relativeDocument(entry.documentation);
    if (entry.documentation !== undefined && !docsLink && !docsFile) {
      throw new Error(`${number} documentation needs an HTTPS link or a Markdown or text file path relative to the project.`);
    }
    ids.add(id);
    locations.add(key);
    const revision = createHash('sha256').update(JSON.stringify([id, name, directory, repository, issues, docsLink, docsFile])).digest('hex');
    return { id, name, directory, key, repository, issues, docsLink, docsFile, revision };
  });
}

class ProjectPalette {
  /**
   * @param {string} file
   * @param {{ currentProject?: () => any, openConfig?: (file: string) => any, openExternal?: (url: string) => Promise<unknown>,
   *   openDocument?: (destination: string) => Promise<string>, run?: (action: Record<string, any>, pageApps?: any, options?: Record<string, any>) => Promise<any>, currentGuard?: () => () => any,
   *   platform?: NodeJS.Platform, files?: typeof fs }} [options]
   */
  constructor(file, { currentProject, openConfig, openExternal, openDocument, run, currentGuard = () => () => undefined,
    platform = process.platform, files = fs } = {}) {
    this.file = file;
    this.currentProject = currentProject;
    this.openConfig = openConfig;
    this.openExternal = openExternal;
    this.openDocument = openDocument;
    this.run = run;
    this.currentGuard = currentGuard;
    this.platform = platform;
    this.files = files;
    this.context = null;
  }

  projects() { return readMonitorConfig(this.file, 'Projects', normalizeProjects); }

  workspace(projects) {
    const active = this.currentProject();
    const target = active && projects.find(({ key }) => key === active.key);
    if (!target) {
      this.context = null;
      return null;
    }
    const signature = `${active.session}:${target.id}:${target.revision}`;
    if (this.context?.signature !== signature) this.context = { signature, id: target.id, token: randomUUID() };
    const { id, token } = this.context;
    return { id, token };
  }

  snapshot() {
    if (this.platform !== 'win32') return { status: 'unsupported', projects: [], workspace: null };
    try {
      const configured = this.projects();
      return { status: configured.length ? 'ready' : 'setup', workspace: this.workspace(configured),
        projects: configured.map(({ id, name, revision, repository, issues, docsLink, docsFile }) => ({
          id, name, revision, actions: [repository && 'repository', issues && 'issues', 'terminal', (docsLink || docsFile) && 'documentation'].filter(Boolean),
        })) };
    } catch (error) {
      this.context = null;
      return { status: 'invalid', projects: [], workspace: null, message: error.message };
    }
  }

  target(command) {
    const projects = this.projects();
    const project = projects.find(({ id, revision }) => id === command.id && revision === command.revision);
    if (!project) throw new Error('The project configuration changed. Choose the project again.');
    if (command.workspace !== undefined) {
      const workspace = this.workspace(projects);
      if (workspace?.id !== project.id || workspace.token !== command.workspace) {
        throw new Error('The VS Code folder changed. Choose the project again.');
      }
    }
    return project;
  }

  async checkedPath(project, document = false) {
    try {
      const directory = localProjectDirectory(await this.files.realpath(project.directory));
      if (!directory || !(await this.files.stat(directory)).isDirectory()) return null;
      if (!document) return directory;
      const resolved = localProjectDirectory(await this.files.realpath(path.win32.join(directory, ...project.docsFile)));
      if (!resolved || !DOC_EXTENSION.test(resolved)) return null;
      const relative = path.win32.relative(directory, resolved);
      const inside = relative && !path.win32.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..\\');
      return inside && (await this.files.stat(resolved)).isFile() ? resolved : null;
    } catch { return null; }
  }

  async change(command) {
    if (this.platform !== 'win32') throw new Error('The Projects palette needs Windows.');
    const guard = this.currentGuard();
    const check = () => {
      const reason = guard();
      if (reason) throw new Error(reason);
    };
    check();
    if (command?.action === 'configure') return openMonitorConfig(this.file, 'Projects', 'projects', this.openConfig);
    if (!ACTIONS.includes(command?.action)) throw new Error('Choose a project destination.');
    const project = this.target(command);
    const { action } = command;
    const link = action === 'documentation' ? project.docsLink : project[action];
    if (link) {
      await this.openExternal(link);
      return { ok: true };
    }
    if (action !== 'terminal' && (action !== 'documentation' || !project.docsFile)) throw new Error('This project destination is not configured.');
    const destination = await this.checkedPath(project, action === 'documentation');
    check();
    this.target(command);
    if (!destination) throw new Error(action === 'terminal' ? 'The local project directory is unavailable.' : 'The project document is unavailable.');
    if (action === 'terminal') return this.run({ type: 'launch', target: 'wt.exe', args: ['new-tab', '--startingDirectory', destination] });
    if (await this.openDocument(destination)) throw new Error('Windows could not open the project document.');
    return { ok: true };
  }
}

module.exports = { ProjectPalette, normalizeProjects };
