// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { writeAtomic } = require('./write-atomic');

const RUN_ID = /^[a-f0-9]{32}$/;
const LOG_FILE = /^run-([a-f0-9]{32})\.txt$/;
const LOG_TEMPORARY = /^run-[a-f0-9]{32}\.txt\.[a-f0-9-]{36}\.tmp$/;
const MAX_LOG_BYTES = 256 * 1024;
const TRUNCATED = Buffer.from('\r\n[Output limit reached]\r\n');
const INCOMPLETE = Buffer.from('\r\n[Output stream interrupted]\r\n');
const OUTPUT_BYTES = MAX_LOG_BYTES - Math.max(TRUNCATED.byteLength, INCOMPLETE.byteLength);

class TerminalOutput {
  constructor() {
    this.buffer = Buffer.allocUnsafe(OUTPUT_BYTES);
    this.size = 0;
    this.truncated = false;
    this.incomplete = false;
  }

  append(chunk) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const available = OUTPUT_BYTES - this.size;
    const count = Math.min(available, bytes.byteLength);
    if (count) {
      bytes.copy(this.buffer, this.size, 0, count);
      this.size += count;
    }
    if (count < bytes.byteLength) this.truncated = true;
  }

  bytes() {
    const contents = this.buffer.subarray(0, this.size);
    if (this.truncated) return Buffer.concat([contents, TRUNCATED]);
    if (this.incomplete) return Buffer.concat([contents, INCOMPLETE]);
    return this.size ? contents : Buffer.from('No command output captured.\r\n');
  }
}

class TerminalRunLogs {
  constructor(directory) { this.directory = directory; }

  folder(create = false) {
    if (create) fs.mkdirSync(this.directory, { recursive: true });
    if (!fs.lstatSync(this.directory).isDirectory()) throw new Error('The Terminal log directory is unavailable.');
    return this.directory;
  }

  save(id, output) {
    if (!RUN_ID.test(id)) return null;
    const file = path.join(this.folder(true), `run-${id}.txt`);
    writeAtomic(file, output.bytes());
    return file;
  }

  file(id) {
    if (!RUN_ID.test(id)) return null;
    try {
      const file = path.join(this.folder(), `run-${id}.txt`);
      return fs.lstatSync(file).isFile() ? file : null;
    } catch { return null; }
  }

  prune(retained) {
    let directory;
    try { directory = this.folder(); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const id = LOG_FILE.exec(entry.name)?.[1];
      if ((id && !retained.has(id)) || LOG_TEMPORARY.test(entry.name)) fs.unlinkSync(path.join(directory, entry.name));
    }
  }
}

module.exports = { RUN_ID, MAX_LOG_BYTES, TerminalOutput, TerminalRunLogs };
