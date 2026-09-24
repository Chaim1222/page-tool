#!/usr/bin/env node
'use strict';

// בדיקות ליכולת "מאז הייבוא": הקובץ הראשי וקובץ העדכון רצים כפי שהם,
// בדפדפן מדומה עם ג'יי-קוורי אמיתי. הליבה מוחלפת בגרסה מדומה שמספקת
// תוצאת "נמצא" ורושמת כל שאילתה. התלויות נלקחות מסוויטת הכרטיסים:
//   npm install && node tests/update/run.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const req = (name) => require(require.resolve(name, { paths: [ROOT] }));
const { JSDOM, VirtualConsole } = req('jsdom');
const JQUERY = fs.readFileSync(require.resolve('jquery/dist/jquery.js', { paths: [ROOT] }), 'utf8');
const MAIN = fs.readFileSync(path.join(ROOT, 'site/main.js'), 'utf8');
const UPDATE = fs.readFileSync(path.join(ROOT, 'site/update.js'), 'utf8');

const DAY = 86400000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

function structureError(context) {
  const err = new Error('התשובה מהשרת התקבלה, אך חסר בה מידע צפוי.');
  err.netError = true; err.kind = 'structure'; err.context = context; err.transient = false;
  return err;
}
function transientError(message = 'השרת לא ענה בזמן.') {
  const err = new Error(message);
  err.netError = true; err.kind = 'timeout'; err.transient = true;
  return err;
}
function permanentError(message = 'התשובה מהשרת התקבלה, אך חסר בה מידע צפוי.') {
  const err = new Error(message);
  err.netError = true; err.kind = 'structure'; err.transient = false;
  return err;
}

