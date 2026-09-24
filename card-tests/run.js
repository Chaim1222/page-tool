#!/usr/bin/env node
'use strict';

// אזור הזמן קבוע, כדי שתאריכי היומן בפרטים (שעה מקומית) יהיו זהים
// בכל מחשב. חייב לקרות לפני כל שימוש בתאריכים.
process.env.TZ = 'Asia/Jerusalem';

const fs = require('fs');
const path = require('path');
const { loadContract } = require('./lib/contract');
const { runScenario } = require('./lib/runner');
const suite = require('./lib/suite');
const { duplicateMessageKeys } = require('./lib/duplicate-keys-check');

function parseArgs(argv) {
  const args = {
    tool: path.join(suite.SUITE_DIR, '..'),
    compare: null,
    update: false,
    requireBaseline: false,
    list: false,
    ids: [],
    grep: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tool') args.tool = argv[++i];
    else if (a === '--compare') args.compare = argv[++i];
    else if (a === '--scenario') args.ids.push(argv[++i]);
    else if (a === '--grep') args.grep = argv[++i];
    else if (a === '--update-snapshots') args.update = true;
    else if (a === '--require-baseline') args.requireBaseline = true;
    else if (a === '--list') args.list = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`ארגומנט לא מוכר: ${a}`);
  }
  if (args.update && args.compare) throw new Error('אי אפשר לעדכן תמונות ייחוס במצב השוואה');
  return args;
}

function reportBaseline(label, toolDir) {
  const report = suite.baselineReport(toolDir);
  const prefix = label ? `${label}: ` : '';
  // מפתח כפול בקובץ המלל דורס בשקט את ההגדרה הקודמת; זה כשל, לא הערה.
  const dups = duplicateMessageKeys(toolDir);
  if (dups.length) {
    console.log(`${prefix}מפתחות כפולים בקובץ המלל: ${dups.join(', ')}`);
    process.exitCode = 1;
  }
  if (!report.changed.length && !report.missing.length) {
    console.log(`${prefix}קבצי הייצור זהים לבסיס הנעול.`);
  } else {
    if (report.missing.length) console.log(`${prefix}קבצי ייצור חסרים: ${report.missing.join(', ')}`);
    if (report.changed.length) console.log(`${prefix}קבצי ייצור שונים מהבסיס הנעול: ${report.changed.join(', ')}`);
  }
  return report;
}

