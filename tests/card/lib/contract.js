'use strict';

// שימוש חוזר במודל הרשת של סוויטת החוזה, בלי לשכפל אותו ובלי לשנות
// את קבצי הסוויטה. הקובץ נקרא מהדיסק ומוערך בזיכרון עם החזרה של
// הפונקציות הפנימיות שהוא לא מייצא. אם שם של פונקציה ישתנה שם, הטעינה
// תיכשל מיד ובקול, ולא בשקט.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const INTERNALS = [
  'makeNetwork',
  'groupCalls',
  'normalizeResult',
  'normalizeError',
  'stableSortObject',
];

let cached = null;

function loadContract(contractDir) {
  contractDir = path.resolve(contractDir);
  if (cached && cached.dir === contractDir) return cached;
  const harnessPath = path.join(contractDir, 'harness.js');
  const source = fs.readFileSync(harnessPath, 'utf8');
  const wrapper =
    '(function (require, module, exports) {\n' +
    source +
    '\n;return {' + INTERNALS.join(', ') + '};\n})';
  const factory = vm.runInThisContext(wrapper, { filename: harnessPath });
  const mod = { exports: {} };
  const internals = factory(require, mod, mod.exports);
  for (const name of INTERNALS) {
    if (typeof internals[name] !== 'function') {
      throw new Error(`רתמת החוזה אינה מכילה את ${name}`);
    }
  }

  const scenarios = require(path.join(contractDir, 'scenarios.js'));
  const snapshotDir = path.join(contractDir, 'snapshots');
  function snapshot(id) {
    return JSON.parse(fs.readFileSync(path.join(snapshotDir, `${id}.json`), 'utf8'));
  }

  cached = { dir: contractDir, ...internals, scenarios, snapshot };
  return cached;
}

module.exports = { loadContract };