// ---------------------------------------------------------------------------
// סביבה
// ---------------------------------------------------------------------------
async function boot(spec = {}) {
  const errors = [];
  const consoleErrors = [];
  const vc = new VirtualConsole();
  vc.on('error', (...a) => consoleErrors.push(a.map(String).join(' ')));
  vc.on('jsdomError', (e) => errors.push('jsdom: ' + e.message));

  const dom = new JSDOM(
    '<!doctype html><html lang="he" dir="rtl"><head></head><body>' +
      '<div id="content"><div class="mw-indicators"></div><h1>מקומי</h1>' +
      '<div id="bodyContent"><div id="mw-content-text"><p>תוכן</p></div></div></div></body></html>',
    { url: 'https://www.hamichlol.org.il/wiki/מקומי', runScripts: 'outside-only', virtualConsole: vc }
  );
  const w = dom.window;
  const ctx = dom.getInternalVMContext();
  new vm.Script(JQUERY).runInContext(ctx);
  const $ = w.jQuery;
  const rendered = (el) => {
    if (!el || !el.isConnected) return false;
    for (let n = el; n && n.nodeType === 1; n = n.parentNode) {
      if (n.style && n.style.display === 'none') return false;
    }
    return true;
  };
  $.expr.pseudos.visible = rendered;
  $.expr.pseudos.hidden = (el) => !rendered(el);

  const calls = [];
  const scripts = [];
  const counters = {};
  const toWin = (v) => w.JSON.parse(JSON.stringify(v));

  function answer(kind, handler, params, url) {
    const n = (counters[kind] = (counters[kind] || 0) + 1);
    calls.push({ kind, url: url || null, params: JSON.parse(JSON.stringify(params)) });
    let out;
    try {
      out = handler(params, n);
    } catch (e) {
      return Promise.reject(e);
    }
    // תשובה מושהית: מאפשרת לקבוע איזה חלק מסתיים ראשון.
    const wait = out && out.delay ? settle(out.delay) : Promise.resolve();
    return wait.then(() => {
      if (out && out.error) throw out.error;
      return toWin(out && out.delay ? out.data : out);
    });
  }

  const localHistory = spec.localHistory || (() => ({ query: { pageids: ['9'], pages: { 9: { title: 'מקומי', revisions: [
    { revid: 7, timestamp: ago(3 * 30 * DAY), user: 'פלוני', comment: 'עדכון מוויקיפדיה גרסה 100' },
  ] } } } }));
  const wpRevisions = spec.wpRevisions || (() => ({ query: { pageids: ['1'], pages: { 1: { title: 'בסיס', revisions: [
    { revid: 300, size: 42180 }, { revid: 250, size: 41800 }, { revid: 100, size: 40940 },
  ] } } } }));
  const compare = spec.compare || (() => ({ compare: { '*': '<tr><td class="diff-marker"></td><td class="diff-deletedline"><div>ישן</div></td><td class="diff-marker"></td><td class="diff-addedline"><div>חדש</div></td></tr>' } }));

  const core = {
    run() {
      return Promise.resolve({
        localStateMatched: false,
        result: Object.assign({
          status: 'found',
          title: 'בסיס',
          page: { revisions: [{ size: 42180, revid: spec.currentRevid === undefined ? 300 : spec.currentRevid }], langlinks: [] },
        }, spec.resultExtra || {}),
      });
    },
    getCurrentLocalPage() { return { size: 42000 }; },
    getOwnFields() { return { דף: 'בסיס', גרסה: spec.imported === undefined ? '100' : spec.imported, פריט: null }; },
    firstPage(data) {
      const q = data && data.query;
      if (!q || !q.pages) return null;
      const id = (q.pageids && q.pageids[0]) || Object.keys(q.pages)[0];
      return id ? q.pages[id] : null;
    },
    structureError,
    wpQuery(params) {
      if (params.action === 'compare') return answer('compare', compare, params, 'core-wp');
      return answer('wp', wpRevisions, params, 'core-wp');
    },
    localQuery(params) { return answer('local', localHistory, params, '/w/api.php'); },
    netGet(url, params) {
      if (params.action === 'compare') return answer('compare', compare, params, url);
      if (params.prop === 'revisions') return answer('wp', wpRevisions, params, url);
      return Promise.reject(new Error('unexpected netGet ' + url));
    },
  };

  let updateFailures = spec.updateScriptFailures || 0;
  w.mw = {
    config: { get: (k) => ({ wgCategories: [], wgNamespaceNumber: 0, wgPageName: 'מקומי', wgAction: 'view', wgUserGroups: (spec.userGroups === undefined ? ['wikiupdate', 'aspaklaryaEditor'] : spec.userGroups), wgIsMainPage: false })[k] },
    user: { options: { get: (key) => key === 'userjs-import-source' && spec.direct ? 'direct' : null } },
    util: {
      addCSS(text) { const s = w.document.createElement('style'); s.textContent = text; w.document.head.appendChild(s); },
      getUrl: (t, p) => '/w/index.php?title=' + encodeURIComponent(t) + (p ? '&' + new w.URLSearchParams(p) : ''),
    },
    loader: {
      using: () => Promise.resolve(),
      getScript(url) {
        const title = decodeURIComponent(new URL(url, 'https://x').searchParams.get('title') || '');
        scripts.push(title);
        if (/update\.js$/.test(title)) {
          if (updateFailures > 0) { updateFailures--; return Promise.reject(new Error('load-failed')); }
          new vm.Script(UPDATE).runInContext(ctx);
          return Promise.resolve();
        }
        return Promise.reject(new Error('unexpected script ' + title));
      },
    },
  };
  w.HMK_PAGE_TOOL_CORE_FACTORY = () => core;
  w.console.error = (...a) => consoleErrors.push(a.map((x) => (x && x.message) || String(x)).join(' '));

  new vm.Script(MAIN).runInContext(ctx);
  await settle();
  return { w, $, calls, scripts, errors, consoleErrors };
}

async function settle(n = 20) {
  for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r));
}

