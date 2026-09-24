'use strict';

// בדיקות קבועות שרצות אחרי כל צעד בכל תרחיש, ועזרים לבדיקות הכוונה
// של תרחישים ספציפיים. תמונת ייחוס אומרת רק שההתנהגות לא השתנתה;
// הבדיקות כאן אומרות שהיא נכונה.

const { capabilitiesFromRights } = require('../fixtures/profiles');

const WRITE_STEPS = new Set(['click', 'press', 'settle', 'advance']);
const SUSPICIOUS_TEXT = /\bundefined\b|\[object Object\]|\bNaN\b/;

function lastRuntime(env) {
  return env.cardRuntimes.length ? env.cardRuntimes[env.cardRuntimes.length - 1] : null;
}

// מיפוי תווית פעולה → היכולת שהיא דורשת. תווית שאינה מוכרת כאן נכשלת
// במפורש, כדי שכל פעולה חדשה תחייב עדכון מודע של המפרט.
function requiredCapabilities(label, STR) {
  // עריכה ובקשה פתוחות לכל משתמש רשום, ומשתמש לא רשום אינו מריץ את הכלי.
  if (label === STR.btnRetry) return [];
  if (label === STR.btnMakeRedirect || label === STR.btnRetargetRedirect) return [];
  if (label === STR.btnRequestMove || label === STR.btnRequestDelete) return [];
  if (label === STR.btnMoveWithRedirect) return [['moveWithRedirect']];
  if (label === STR.btnMoveNoRedirect) return [['moveWithoutRedirect']];
  if (label === STR.btnDelete) return [['deletePage']];
  const probe = STR.btnDeleteAndMove('\u0000');
  const [pre, post] = probe.split('\u0000');
  if (label.startsWith(pre) && label.endsWith(post)) {
    return [['deletePage', 'deleteRedirect'], ['moveWithRedirect', 'moveWithoutRedirect']];
  }
  if (label === STR.btnMove) return 'pending';
  return null;
}

function actionControls(env) {
  const doc = env.window.document;
  return [...doc.querySelectorAll('#hmk-tool .hmk-actions > *')].map((el) => ({
    label: el.textContent.trim(),
    tag: el.tagName.toLowerCase(),
    href: el.getAttribute('href'),
    disabled: !!el.disabled,
    style: [...el.classList].filter((c) => c.indexOf('hmk-btn-') === 0).map((c) => c.slice(8))[0] || '',
  }));
}

function warnRows(env) {
  return [...env.window.document.querySelectorAll('#hmk-tool .hmk-card .hmk-cardwarn')].map((row) => {
    const spans = row.querySelectorAll('span');
    return spans.length ? spans[spans.length - 1].textContent : row.textContent;
  });
}

function checkInvariants(env, frame, step, fail) {
  const tag = `[${frame.step}]`;
  const allow = step.allow || {};

  for (const u of frame.uncaught) {
    if (!allow.uncaught) fail(`${tag} שגיאה שלא נתפסה: ${u}`);
  }
  for (const r of frame.routeErrors) fail(`${tag} בקשה ללא נתיב מוגדר: ${r}`);

  const errors = frame.console.filter((c) => c.level === 'error');
  const warns = frame.console.filter((c) => c.level === 'warn');
  const expectedErrors = allow.consoleErrors || 0;
  if (errors.length !== expectedErrors) {
    fail(`${tag} צפויות ${expectedErrors} שגיאות במסוף, נמצאו ${errors.length}: ${errors.map((e) => e.text).join(' | ')}`);
  }
  if (warns.length) fail(`${tag} אזהרות במסוף: ${warns.map((e) => e.text).join(' | ')}`);

  if (frame.writes.length && !WRITE_STEPS.has(step.do)) {
    fail(`${tag} בקשת כתיבה בצעד שאינו פעולה: ${JSON.stringify(frame.writes)}`);
  }

  const doc = env.window.document;
  const cards = doc.querySelectorAll('#hmk-tool .hmk-card');
  if (cards.length > 1) fail(`${tag} יותר מכרטיס אחד במכל (${cards.length})`);
  const panels = doc.querySelectorAll('#hmk-tool .hmk-panel');
  if (panels.length > 1) fail(`${tag} יותר מפאנל אחד במכל (${panels.length})`);
  if (doc.querySelectorAll('#hmk-tool').length > 1) fail(`${tag} יותר ממכל אחד בדף`);

  const rows = warnRows(env);
  const seen = new Set();
  for (const r of rows) {
    if (seen.has(r)) fail(`${tag} שורת אזהרה כפולה: ${r}`);
    seen.add(r);
  }

  for (const [region, lines] of Object.entries(frame.dom)) {
    for (const line of lines) {
      if (SUSPICIOUS_TEXT.test(line)) fail(`${tag} טקסט חשוד באזור ${region}: ${line.trim()}`);
    }
  }

  // חיבור בין הקובץ הראשי לכרטיס: היכולות שהכרטיס קיבל תואמות לכלל
  // המיפוי, וכשל טעינה פירושו שאין אף יכולת.
  const runtime = lastRuntime(env);
  if (runtime) {
    const caps = runtime.userCapabilities || {};
    if (runtime.userCapabilitiesLoadFailed) {
      for (const [k, v] of Object.entries(caps)) {
        if (v) fail(`${tag} טעינת ההרשאות נכשלה אך היכולת ${k} פעילה`);
      }
    } else {
      const expected = capabilitiesFromRights(env.spec.rights).caps;
      for (const k of Object.keys(expected)) {
        if (!!caps[k] !== expected[k]) fail(`${tag} היכולת ${k}: הכרטיס קיבל ${!!caps[k]}, לפי הכלל ${expected[k]}`);
      }
    }

    // כל פעולה גלויה מותרת לפי היכולות.
    const STR = runtime.STR;
    for (const a of actionControls(env)) {
      const req = requiredCapabilities(a.label, STR);
      if (req === null) {
        fail(`${tag} תווית פעולה שאינה במפרט: "${a.label}"`);
        continue;
      }
      if (req === 'pending') {
        if (!step.allowPending) fail(`${tag} כפתור העברה כללי אחרי שהבדיקה הסתיימה`);
        continue;
      }
      for (const anyOf of req) {
        if (!anyOf.some((k) => caps[k])) fail(`${tag} הפעולה "${a.label}" מוצגת בלי יכולת ${anyOf.join(' או ')}`);
      }
    }
  }
}

