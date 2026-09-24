#!/usr/bin/env node
'use strict';

// מריץ את כל תרחישי הכרטיס ובודק בכל אחד את ההתנהגות המצופה.
// שימוש: node tests/card/run.js [--scenario <מזהה>] [--grep <טקסט>]

// אזור זמן קבוע, כדי שתאריכי היומן יהיו זהים בכל מחשב.
process.env.TZ = 'Asia/Jerusalem';

const path = require('path');
const { loadContract } = require('./lib/contract');
const { runScenario } = require('./lib/runner');
const suite = require('./lib/suite');
const { duplicateMessageKeys } = require('./lib/duplicate-keys-check');

async function main() {
  const argv = process.argv.slice(2);
  const ids = [];
  let grep = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--scenario') ids.push(argv[++i]);
    else if (argv[i] === '--grep') grep = argv[++i];
    else throw new Error(`ארגומנט לא מוכר: ${argv[i]}`);
  }

  const toolDir = path.join(suite.SUITE_DIR, '..', '..');
  let failed = 0;

  // מפתח כפול בקובץ המלל דורס בשקט את ההגדרה הקודמת.
  const dups = duplicateMessageKeys(toolDir);
  if (dups.length) {
    console.log(`מפתחות כפולים בקובץ המלל: ${dups.join(', ')}`);
    failed++;
  }

  let scenarios = suite.loadScenarios();
  if (ids.length) scenarios = scenarios.filter((s) => ids.includes(s.id));
  if (grep) scenarios = scenarios.filter((s) => s.id.includes(grep) || (s.title || '').includes(grep));

  const contract = loadContract(suite.CONTRACT_DIR);
  const started = Date.now();
  for (const scn of scenarios) {
    const run = await runScenario(scn, { toolDir, contract });
    const ok = run.failures.length === 0;
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${scn.id}`);
    for (const f of run.failures) console.log('    ' + f);
  }
  console.log(`\nסה"כ: ${scenarios.length - failed}/${scenarios.length} עברו, ${((Date.now() - started) / 1000).toFixed(1)} שניות.`);
  return failed ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exit(2);
  }
);
