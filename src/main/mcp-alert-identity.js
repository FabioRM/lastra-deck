// @ts-check
'use strict';

const { createHash, randomBytes } = require('node:crypto');

const ALERT_ALIAS = /^alert-[a-f0-9]{20}$/;
const ALERT_REVISION = /^alert-revision-[a-f0-9]{24}$/;
const revisions = new WeakMap();
const sources = new Map([['Service health', ['service', 'service']], ['Hardware thresholds', ['threshold', 'hardware']]]);

function alertAlias(id) {
  return `alert-${createHash('sha256').update('alert\0' + id).digest('hex').slice(0, 20)}`;
}

function alertSource(entry) {
  return sources.get(entry.source)?.[0] ?? 'unknown';
}

function alertRevision(entry) {
  const prefix = sources.get(entry.source)?.[1];
  if (entry.status !== 'active' || entry.acknowledgedAt != null || !prefix ||
      typeof entry.targetId !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,39}$/i.test(entry.targetId)
      || entry.id !== `${prefix}:${entry.targetId}` || !Number.isSafeInteger(entry.openedAt)
      || entry.openedAt < 0 || !Number.isSafeInteger(entry.updatedAt) || entry.updatedAt < 0
      || !Number.isSafeInteger(entry.occurrences) || entry.occurrences < 1) return null;
  // An alert update replaces the Inbox record, even if the clock has not advanced.
  if (!revisions.has(entry)) revisions.set(entry, 'alert-revision-' + randomBytes(12).toString('hex'));
  return revisions.get(entry);
}

module.exports = { ALERT_ALIAS, ALERT_REVISION, alertAlias, alertSource, alertRevision };