// ---------------------------------------------------------------------------
// עזרים
// ---------------------------------------------------------------------------
const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (e) {
    results.push(['FAIL', name, e.message]);
  }
}
function ok(cond, msg) { if (!cond) throw new Error(msg); }
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg}: ציפינו ל־${JSON.stringify(b)}, התקבל ${JSON.stringify(a)}`); }
const text = (env, sel) => env.$(sel).text().replace(/\s+/g, ' ').trim();
async function click(env, sel) { env.$(sel).first().trigger('click'); await settle(); }
// מלל השורה בלי כפתור הניסיון החוזר; הכפתור נבדק בנפרד.
const panelLines = (env) => env.$('#hmk-update-panel .hmk-update-line').filter(':visible').map((i, el) => {
  const $c = env.$(el).clone();
  $c.find('button').remove();
  return $c.text().replace(/\s+/g, ' ').trim();
}).get();
const retryCount = (env) => env.$('#hmk-update-panel .hmk-update-retry').length;
const toggleLabel = (env) => env.$('.hmk-update-toggle > span').first().text();

// ---------------------------------------------------------------------------
// תרחישים
// ---------------------------------------------------------------------------
(async () => {
  await test('הפקד מוצג ליד מחוון הגודל, בלי קריאות ובלי טעינת קובץ לפני לחיצה', async () => {
    const env = await boot();
    ok(env.$('.mw-indicators .hmk-update-toggle').length === 1, 'אין פקד');
    eq(text(env, '.mw-indicators .hmk-diff'), 'ויקיפדיה: +180', 'המחוון השתנה');
    eq(env.calls.length, 0, 'קריאות לפני לחיצה');
    eq(env.scripts.length, 0, 'טעינת קבצים לפני לחיצה');
    eq(env.$('#hmk-update-panel').length, 0, 'חלונית לפני לחיצה');
  });

  await test('אין שינוי מאז הייבוא: אין פקד, אין קריאה ואין טעינה', async () => {
    const env = await boot({ currentRevid: 100 });
    eq(env.$('.hmk-update-toggle').length, 0, 'פקד מוצג');
    eq(env.calls.length + env.scripts.length, 0, 'פעילות מיותרת');
  });

  await test('אין פקד כששדה הגרסה חסר, אפס או לא מספרי', async () => {
    for (const imported of [null, '', '0', 'abc', '12.5', '-4']) {
      const env = await boot({ imported });
      eq(env.$('.hmk-update-toggle').length, 0, 'פקד מוצג עבור ' + JSON.stringify(imported));
    }
  });

  await test('אין פקד כשידוע שגרסת הייבוא נמחקה', async () => {
    const env = await boot({ resultExtra: { revidDeletedNotice: true, sourceFailures: [] } });
    eq(env.$('.hmk-update-toggle').length, 0, 'פקד מוצג');
  });

  await test('לחיצה ראשונה: קובץ אחד נטען, שתי שאילתות, החלונית בגוף הדף ולא בשורת המחוון', async () => {
    const env = await boot();
    await click(env, '.hmk-update-toggle');
    eq(env.scripts.length, 1, 'מספר טעינות');
    ok(/Gadget page tool\.update\.js$/.test(env.scripts[0]), 'קובץ שגוי');
    eq(env.calls.length, 2, 'מספר שאילתות');
    const local = env.calls.find((c) => c.kind === 'local');
    const wp = env.calls.find((c) => c.kind === 'wp');
    ok(local && /comment/.test(local.params.rvprop) && local.params.titles === 'מקומי', 'שאילתת ההיסטוריה המקומית');
    ok(wp && String(wp.params.rvendid) === '100' && wp.params.rvprop === 'ids|size' && wp.params.rvdir === 'older', 'שאילתת ויקיפדיה');
    eq(wp.url, '/import/get_wik1i.php', 'מקור גרסאות ברירת מחדל');
    eq(wp.params.rvlimit, 500, 'גודל עמוד גרסאות');
    ok(env.$('#bodyContent > #hmk-update-panel').length === 1, 'החלונית לא בגוף הדף');
    eq(env.$('.mw-indicators #hmk-update-panel').length, 0, 'החלונית בשורת המחוון');
    eq(env.$('.hmk-update-toggle').attr('aria-expanded'), 'true', 'מצב פתוח');
  });

  await test('עדכון: הזמן והמשתמש מהיסטוריית המכלול, והשינויים מוויקיפדיה', async () => {
    const env = await boot();
    await click(env, '.hmk-update-toggle');
    const lines = panelLines(env);
    eq(lines[0], 'עודכן לפני 3 חודשים ע"י פלוני', 'שורת המכלול');
    eq(lines[1], 'בוויקיפדיה מאז גרסת הייבוא: שתי עריכות · +1,240 בתים', 'שורת ויקיפדיה');
    eq(lines.length, 2, 'שורה עודפת (הערת אי־התאמה?)');
  });

  await test('ייבוא בלי עדכון', async () => {
    const env = await boot({ localHistory: () => ({ query: { pageids: ['9'], pages: { 9: { revisions: [
      { revid: 9, timestamp: ago(DAY), user: 'אלמוני', comment: 'תיקון קישור' },
      { revid: 8, timestamp: ago(400 * DAY), user: 'פלוני', comment: 'יבוא מויקיפדיה העברית' },
    ] } } } }) });
    await click(env, '.hmk-update-toggle');
    eq(panelLines(env)[0], 'יובא לפני שנה ע"י פלוני · לא עודכן מאז', 'שורת המכלול');
  });

  await test('יש עדכונים ממוספרים אך אין התאמה: אין מידע גלוי + אי־התאמה', async () => {
    const env = await boot({ localHistory: () => ({ query: { pageids: ['9'], pages: { 9: { revisions: [
      { revid: 9, timestamp: ago(2 * DAY), user: 'פלוני', comment: 'עידכון מוויקיפדיה גירסה 250' },
    ] } } } }) });
    await click(env, '.hmk-update-toggle');
    const lines = panelLines(env);
    eq(lines[0], 'לא נמצא בהיסטוריית הגרסאות עדכון לגרסה הנוכחית.', 'שורת המכלול');
    eq(lines[1], 'העדכון האחרון מציין גרסה שונה ממספר הגרסה בתבנית המיון.', 'שורת אי־ההתאמה');
  });

  await test('נמצא עדכון תואם ישן יותר: זמנו מוצג, והעדכון האחרון השונה נשאר כממצא', async () => {
    const env = await boot({ localHistory: () => ({ query: { pageids: ['9'], pages: { 9: { revisions: [
      { revid: 12, timestamp: ago(DAY), user: 'חדש', comment: 'עדכון מוויקיפדיה גרסה 250' },
      { revid: 10, timestamp: ago(10 * DAY), user: 'תואם', comment: 'עדכון מוויקיפדיה גרסה 100' },
    ] } } } }) });
    await click(env, '.hmk-update-toggle');
    const lines = panelLines(env);
    eq(lines[0], 'עודכן לפני 10 ימים ע"י תואם', 'זמן העדכון התואם');
    eq(lines[1], 'העדכון האחרון מציין גרסה שונה ממספר הגרסה בתבנית המיון.', 'ממצא העדכון האחרון');
  });

  await test('אין תקציר מתאים בהיסטוריה: "אין מידע", בלי כפתור ניסיון חוזר', async () => {
    const env = await boot({ localHistory: () => ({ query: { pageids: ['9'], pages: { 9: { revisions: [
      { revid: 9, timestamp: ago(DAY), user: 'פלוני', comment: 'עריכה' },
    ] } } } }) });
    await click(env, '.hmk-update-toggle');
    eq(panelLines(env)[0], 'לא נמצא בהיסטוריית הגרסאות אירוע ייבוא או עדכון.', 'שורת המכלול');
    eq(env.$('.hmk-update-retry').length, 0, 'כפתור ניסיון חוזר');
  });

  await test('דפדוף בהיסטוריה המקומית: אובייקט ההמשך ממוזג כולו', async () => {
    const env = await boot({ localHistory: (p, n) => n === 1
      ? { continue: { rvcontinue: '20260101|5', continue: '||' }, query: { pageids: ['9'], pages: { 9: { revisions: [
          { revid: 9, timestamp: ago(DAY), user: 'א', comment: 'עריכה' } ] } } } }
      : { query: { pageids: ['9'], pages: { 9: { revisions: [
          { revid: 5, timestamp: ago(3 * 3600000), user: 'ב', comment: 'עדכון מויקיפדיה גרסה 100' } ] } } } } });
    await click(env, '.hmk-update-toggle');
    const local = env.calls.filter((c) => c.kind === 'local');
    eq(local.length, 2, 'מספר עמודים');
    eq(local[1].params.rvcontinue, '20260101|5', 'אסימון ההמשך');
    eq(local[1].params.continue, '||', 'אובייקט ההמשך');
    eq(panelLines(env)[0], 'עודכן לפני 3 שעות ע"י ב', 'שורת המכלול');
  });

  await test('כשל בהיסטוריה המקומית אינו מבטל את נתוני ויקיפדיה; ניסיון חוזר שולף רק אותה', async () => {
    // הכשל המקומי מגיע אחרי שנתוני ויקיפדיה כבר הוצגו.
    const env = await boot({ localHistory: (p, n) => (n === 1 ? { delay: 5, error: transientError() } : { query: { pageids: ['9'], pages: { 9: { revisions: [
      { revid: 5, timestamp: ago(DAY + 90000), user: 'ב', comment: 'עדכון מויקיפדיה גרסה 100' } ] } } } }) });
    await click(env, '.hmk-update-toggle');
    let lines = panelLines(env);
    eq(lines[0], 'מועד הייבוא: לא נבדק (השרת לא ענה בזמן.)', 'שורת המכלול בכשל');
    eq(retryCount(env), 1, 'כפתור ניסיון חוזר');
    eq(lines[1], 'בוויקיפדיה מאז גרסת הייבוא: שתי עריכות · +1,240 בתים', 'ויקיפדיה נשמרה');
    const before = env.calls.length;
    await click(env, '.hmk-update-retry');
    eq(env.calls.length - before, 1, 'מספר שאילתות בניסיון החוזר');
    eq(env.calls[env.calls.length - 1].kind, 'local', 'השאילתה החוזרת');
    lines = panelLines(env);
    eq(lines[0], 'עודכן לפני יום ע"י ב', 'שורת המכלול אחרי ניסיון חוזר');
    eq(lines[1], 'בוויקיפדיה מאז גרסת הייבוא: שתי עריכות · +1,240 בתים', 'ויקיפדיה נשארה');
  });

  await test('כשל בוויקיפדיה אינו מבטל את נתוני המכלול; ניסיון חוזר', async () => {
    // הכשל בוויקיפדיה מגיע אחרי שנתוני המכלול כבר הוצגו.
    const env = await boot({ wpRevisions: (p, n) => (n === 1 ? { delay: 5, error: transientError() } : { query: { pageids: ['1'], pages: { 1: { revisions: [
      { revid: 300, size: 100 }, { revid: 100, size: 100 } ] } } } }) });
    await click(env, '.hmk-update-toggle');
    let lines = panelLines(env);
    eq(lines[0], 'עודכן לפני 3 חודשים ע"י פלוני', 'המכלול נשמר');
    eq(lines[1], 'השינויים בוויקיפדיה: לא נבדקו (השרת לא ענה בזמן.)', 'שורת ויקיפדיה בכשל');
    eq(retryCount(env), 1, 'כפתור ניסיון חוזר');
    await click(env, '.hmk-update-retry');
    eq(panelLines(env)[1], 'בוויקיפדיה מאז גרסת הייבוא: עריכה אחת · ללא שינוי בגודל', 'אחרי ניסיון חוזר');
  });

  await test('כשל קבוע אינו מציע ניסיון חוזר', async () => {
    const env = await boot({ wpRevisions: () => ({ error: permanentError() }) });
    await click(env, '.hmk-update-toggle');
    eq(panelLines(env)[1], 'השינויים בוויקיפדיה: לא נבדקו (התשובה מהשרת התקבלה, אך חסר בה מידע צפוי.)', 'שורת ויקיפדיה');
    eq(retryCount(env), 0, 'כפתור ניסיון חוזר בכשל קבוע');
  });

  await test('גרסת ייבוא שאינה בהיסטוריית הדף: ממצא קבוע, בלי ניסיון חוזר', async () => {
    const env = await boot({ wpRevisions: () => ({ query: { pageids: ['1'], pages: { 1: { revisions: [
      { revid: 300, size: 1 }, { revid: 90, size: 1 } ] } } } }) });
    await click(env, '.hmk-update-toggle');
    eq(panelLines(env)[1], 'גרסת הייבוא אינה נמצאת בהיסטוריית הדף בוויקיפדיה.', 'שורת ויקיפדיה');
    eq(env.$('.hmk-update-retry').length, 0, 'כפתור ניסיון חוזר');
  });

  await test('גרסה שאינה קיימת כלל בוויקיפדיה: אותו ממצא קבוע', async () => {
    const err = Object.assign(new Error('api'), { netError: true, kind: 'api', code: 'nosuchrevid' });
    const env = await boot({ wpRevisions: () => ({ error: err }) });
    await click(env, '.hmk-update-toggle');
    eq(panelLines(env)[1], 'גרסת הייבוא אינה נמצאת בהיסטוריית הדף בוויקיפדיה.', 'שורת ויקיפדיה');
  });

  await test('קוד badid_rvendid: ממצא קבוע ולא שגיאת רשת', async () => {
    const err = Object.assign(new Error('api'), { netError: true, kind: 'api', code: 'badid_rvendid', transient: false });
    const env = await boot({ wpRevisions: () => ({ error: err }) });
    await click(env, '.hmk-update-toggle');
    eq(panelLines(env)[1], 'גרסת הייבוא אינה נמצאת בהיסטוריית הדף בוויקיפדיה.', 'שורת ויקיפדיה');
    eq(retryCount(env), 0, 'כפתור ניסיון חוזר');
  });

  await test('דפדוף בגרסאות ויקיפדיה: אובייקט ההמשך ממוזג, והספירה נכונה', async () => {
    const env = await boot({ wpRevisions: (p, n) => n === 1
      ? { continue: { rvcontinue: '250|200', continue: '||' }, query: { pageids: ['1'], pages: { 1: { revisions: [
          { revid: 300, size: 42180 }, { revid: 250, size: 41800 } ] } } } }
      : { query: { pageids: ['1'], pages: { 1: { revisions: [
          { revid: 200, size: 41400 }, { revid: 100, size: 42500 } ] } } } } });
    await click(env, '.hmk-update-toggle');
    const wp = env.calls.filter((c) => c.kind === 'wp');
    eq(wp.length, 2, 'מספר עמודים');
    eq(wp[1].params.continue, '||', 'אובייקט ההמשך');
    eq(panelLines(env)[1], 'בוויקיפדיה מאז גרסת הייבוא: 3 עריכות · -320 בתים', 'ספירה ושינוי שלילי');
  });

  await test('טבלת ההבדלים: רק בלחיצה, מגרסת הייבוא לגרסה שנספרה, בלי כפיית כיוון', async () => {
    const env = await boot();
    await click(env, '.hmk-update-toggle');
    eq(env.calls.filter((c) => c.kind === 'compare').length, 0, 'השוואה לפני לחיצה');
    await click(env, '.hmk-update-action');
    const cmp = env.calls.filter((c) => c.kind === 'compare');
    eq(cmp.length, 1, 'מספר השוואות');
    eq(String(cmp[0].params.fromrev) + '→' + String(cmp[0].params.torev), '100→300', 'טווח ההשוואה');
    eq(cmp[0].url, 'https://import.hamichlol.org.il/', 'מקור compare ברירת מחדל');
    const $t = env.$('#hmk-update-panel table.diff');
    ok($t.length === 1, 'אין טבלה');
    eq($t.attr('dir'), undefined, 'כיוון כפוי על הטבלה');
    ok($t.hasClass('diff-contentalign-right'), 'מחלקת יישור');
    eq($t.find('colgroup col').length, 4, 'מבנה עמודות');
    eq(text(env, '.hmk-update-action'), 'הסתר הבדלים', 'תווית הכפתור');
    await click(env, '.hmk-update-action');
    ok(!env.$('.hmk-update-diff').is(':visible'), 'הטבלה לא הוסתרה');
    await click(env, '.hmk-update-action');
    ok(env.$('.hmk-update-diff').is(':visible'), 'הטבלה לא הוצגה שוב');
    eq(env.calls.filter((c) => c.kind === 'compare').length, 1, 'השוואה חוזרת');
  });

  await test('מצב direct: גם הגרסאות וגם ההשוואה נשלחות ישירות לוויקיפדיה', async () => {
    const env = await boot({ direct: true });
    await click(env, '.hmk-update-toggle');
    const wp = env.calls.find((c) => c.kind === 'wp');
    eq(wp.url, 'https://he.wikipedia.org/w/api.php', 'מקור גרסאות direct');
    eq(wp.params.origin, '*', 'origin ב-direct');
    await click(env, '.hmk-update-action');
    const cmp = env.calls.find((c) => c.kind === 'compare');
    eq(cmp.url, 'https://he.wikipedia.org/w/api.php', 'מקור compare direct');
  });

  await test('ויקיפדיה נערכה אחרי טעינת הדף: ההבדלים מתארים את אותו טווח שנספר', async () => {
    const env = await boot({ wpRevisions: () => ({ query: { pageids: ['1'], pages: { 1: { revisions: [
      { revid: 310, size: 42300 }, { revid: 300, size: 42180 }, { revid: 100, size: 40940 } ] } } } }) });
    await click(env, '.hmk-update-toggle');
    await click(env, '.hmk-update-action');
    const cmp = env.calls.filter((c) => c.kind === 'compare');
    eq(String(cmp[0].params.torev), '310', 'יעד ההשוואה');
  });

  await test('כשהספירה נכשלה, ההבדלים עדיין זמינים מול הגרסה שהכלי ראה', async () => {
    const env = await boot({ currentRevid: 280, wpRevisions: () => ({ error: transientError() }) });
    await click(env, '.hmk-update-toggle');
    await click(env, '.hmk-update-action');
    const cmp = env.calls.filter((c) => c.kind === 'compare');
    eq(String(cmp[0].params.torev), '280', 'יעד ההשוואה');
    ok(env.$('#hmk-update-panel table.diff').length === 1, 'אין טבלה');
  });

  await test('כשל בטעינת ההבדלים: הודעה, וניסיון חוזר מצליח', async () => {
    const env = await boot({ compare: (p, n) => (n === 1 ? { error: transientError() } : { compare: { '*': '' } }) });
    await click(env, '.hmk-update-toggle');
    await click(env, '.hmk-update-action');
    eq(text(env, '.hmk-update-actions'), 'נסה שוב הבדלים: לא נבדקו (השרת לא ענה בזמן.)', 'מצב כשל');
    await click(env, '.hmk-update-action');
    eq(text(env, '.hmk-update-diff'), 'אין הבדלים בתוכן.', 'הבדלים ריקים');
  });

  await test('כשל קבוע בהבדלים: הודעה בלי ניסיון חוזר', async () => {
    const env = await boot({ compare: () => ({ error: permanentError() }) });
    await click(env, '.hmk-update-toggle');
    await click(env, '.hmk-update-action');
    eq(text(env, '.hmk-update-actions'), 'הצג הבדלים הבדלים: לא נבדקו (התשובה מהשרת התקבלה, אך חסר בה מידע צפוי.)', 'מצב כשל קבוע');
    eq(text(env, '.hmk-update-action'), 'הצג הבדלים', 'תווית הכפתור המוסתר');
    eq(env.$('.hmk-update-action:visible').length, 0, 'כפתור ההבדלים נשאר פעיל');
  });

  await test('סגירה ופתיחה בלי שאילתות נוספות; כפתור הסגירה מעדכן את הפקד', async () => {
    const env = await boot();
    await click(env, '.hmk-update-toggle');
    const n = env.calls.length;
    await click(env, '.hmk-update-close');
    ok(!env.$('#hmk-update-panel').is(':visible'), 'לא נסגרה');
    eq(env.$('.hmk-update-toggle').attr('aria-expanded'), 'false', 'מצב הפקד');
    await click(env, '.hmk-update-toggle');
    ok(env.$('#hmk-update-panel').is(':visible'), 'לא נפתחה');
    await click(env, '.hmk-update-toggle');
    ok(!env.$('#hmk-update-panel').is(':visible'), 'לא נסגרה מהפקד');
    eq(env.calls.length, n, 'שאילתות נוספות');
    eq(env.scripts.length, 1, 'טעינה נוספת');
  });

  await test('כשל בטעינת קובץ העדכון: הודעה בפקד, ולחיצה נוספת מנסה שוב', async () => {
    const env = await boot({ updateScriptFailures: 1 });
    await click(env, '.hmk-update-toggle');
    eq(toggleLabel(env), 'מאז הייבוא · הטעינה נכשלה, נסה שוב', 'תווית בכשל');
    eq(env.calls.length, 0, 'שאילתות אחרי כשל טעינה');
    await click(env, '.hmk-update-toggle');
    eq(env.scripts.length, 2, 'ניסיון טעינה חוזר');
    ok(env.$('#hmk-update-panel').is(':visible'), 'החלונית לא נפתחה');
    eq(toggleLabel(env), 'מאז הייבוא', 'תווית אחרי הצלחה');
  });

  await test('ניסוחי זמן וספירה', async () => {
    const cases = [
      [30000, 'עכשיו'], [90000, 'לפני דקה'], [150000, 'לפני שתי דקות'], [600000, 'לפני 10 דקות'],
      [3700000, 'לפני שעה'], [7300000, 'לפני שעתיים'], [5 * 3600000 + 1000, 'לפני 5 שעות'],
      [DAY + 1000, 'לפני יום'], [2 * DAY + 1000, 'לפני יומיים'], [10 * DAY, 'לפני 10 ימים'],
      [31 * DAY, 'לפני חודש'], [61 * DAY, 'לפני חודשיים'], [100 * DAY, 'לפני 3 חודשים'],
      [366 * DAY, 'לפני שנה'], [731 * DAY, 'לפני שנתיים'], [4 * 366 * DAY, 'לפני 4 שנים'],
    ];
    for (const [ms, expected] of cases) {
      const env = await boot({ localHistory: () => ({ query: { pageids: ['9'], pages: { 9: { revisions: [
        { revid: 1, timestamp: ago(ms), comment: 'עדכון מוויקיפדיה גרסה 100' } ] } } } }) });
      await click(env, '.hmk-update-toggle');
      eq(panelLines(env)[0], 'עודכן ' + expected, 'זמן ' + ms);
    }
  });

  await test('אין שגיאות לא מטופלות בכל ההרצות', async () => {
    const env = await boot();
    await click(env, '.hmk-update-toggle');
    await click(env, '.hmk-update-action');
    eq(env.errors.length, 0, env.errors.join(' | '));
  });

  await test('ללא קבוצות הרשאה: הנתונים מוצגים, אין כפתור הבדלים ואין compare', async () => {
    const env = await boot({ userGroups: [] });
    await click(env, '.hmk-update-toggle');
    ok(panelLines(env).some((line) => line.indexOf('בוויקיפדיה מאז גרסת הייבוא:') === 0), 'נתוני ויקיפדיה לא הוצגו');
    eq(env.$('.hmk-update-action').length, 0, 'כפתור הבדלים הוצג ללא הרשאה');
    eq(env.calls.filter((c) => c.kind === 'compare').length, 0, 'נשלחה שאילתת compare ללא הרשאה');
  });

  await test('חברות בקבוצה אחת בלבד אינה מציגה כפתור הבדלים', async () => {
    for (const groups of [['wikiupdate'], ['aspaklaryaEditor']]) {
      const env = await boot({ userGroups: groups });
      await click(env, '.hmk-update-toggle');
      eq(env.$('.hmk-update-action').length, 0, 'כפתור הבדלים הוצג עבור ' + groups.join(','));
      eq(env.calls.filter((c) => c.kind === 'compare').length, 0, 'נשלחה שאילתת compare עבור ' + groups.join(','));
    }
  });

  for (const [status, name, msg] of results) console.log(status + ' ' + name + (msg ? '\n     ' + msg : ''));
  const failed = results.filter((r) => r[0] === 'FAIL').length;
  console.log(`\nסה"כ: ${results.length - failed}/${results.length} עברו.`);
  process.exit(failed ? 1 : 0);
})();