// עזרים לבדיקות כוונה. c.fail מוסיף כשל עם שם הצעד.
function helpers(env, frame, fail) {
  const doc = env.window.document;
  const $ = env.$;
  const runtime = lastRuntime(env);
  const tag = `[${frame.step}]`;
  const c = {
    env,
    frame,
    $,
    doc,
    STR: runtime ? runtime.STR : null,
    runtime,
    fail: (msg) => fail(`${tag} ${msg}`),
    ok(cond, msg) {
      if (!cond) c.fail(msg);
    },
    eq(actual, expected, msg) {
      const a = JSON.stringify(actual);
      const e = JSON.stringify(expected);
      if (a !== e) c.fail(`${msg}: צפוי ${e}, התקבל ${a}`);
    },
    text(selector) {
      const el = doc.querySelector(selector);
      return el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
    },
    // כתובת הקישור אחרי פענוח קידוד האחוזים, לשם השוואה קריאה.
    href(selector) {
      const el = doc.querySelector(selector);
      if (!el) return null;
      try {
        return decodeURIComponent(el.getAttribute('href'));
      } catch (e) {
        return el.getAttribute('href');
      }
    },
    exists(selector) {
      return !!doc.querySelector(selector);
    },
    count(selector) {
      return doc.querySelectorAll(selector).length;
    },
    visible(selector) {
      const el = doc.querySelector(selector);
      return !!el && env.isRendered(el);
    },
    card: () => doc.querySelector('#hmk-tool .hmk-card'),
    cardType() {
      const card = c.card();
      if (!card) return null;
      const m = [...card.classList].find((x) => x.indexOf('hmk-card-') === 0);
      return m ? m.slice(9) : null;
    },
    title: () => c.text('#hmk-tool .hmk-card .hmk-title'),
    body: () => c.text('#hmk-tool .hmk-card .hmk-text'),
    status: () => {
      const el = doc.querySelector('#hmk-tool .hmk-action-status');
      return el && env.isRendered(el) ? el.textContent.trim() : '';
    },
    actions: () => actionControls(env),
    labels: () => actionControls(env).map((a) => a.label),
    warnings: () => warnRows(env),
    hasPermissionWarning: () => !!runtime && warnRows(env).indexOf(runtime.STR.permissionsLoadFailed) !== -1,
    reads: (route) => frame.reads.filter((r) => !route || routeOf(r) === route),
    writes: () => frame.writes,
    scripts: () => frame.scripts,
    scriptLoads(name) {
      return env.log.scripts.filter((s) => s === name).length;
    },
  };
  return c;
}

function routeOf(read) {
  const { classify } = require('./network');
  return classify(read.endpoint, read.params).route;
}

module.exports = { checkInvariants, helpers, requiredCapabilities, actionControls, warnRows, routeOf };
