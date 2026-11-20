'use strict';

{
  const GROUP_MS = 800;

  class EditorHistory {
    constructor(limit = 64) {
      this.limit = limit;
      this.reset('');
    }

    reset(savedText) {
      this.past = [];
      this.future = [];
      this.savedText = savedText;
      this.endGroup();
    }

    endGroup() {
      this.group = null;
      this.lastEditAt = 0;
    }

    record(before, after, group = null, now = performance.now()) {
      if (before.text === after.text) return false;
      const last = this.past.at(-1);
      const coalesces = group !== null && group === this.group && now - this.lastEditAt <= GROUP_MS;
      const entry = coalesces ? last : { before, after };
      entry.after = after;
      if (!coalesces) this.past.push(entry);
      this.future.length = 0;

      if (entry.before.text === entry.after.text) {
        this.past.pop();
        this.endGroup();
      } else {
        if (this.past.length > this.limit) this.past.shift();
        this.group = group;
        this.lastEditAt = now;
      }
      return true;
    }

    markSaved(previous, saved) {
      const last = this.past.at(-1);
      if (last?.after.text === previous.text) {
        last.after = { ...last.after, text: saved.text };
        if (last.before.text === saved.text) this.past.pop();
      }
      const next = this.future.at(-1);
      if (next?.before.text === previous.text) {
        next.before = { ...next.before, text: saved.text };
        if (next.after.text === saved.text) this.future.pop();
      }
      this.savedText = saved.text;
      this.endGroup();
    }

    isDirty(text) {
      return text !== this.savedText;
    }

    get canUndo() {
      return this.past.length > 0;
    }

    get canRedo() {
      return this.future.length > 0;
    }

    undo() {
      this.endGroup();
      const entry = this.past.pop();
      if (!entry) return null;
      this.future.push(entry);
      return entry.before;
    }

    redo() {
      this.endGroup();
      const entry = this.future.pop();
      if (!entry) return null;
      this.past.push(entry);
      return entry.after;
    }
  }

  if (typeof module === 'object') module.exports = { EditorHistory };
  else window.EditorHistory = EditorHistory;
}