function summarize(results, started) {
  const groups = new Map();
  for (const r of results) {
    const g = r.scn.group || 'אחר';
    const entry = groups.get(g) || { pass: 0, fail: 0 };
    entry[r.ok ? 'pass' : 'fail']++;
    groups.set(g, entry);
  }
  console.log('');
  for (const [g, e] of groups) console.log(`${g}: ${e.pass} עברו${e.fail ? `, ${e.fail} נכשלו` : ''}`);

  const known = results.filter((r) => r.scn.knownIssue);
  if (known.length) {
    console.log('');
    console.log('התנהגויות ידועות שמתועדות בתמונות הייחוס (לא תוקנו בשלב הזה):');
    for (const r of known) console.log(`  ${r.scn.id}: ${r.scn.knownIssue}`);
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log('');
  console.log(`סה"כ: ${results.length - failed}/${results.length} עברו, ${((Date.now() - started) / 1000).toFixed(1)} שניות.`);
  return failed;
}

// מצב רגיל: הרצה מול תמונות הייחוס השמורות.
async function runAgainstSnapshots(args, scenarios, toolDir, contract) {
  fs.mkdirSync(suite.SNAPSHOT_DIR, { recursive: true });
  const started = Date.now();
  const results = [];
  for (const scn of scenarios) {
    const run = await runScenario(scn, { toolDir, contract });
    const failures = run.failures.slice();
    let note = '';

    if (args.update) {
      if (failures.length) {
        note = ' (תמונת הייחוס לא נכתבה: בדיקות הכוונה נכשלו)';
      } else {
        const file = suite.snapshotPath(scn.id);
        const text = JSON.stringify(suite.snapshotBody(scn, run.frames), null, 2) + '\n';
        const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
        if (before !== text) {
          fs.writeFileSync(file, text);
          note = before === null ? ' (נוצרה תמונת ייחוס)' : ' (תמונת הייחוס עודכנה)';
        }
      }
    } else {
      failures.push(...suite.snapshotFailures(scn, run.frames));
    }

    const ok = failures.length === 0;
    results.push({ scn, ok });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${scn.id}${note}`);
    if (!ok) for (const f of failures) console.log('    ' + f);
  }

  // תמונות ייחוס שאין להן תרחיש: נמחקות רק בעדכון מלא ולא מסונן.
  if (!args.ids.length && !args.grep) {
    const known = new Set(suite.loadScenarios().map((s) => `${s.id}.json`));
    const stale = fs.readdirSync(suite.SNAPSHOT_DIR).filter((f) => f.endsWith('.json') && !known.has(f));
    for (const f of stale) {
      if (args.update) {
        fs.unlinkSync(path.join(suite.SNAPSHOT_DIR, f));
        console.log(`נמחקה תמונת ייחוס יתומה: ${f}`);
      } else {
        console.log(`תמונת ייחוס יתומה (אין לה תרחיש): ${f}`);
        results.push({ scn: { id: f, group: 'תמונות יתומות' }, ok: false });
      }
    }
  }
  return summarize(results, started);
}

// מצב השוואה: שתי גרסאות של הכלי מורצות על אותם תרחישים, והמסגרות
// שלהן מושוות זו לזו. תמונות הייחוס אינן משתתפות.
async function runComparison(args, scenarios, toolDir, otherDir, contract) {
  const started = Date.now();
  const results = [];
  let same = 0;
  for (const scn of scenarios) {
    const a = await runScenario(scn, { toolDir, contract });
    const b = await runScenario(scn, { toolDir: otherDir, contract });
    const lines = [];
    for (const f of a.failures) lines.push(`[גרסה א] ${f}`);
    for (const f of b.failures) lines.push(`[גרסה ב] ${f}`);
    const identical = JSON.stringify(a.frames) === JSON.stringify(b.frames);
    if (identical) same++;
    else lines.push('ההתנהגות שונה בין הגרסאות:', ...suite.describeDiff(a.frames, b.frames, ['א', 'ב']).map((l) => '  ' + l));
    const ok = lines.length === 0;
    results.push({ scn, ok });
    console.log(`${identical ? 'SAME' : 'DIFF'} ${scn.id}${a.failures.length || b.failures.length ? ' (כשלי כוונה)' : ''}`);
    if (!ok) for (const l of lines) console.log('    ' + l);
  }
  console.log('');
  console.log(`התנהגות זהה ב-${same} מתוך ${scenarios.length} תרחישים.`);
  return summarize(results, started);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(fs.readFileSync(path.join(suite.SUITE_DIR, 'README.md'), 'utf8'));
    return 0;
  }
  const toolDir = path.resolve(args.tool);
  const contract = loadContract(suite.CONTRACT_DIR);

  let scenarios = suite.loadScenarios();
  if (args.ids.length) scenarios = scenarios.filter((s) => args.ids.includes(s.id));
  if (args.grep) scenarios = scenarios.filter((s) => s.id.includes(args.grep) || (s.title || '').includes(args.grep));
  if (args.list) {
    for (const s of scenarios) console.log(`${s.id}\t${s.title}`);
    return 0;
  }
  if (!scenarios.length) {
    console.log('לא נמצאו תרחישים לפי הסינון.');
    return 1;
  }

  if (args.compare) {
    const otherDir = path.resolve(args.compare);
    const ra = reportBaseline('גרסה א', toolDir);
    const rb = reportBaseline('גרסה ב', otherDir);
    if (ra.missing.length || rb.missing.length) return 1;
    return (await runComparison(args, scenarios, toolDir, otherDir, contract)) ? 1 : 0;
  }

  const report = reportBaseline('', toolDir);
  if (report.missing.length) return 1;
  if (args.requireBaseline && report.changed.length) return 1;
  return (await runAgainstSnapshots(args, scenarios, toolDir, contract)) ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exit(2);
  }
);
