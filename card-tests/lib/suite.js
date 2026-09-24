'use strict';

// לוגיקה משותפת למריץ הרגיל, למצב השוואת הגרסאות ולמבחני הרגישות.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PRODUCTION_FILES } = require('./env');

const SUITE_DIR = path.join(__dirname, '..');
const SNAPSHOT_DIR = path.join(SUITE_DIR, 'snapshots');
const BASELINE_FILE = path.join(SUITE_DIR, 'BASELINE_SHA256.txt');
const CONTRACT_DIR = path.join(SUITE_DIR, '..', 'contract-tests');

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

// השוואת שבעת קבצי הייצור לחתימות הבסיס הנעול.
function baselineReport(toolDir) {
  const expected = new Map();
  for (const line of fs.readFileSync(BASELINE_FILE, 'utf8').split('\n')) {
    const m = /^([0-9a-f]{64})\s+(.+)$/.exec(line.trim());
    if (m) expected.set(m[2], m[1]);
  }
  const changed = [];
  const missing = [];
  for (const file of Object.values(PRODUCTION_FILES)) {
    const full = path.join(toolDir, file);
    if (!fs.existsSync(full)) missing.push(file);
    else if (expected.get(file) !== sha256(full)) changed.push(file);
  }
  return { changed, missing };
}

function loadScenarios() {
  const all = [
    ...require('../scenarios/matrix').build(),
    ...require('../scenarios/interactions').build(),
    ...require('../scenarios/chain').build(),
    ...require('../scenarios/redirects').build(),
    ...require('../scenarios/wikiredirects').build(),
  ];
  const seen = new Set();
  for (const s of all) {
    if (!s.id) throw new Error('תרחיש בלי מזהה');
    if (seen.has(s.id)) throw new Error(`מזהה תרחיש כפול: ${s.id}`);
    if (!/^[A-Za-z0-9._-]+$/.test(s.id)) throw new Error(`מזהה תרחיש חייב להיות באותיות לטיניות: ${s.id}`);
    seen.add(s.id);
  }
  return all;
}

function snapshotPath(id) {
  return path.join(SNAPSHOT_DIR, `${id}.json`);
}

function snapshotBody(scn, frames) {
  return { id: scn.id, title: scn.title, level: scn.level, profile: scn.profile || null, frames };
}

function readSnapshot(id) {
  const file = snapshotPath(id);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

// הסבר קצר של ההבדל הראשון בין שתי סדרות מסגרות.
function describeDiff(before, after, labels) {
  const [was, now] = labels || ['היה', 'כעת'];
  const out = [];
  const n = Math.max(before.length, after.length);
  for (let i = 0; i < n; i++) {
    const a = before[i];
    const b = after[i];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    if (!a || !b) {
      out.push(`מסגרת ${i + 1}: ${!a ? 'נוספה' : 'חסרה'} (${(a || b).step})`);
      break;
    }
    out.push(`מסגרת ${i + 1} (${b.step}):`);
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      if (JSON.stringify(a[key]) === JSON.stringify(b[key])) continue;
      if (key === 'dom') {
        const regions = new Set([...Object.keys(a.dom || {}), ...Object.keys(b.dom || {})]);
        for (const r of regions) {
          const la = (a.dom && a.dom[r]) || [];
          const lb = (b.dom && b.dom[r]) || [];
          if (JSON.stringify(la) === JSON.stringify(lb)) continue;
          const removed = la.filter((l) => lb.indexOf(l) === -1).slice(0, 8);
          const added = lb.filter((l) => la.indexOf(l) === -1).slice(0, 8);
          out.push(`  מבנה (${r}):`);
          for (const l of removed) out.push(`    - ${l}`);
          for (const l of added) out.push(`    + ${l}`);
          if (!removed.length && !added.length) out.push('    (אותן שורות בסדר שונה)');
        }
      } else {
        out.push(`  ${key}:`);
        out.push(`    ${was}: ${JSON.stringify(a[key] === undefined ? null : a[key]).slice(0, 400)}`);
        out.push(`    ${now}: ${JSON.stringify(b[key] === undefined ? null : b[key]).slice(0, 400)}`);
      }
    }
    break;
  }
  return out;
}

// כשלים מול תמונת הייחוס השמורה. מחזיר רשימת שורות (ריקה אם זהה).
function snapshotFailures(scn, frames) {
  const stored = readSnapshot(scn.id);
  if (!stored) return ['אין תמונת ייחוס לתרחיש (יש ליצור אותה במפורש עם ‎--update-snapshots)'];
  if (JSON.stringify(stored.frames) === JSON.stringify(frames)) return [];
  return ['ההתנהגות שונה מתמונת הייחוס:', ...describeDiff(stored.frames, frames).map((l) => '  ' + l)];
}

module.exports = {
  SUITE_DIR,
  SNAPSHOT_DIR,
  CONTRACT_DIR,
  baselineReport,
  loadScenarios,
  snapshotPath,
  snapshotBody,
  readSnapshot,
  describeDiff,
  snapshotFailures,
};
