'use strict';

// רמה ב': השרשרת המלאה. הקובץ הראשי, הליבה האמיתית, הכרטיס, הפרטים
// וקובץ העיצוב רצים יחד על 25 תרחישי סוויטת החוזה (שנקראים ממנה ולא
// מועתקים). בכל תרחיש נבדקים שני דברים:
//
// 1. תוצאת הליבה שהתקבלה בתוך השרשרת זהה לתמונת הייחוס של סוויטת
//    החוזה: אותה תוצאה, אותה שגיאה ואותן קריאות רשת עד נקודת הסיום.
//    זה מוכיח שהרשת כאן היא אותה רשת, ושהחיבור לקובץ הראשי לא שינה דבר.
// 2. מה שהמשתמש רואה תואם את אופן המסירה: כרטיס, העלמה, כרטיס כשל
//    או ביטול שקט.

const path = require('path');
const { loadContract } = require('../lib/contract');

const CONTRACT_DIR = path.join(__dirname, '..', '..', 'contract-tests');

const TITLE_BY_STATUS = {
  renamed: 'renamedTitle',
  redirect: 'redirectTitle',
  already_synced: 'alreadyHandledTitle',
  disambiguation: 'disambigTitle',
  chain_too_long: 'chainTooLongTitle',
  cycle_detected: 'cycleTitle',
  unknown: 'unknownTitle',
  deleted: 'deletedTitle',
};

function envelopeOf(contract, entry) {
  if (!entry) return null;
  if (entry.outcome) {
    const result = entry.outcome.result;
    const hasWarning = !!(result && (result.revidDeletedNotice || (result.sourceFailures && result.sourceFailures.length)));
    const suppressed = !!entry.outcome.localStateMatched && !hasWarning;
    return {
      terminal: 'success',
      delivery: suppressed ? 'suppressed' : 'render',
      localStateMatched: suppressed,
      result: contract.normalizeResult(result),
      error: null,
      calls: contract.groupCalls(entry.calls),
    };
  }
  const err = entry.error;
  return {
    terminal: err && err.silent ? 'silent' : 'failure',
    delivery: err && err.silent ? 'silent' : 'failure',
    localStateMatched: false,
    result: null,
    error: contract.normalizeError(err),
    calls: contract.groupCalls(entry.calls),
  };
}

// התנהגויות קיימות שאינן רצויות, מתועדות ולא מתוקנות בשלב הזה.
const KNOWN_ISSUES = {
  'error-silent':
    'בביטול שקט של הבקשה שלד הטעינה נשאר ומסתובב. ביטול כזה קורה בפועל בעיקר ' +
    'ביציאה מהדף, ולכן ההשפעה זניחה.',
};

// דף מקומי שהוא הפניה, שמצבו אינו תואם לוויקיפדיה, עובר למסלול ההפניות של
// הכרטיס. המסלול שואל את המודל המקומי על שרשרת ההפניה, ולכן הדף ויעדו
// מוגדרים בו. היעד קיים כערך: ההפניה תקינה, והכלל הוא שיקוף בלבד.
function localRedirectRoute(cs, delivery, hasWarning) {
  const local = cs.local || {};
  if (!local.redirect || delivery !== 'render' || hasWarning) return null;
  const t = local.redirectTarget || { title: 'יעד', fragment: null };
  return {
    [cs.pageName]: { redirectTo: t.title, fragment: t.fragment || undefined },
    [t.title]: { body: 'ערך היעד.' },
  };
}

function chainScenario(contract, cs) {
  const expected = contract.snapshot(cs.id);
  const delivery = expected.delivery;
  const status = expected.result && expected.result.status;
  const hasWarning = !!(expected.result && (expected.result.revidDeletedNotice || (expected.result.sourceFailures || []).length));
  const redirectRoute = localRedirectRoute(cs, delivery, hasWarning);

  return {
    level: 'B',
    id: `B-${cs.id}`,
    contractId: cs.id,
    title: `שרשרת מלאה: ${cs.name}`,
    group: 'רמה ב: שרשרת מלאה',
    profile: 'מפעיל',
    knownIssue: KNOWN_ISSUES[cs.id],
    localPages: redirectRoute || undefined,
    start: {
      allow: { consoleErrors: delivery === 'failure' ? 1 : 0 },
      check(c) {
        const entry = c.env.coreOutcomes[0];
        c.eq(c.env.coreOutcomes.length, 1, 'הליבה רצה פעם אחת');
        const actual = envelopeOf(contract, entry);
        const a = JSON.stringify(contract.stableSortObject(actual));
        const e = JSON.stringify(contract.stableSortObject(expected));
        if (a !== e) {
          c.fail('תוצאת הליבה בשרשרת שונה מתמונת הייחוס של סוויטת החוזה');
          for (const k of ['terminal', 'delivery', 'localStateMatched', 'result', 'error', 'calls']) {
            const ak = JSON.stringify(contract.stableSortObject(actual ? actual[k] : null));
            const ek = JSON.stringify(contract.stableSortObject(expected[k]));
            if (ak !== ek) c.fail(`  השדה ${k} שונה: צפוי ${ek.slice(0, 300)} | התקבל ${ak.slice(0, 300)}`);
          }
        }

        const cardEl = c.card();
        if (delivery === 'suppressed') {
          c.ok(!cardEl, 'מצב מקומי תואם: אין כרטיס');
          c.eq(c.count('#hmk-tool .hmk-skeleton'), 0, 'אין שלד טעינה שנשאר');
          c.eq(c.reads('userinfo').length, 0, 'אין שליפת הרשאות כשאין כרטיס');
        } else if (delivery === 'failure') {
          c.eq(c.title(), c.STR && c.STR.checkFailedTitle, 'כרטיס כשל');
          c.eq(c.labels(), c.STR ? [c.STR.btnRetry] : [], 'ניסיון חוזר');
        } else if (delivery === 'silent') {
          c.ok(!cardEl, 'ביטול שקט: אין כרטיס');
        } else if (status === 'found' && !hasWarning) {
          c.ok(!cardEl, 'נמצא בלי אזהרות: אין כרטיס');
          c.ok(c.exists('.mw-indicators .hmk-diff'), 'מחוון הגודל מוצג');
        } else if (redirectRoute) {
          c.ok(!!cardEl, 'צפוי כרטיס');
          c.eq(c.title(), c.STR && c.STR.lrDifferentTitle, 'הפניה מקומית תקינה ליעד שונה: כרטיס שיקוף');
          c.eq(c.labels(), [], 'הפניה מקומית: אין פעולות');
        } else {
          c.ok(!!cardEl, 'צפוי כרטיס');
          const key = hasWarning && status === 'found' ? null : TITLE_BY_STATUS[status];
          if (key && c.STR && !(expected.result && expected.result.localStateMatched)) {
            c.eq(c.title(), c.STR[key], 'כותרת הכרטיס לפי המצב');
          }
        }
      },
    },
    steps: [{ do: 'open', name: 'פתיחת-פרטים', ifPresent: true }],
  };
}

function build() {
  const contract = loadContract(CONTRACT_DIR);
  return contract.scenarios.map((cs) => chainScenario(contract, cs));
}

module.exports = { build, envelopeOf };
