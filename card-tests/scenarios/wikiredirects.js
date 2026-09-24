'use strict';

// הפניות מוויקיפדיה (א, ב) ודף שאינו קיים (ג).
//
// המפרט (מסמך "מפרט: הפניות מוויקיפדיה ודף שאינו קיים"):
// - א וב: רק כשמחוון הגודל מוצג, ורק למשתמש מחובר. זיהוי בשתי שאילתות;
//   בלי ממצא אין פקד. הדף עצמו מוחרג; הפניה מקומית - מתעלמים; מוגנת מפני
//   יצירה - מוצגת בלי כפתור ולא נספרת.
// - החלונית: כותרת ותוכן בכל שורה; היעד מוחלף בשם המקומי והשאר נשמר;
//   עריכה בלחיצה; "סימון הכול" כמתג, בלי שורות אפורות; שורה שנכשלה נשארת
//   מסומנת; שורה שנמחקה בעבר - ברקע אפור לקבוצת אספקלריה, ולאחרים לא מוצגת.
// - שמירה: תג, סימון בוט, הסרה ממעקב, יצירה בלבד, ואישור עיון לפני כל שמירה.
// - ג: בדף שאינו קיים, כרטיס רק כשהפניה בוויקיפדיה קיימת במכלול כערך;
//   אחרת, וגם בכשל, שקט. הליבה אינה נקראת. תיוג מנטרים למי שיכול לערוך
//   ואינו יכול להעביר, בפסקה חדשה בדף הבקשות (שלעולם אינו לוח מובנה).

const { levelA } = require('./matrix');
const { PAGE } = require('../fixtures/results');

const WP_TITLE = 'בסיס'; // שם ויקיפדיה של הערך בתוצאת "נמצא" שבקטלוג
const GROUP_A = 'הפניות מוויקיפדיה';
const GROUP_C = 'דף שאינו קיים';
const PANEL = '#hmk-redirects-panel';
const TOGGLE = '.mw-indicators .hmk-redirects-toggle';
const CATEGORY = '[[קטגוריה:הפניות]]';
const REQUESTS = 'המכלול:בקשות לעדכון שמות ערכים';

function wpRedirect(target, fragment) {
  return `#הפניה [[${target}${fragment ? '#' + fragment : ''}]]\n${CATEGORY}`;
}

function rs(c) {
  const list = c.env.redirectsFeatures;
  return list.length ? list[list.length - 1].STR : null;
}

function toggleLabel(c) {
  const el = c.doc.querySelector(TOGGLE + ' > span');
  return el ? el.textContent.trim() : null;
}

function rows(c) {
  return [...c.doc.querySelectorAll(PANEL + ' tbody tr')].map((tr) => {
    const text = tr.querySelector('.hmk-redirects-text');
    const status = tr.querySelector('.hmk-redirects-status');
    const edited = tr.querySelector('.hmk-redirects-edited');
    return {
      title: tr.querySelector('td:nth-child(2) a').textContent.trim(),
      deleted: tr.classList.contains('hmk-redirects-deleted'),
      check: tr.querySelector('input[type=checkbox]'),
      importBtn: tr.querySelector('.hmk-redirects-import'),
      text: text ? text.textContent : null,
      editable: !!(text && text.hasAttribute('tabindex')),
      edited: !!(edited && c.env.isRendered(edited)),
      status: status ? status.textContent.replace(/\s+/g, ' ').trim() : '',
      notes: [...tr.querySelectorAll('.hmk-redirects-note')].map((n) => n.textContent.replace(/\s+/g, ' ').trim()),
    };
  });
}

function row(c, title) {
  return rows(c).find((r) => r.title === title) || null;
}

function rowSel(n, inner) {
  return `${PANEL} tbody tr:nth-child(${n}) ${inner}`;
}

const OPEN = { do: 'press', selector: TOGGLE, name: 'פתיחה' };
const SELECT_ALL = { do: 'press', selector: PANEL + ' .hmk-redirects-select-all', name: 'סימון-הכול' };
const IMPORT_SELECTED = { do: 'press', selector: PANEL + ' .hmk-redirects-import-selected', name: 'ייבוא-מסומנים' };

function importRow(n) {
  return { do: 'press', selector: rowSel(n, '.hmk-redirects-import'), name: `ייבוא-שורה-${n}` };
}

// ערך קיים, מצב "נמצא": מחוון הגודל מוצג, והפקד לידו.
function foundScenario(id, title, o) {
  return levelA('found', {
    id: `W-${id}`,
    title: `הפניות מוויקיפדיה: ${title}`,
    group: GROUP_A,
    profile: o.profile || 'יוצר',
    userName: o.userName === undefined ? 'בודק' : o.userName,
    userGroups: o.userGroups,
    reviewAck: o.reviewAck,
    plans: o.plans,
    recordWiki: o.recordWiki,
    net: Object.assign(
      {
        wpRedirects: { [WP_TITLE]: { titles: o.redirects || [], more: !!o.more } },
        wpTexts: o.texts || {},
        createProtected: o.createProtected || [],
        localLogs: o.localLogs || {},
      },
      o.net || {}
    ),
    localPages: o.localPages,
    start: o.start,
    steps: o.steps || [],
  });
}

// דף שאינו קיים במכלול. אין דף מקומי בשם הזה, והליבה מוזרקת רק כדי
// לספק את כלי הרשת; ריצת ההכרעה עצמה אסורה במסלול הזה.
function missingScenario(id, title, o) {
  const pageName = o.pageName || PAGE;
  return {
    level: 'A',
    id: `M-${id}`,
    title: `דף שאינו קיים: ${title}`,
    group: GROUP_C,
    profile: o.profile || 'עורך',
    pageName,
    articleId: o.articleId === undefined ? 0 : o.articleId,
    action: o.action,
    userName: 'בודק',
    fixture: { result: null, ownFields: {} },
    localPages: o.localPages || {},
    net: Object.assign(
      {
        wpRedirects: { [o.wpTitle || pageName]: { titles: o.redirects || [] } },
      },
      o.net || {}
    ),
    plans: o.plans,
    recordWiki: o.recordWiki,
    start: o.start,
    steps: o.steps || [],
  };
}

function noCoreRun(c) {
  c.eq(c.env.log.runs.length, 0, 'ההכרעה בליבה לא הורצה');
}

function build() {
  const out = [];

  // ---------------------------------------------------------------
  // א וב: זיהוי ופקד
  // ---------------------------------------------------------------
  out.push(
    foundScenario('no-redirects', 'אין הפניות בוויקיפדיה: אין פקד, ואין שאילתה מקומית', {
      start: {
        check(c) {
          c.ok(c.exists('.mw-indicators .hmk-diff'), 'מחוון הגודל מוצג');
          c.ok(!c.exists(TOGGLE), 'אין פקד');
          c.eq(c.reads('wp-linkshere').length, 1, 'שאילתת ההפניות בוויקיפדיה');
          c.eq(c.reads('local-exists').length, 0, 'אין שאילתה מקומית בלי כותרות');
        },
      },
    }),
    foundScenario('anonymous', 'משתמש לא מחובר: אין טעינת מודול ואין שאילתות', {
      userName: null,
      redirects: ['כינוי'],
      start: {
        check(c) {
          c.ok(!c.exists(TOGGLE), 'אין פקד');
          c.eq(c.reads('wp-linkshere').length, 0, 'אין שאילתה לוויקיפדיה');
          c.eq(c.scriptLoads('Gadget page tool.redirects.js'), 0, 'המודול לא נטען');
        },
      },
    }),
    foundScenario('counts', 'מונים: חסרות וערך נפרד; הדף עצמו מוחרג; הפניה מקומית ומוגנת לא נספרות', {
      redirects: ['כינוי א', 'כינוי ב', 'ערך נפרד', PAGE, 'מוגנת', 'כינוי ג'],
      createProtected: ['מוגנת'],
      localPages: {
        'כינוי ב': { redirectTo: 'אחר' },
        'ערך נפרד': { body: 'ערך.' },
      },
      start: {
        check(c) {
          c.eq(toggleLabel(c), 'הפניות חסרות (2) · ערך נפרד (1)', 'תווית הפקד');
          c.eq(c.reads('local-exists').length, 1, 'שאילתה מקומית אחת לכל הכותרות');
          c.eq(c.reads('wp-content').length, 0, 'התוכן לא נשלף לפני פתיחה');
          c.eq(c.reads('local-log').length, 0, 'היומן לא נבדק לפני פתיחה');
          c.eq(c.scriptLoads('Gadget page tool.redirects.js'), 1, 'המודול נטען פעם אחת');
          const q = c.reads('local-exists')[0].params;
          c.ok(q.titles.split('|').indexOf(PAGE) === -1, 'הדף עצמו לא נשאל');
        },
      },
    }),
    foundScenario('separate-only', 'רק ערך נפרד: תווית בלי חסרות, והחלונית בלי טבלה', {
      redirects: ['ערך נפרד'],
      localPages: { 'ערך נפרד': { body: 'ערך.' } },
      start: {
        check(c) {
          c.eq(toggleLabel(c), 'ערך נפרד (1)', 'תווית הפקד');
        },
      },
      steps: [
        {
          ...OPEN,
          check(c) {
            c.eq(c.count(PANEL + ' table'), 0, 'אין טבלה');
            c.eq(c.text(PANEL + ' .hmk-redirects-separate li a'), 'ערך נפרד', 'קישור לערך');
            c.eq(c.href(PANEL + ' .hmk-redirects-separate li a'), '/wiki/ערך_נפרד', 'הקישור לערך במכלול');
            c.ok(c.text(PANEL + ' .hmk-redirects-separate li').indexOf(rs(c).separateRow) !== -1, 'השורה משקפת בלבד');
            c.eq(c.count(PANEL + ' button.hmk-redirects-btn'), 0, 'אין כפתורי פעולה');
          },
        },
      ],
    }),
    foundScenario('detect-failure', 'כשל בזיהוי: אין פקד, ורישום במסוף', {
      redirects: ['כינוי'],
      net: { faults: { [`wp-linkshere:${WP_TITLE}`]: { type: 'api', code: 'test-failure' } } },
      start: {
        allow: { consoleErrors: 1 },
        check(c) {
          c.ok(!c.exists(TOGGLE), 'אין פקד');
          c.ok(c.exists('.mw-indicators .hmk-diff'), 'מחוון הגודל נשאר');
        },
      },
    }),
    levelA('renamed', {
      id: 'W-not-in-move-card',
      title: 'הפניות מוויקיפדיה: בכרטיס שינוי שם אין פקד ואין שאילתה',
      group: GROUP_A,
      profile: 'יוצר',
      userName: 'בודק',
      net: {
        wp: { 'ישן': { missing: true } },
        wpRedirects: { 'חדש': { titles: ['כינוי'] } },
      },
      start: {
        check(c) {
          c.ok(!c.exists(TOGGLE), 'אין פקד');
          c.eq(c.reads('wp-linkshere').length, 0, 'אין שאילתת הפניות');
        },
      },
    })
  );

  // ---------------------------------------------------------------
  // א וב: החלונית
  // ---------------------------------------------------------------
  const TWO = {
    redirects: ['כינוי א', 'כינוי ב'],
    texts: { 'כינוי א': wpRedirect(WP_TITLE), 'כינוי ב': wpRedirect(WP_TITLE, 'היסטוריה') },
  };

  out.push(
    foundScenario('panel', 'פתיחה: כותרת ותוכן, היעד הוחלף והשאר נשמר, סימון וייבוא', {
      ...TWO,
      redirects: ['כינוי א', 'כינוי ב', 'ערך נפרד'],
      localPages: { 'ערך נפרד': { body: 'ערך.' } },
      steps: [
        {
          ...OPEN,
          check(c) {
            const R = rs(c);
            c.ok(c.visible(PANEL), 'החלונית מוצגת');
            c.eq(c.doc.querySelector(TOGGLE).getAttribute('aria-expanded'), 'true', 'הפקד פתוח');
            const list = rows(c);
            c.eq(list.map((r) => r.title), ['כינוי א', 'כינוי ב'], 'השורות');
            c.eq(list[0].text, `#הפניה [[${PAGE}]]\n${CATEGORY}`, 'היעד הוחלף, הקטגוריה נשמרה');
            c.eq(list[1].text, `#הפניה [[${PAGE}#היסטוריה]]\n${CATEGORY}`, 'הפסקה נשמרה');
            c.ok(list[0].notes.indexOf(R.targetChanged(WP_TITLE)) !== -1, 'הערת היעד בוויקיפדיה');
            c.ok(list.every((r) => r.check && r.importBtn && r.editable), 'תיבה, כפתור ועריכה בכל שורה');
            c.eq(c.text(PANEL + ' .hmk-redirects-select-all'), R.selectAll, 'סימון הכול');
            c.eq(c.text(PANEL + ' .hmk-redirects-import-selected'), R.importSelected(0), 'ייבוא מסומנים');
            c.ok(c.doc.querySelector(PANEL + ' .hmk-redirects-import-selected').disabled, 'מושבת בלי סימון');
            c.eq(c.href(rowSel(1, 'td:nth-child(2) a')), 'https://he.wikipedia.org/w/index.php?title=כינוי א&redirect=no', 'קישור לוויקיפדיה בלי מעקב');
            c.eq(c.text(PANEL + ' .hmk-redirects-separate li a'), 'ערך נפרד', 'הערך הנפרד מתחת לטבלה');
            c.eq(c.reads('wp-content').length, 1, 'תוכן בשאילתה אחת');
            c.eq(c.reads('local-log').length, 2, 'יומן מחיקות לכל הפניה חסרה');
            c.eq(c.writes().length, 0, 'אין כתיבה בפתיחה');
          },
        },
      ],
    }),
    foundScenario('import-one', 'ייבוא שורה: אישור עיון, פרמטרי השמירה, קישור להפניה, והמונה יורד', {
      ...TWO,
      recordWiki: true,
      steps: [
        OPEN,
        {
          ...importRow(1),
          check(c) {
            const R = rs(c);
            c.eq(
              c.writes().map((w) => w.params),
              [
                {
                  action: 'edit',
                  bot: true,
                  createonly: true,
                  format: 'json',
                  tags: 'ייבוא-הפניות',
                  text: `#הפניה [[${PAGE}]]\n${CATEGORY}`,
                  title: 'כינוי א',
                  watchlist: 'unwatch',
                },
              ],
              'בקשת השמירה'
            );
            c.eq(c.env.log.events.filter((e) => e === 'אישור עיון').length, 1, 'אישור עיון לפני השמירה');
            c.eq(row(c, 'כינוי א').status, `${R.imported} · כינוי א`, 'מצב השורה');
            c.eq(c.href(rowSel(1, '.hmk-redirects-status a')), '/w/index.php?title=כינוי_א&redirect=no', 'קישור להפניה במכלול');
            c.ok(!row(c, 'כינוי א').importBtn, 'הכפתור הוסר');
            c.ok(row(c, 'כינוי א').check.disabled, 'התיבה מושבתת');
            c.ok(!row(c, 'כינוי א').editable, 'אין עריכה אחרי ייבוא');
            c.eq(toggleLabel(c), 'הפניות חסרות (1)', 'המונה ירד');
          },
        },
      ],
    }),
    foundScenario('select-toggle-and-retry', 'סימון הכול כמתג; ייבוא מסומנים בזה אחר זה; כשל באמצע אינו עוצר; שורה שנכשלה נשארת מסומנת', {
      redirects: ['כינוי א', 'כינוי ב', 'כינוי ג'],
      texts: { 'כינוי א': wpRedirect(WP_TITLE), 'כינוי ב': wpRedirect(WP_TITLE), 'כינוי ג': wpRedirect(WP_TITLE) },
      plans: { edit: [{}, { error: 'test-save-error' }, {}] },
      steps: [
        OPEN,
        {
          ...SELECT_ALL,
          check(c) {
            const R = rs(c);
            c.ok(rows(c).every((r) => r.check.checked), 'הכול מסומן');
            c.eq(c.text(PANEL + ' .hmk-redirects-select-all'), R.clearAll, 'המתג הפך לביטול');
            c.eq(c.text(PANEL + ' .hmk-redirects-import-selected'), R.importSelected(3), 'שלושה מסומנים');
          },
        },
        {
          ...SELECT_ALL,
          name: 'ביטול-הסימון',
          check(c) {
            c.ok(rows(c).every((r) => !r.check.checked), 'הסימון בוטל');
          },
        },
        SELECT_ALL,
        {
          ...IMPORT_SELECTED,
          check(c) {
            const R = rs(c);
            c.eq(c.writes().map((w) => w.params.title), ['כינוי א', 'כינוי ב', 'כינוי ג'], 'לפי הסדר');
            c.eq(c.env.log.events.filter((e) => e === 'אישור עיון').length, 1, 'אישור העיון נקרא פעם אחת לכל הפעולה');
            c.eq(row(c, 'כינוי א').status, `${R.imported} · כינוי א`, 'הראשונה יובאה');
            c.eq(row(c, 'כינוי ב').status, `${R.importFailed} test-save-error`, 'השנייה נכשלה');
            c.eq(row(c, 'כינוי ג').status, `${R.imported} · כינוי ג`, 'השלישית יובאה אחרי הכשל');
            c.ok(row(c, 'כינוי ב').check.checked, 'השורה שנכשלה נשארת מסומנת');
            c.eq(c.text(PANEL + ' .hmk-redirects-summary'), R.summary(2, 1), 'שורת הסיכום');
            c.eq(c.text(PANEL + ' .hmk-redirects-import-selected'), R.importSelected(1), 'נשארה אחת מסומנת');
          },
        },
        {
          ...IMPORT_SELECTED,
          name: 'ייבוא-חוזר',
          check(c) {
            const R = rs(c);
            c.eq(c.writes().map((w) => w.params.title), ['כינוי ב'], 'רק השורה שנכשלה');
            c.eq(c.text(PANEL + ' .hmk-redirects-summary'), R.summary(1, 0), 'סיכום הניסיון החוזר');
            c.eq(toggleLabel(c), 'הפניות מוויקיפדיה', 'אין עוד חסרות');
          },
        },
      ],
    }),
    foundScenario('locked-during-import', 'בזמן ייבוא הטבלה נעולה: אין סימון ואין עריכה', {
      ...TWO,
      plans: { edit: [{ delay: 1000 }, {}] },
      steps: [
        OPEN,
        SELECT_ALL,
        {
          ...IMPORT_SELECTED,
          settle: { advance: false },
          check(c) {
            const list = rows(c);
            c.ok(list.every((r) => r.check.disabled), 'התיבות מושבתות');
            c.ok(list.every((r) => !r.editable), 'אין עריכה');
            c.ok(c.doc.querySelector(PANEL + ' .hmk-redirects-select-all').disabled, 'סימון הכול מושבת');
            c.eq(c.writes().length, 1, 'שמירה אחת בכל רגע');
          },
        },
        {
          do: 'advance',
          ms: 1000,
          name: 'סיום',
          check(c) {
            c.eq(c.writes().length, 1, 'השמירה השנייה אחרי הראשונה');
            c.eq(c.text(PANEL + ' .hmk-redirects-summary'), rs(c).summary(2, 0), 'סיכום');
          },
        },
      ],
    }),
    foundScenario('deleted-group', 'נמחקה בעבר, משתמש בקבוצת אספקלריה: שורה אפורה עם סיבה וקישור ליומן, סימון ידני בלבד', {
      ...TWO,
      userGroups: ['aspaklaryaEditor'],
      localLogs: { 'כינוי ב': { delete: [{ action: 'delete', comment: 'הפניה מיותרת', timestamp: '2025-05-01T00:00:00Z' }] } },
      steps: [
        {
          ...OPEN,
          check(c) {
            const R = rs(c);
            const gray = row(c, 'כינוי ב');
            c.ok(gray && gray.deleted, 'השורה אפורה');
            c.eq(gray.notes[0], `${R.deletedBefore('הפניה מיותרת')} · ${R.deletionLog}`, 'סיבה וקישור');
            c.eq(c.href(rowSel(2, 'td:nth-child(2) .hmk-redirects-note a')), '/w/index.php?title=Special:Log&type=delete&page=כינוי ב', 'קישור ליומן');
            c.ok(gray.check && gray.importBtn, 'ניתנת לייבוא');
            c.eq(toggleLabel(c), 'הפניות חסרות (2)', 'נספרת לקבוצה');
          },
        },
        {
          ...SELECT_ALL,
          check(c) {
            c.ok(row(c, 'כינוי א').check.checked, 'הרגילה סומנה');
            c.ok(!row(c, 'כינוי ב').check.checked, 'האפורה לא סומנה');
            c.eq(c.text(PANEL + ' .hmk-redirects-select-all'), rs(c).clearAll, 'כל הרגילות מסומנות');
          },
        },
        {
          do: 'press',
          selector: rowSel(2, 'input[type=checkbox]'),
          name: 'סימון-ידני',
          check(c) {
            c.ok(row(c, 'כינוי ב').check.checked, 'סומנה ידנית');
            c.eq(c.text(PANEL + ' .hmk-redirects-import-selected'), rs(c).importSelected(2), 'שתיים מסומנות');
          },
        },
      ],
    }),
    foundScenario('deleted-hidden', 'נמחקה בעבר, משתמש שאינו בקבוצה: לא מוצגת כלל, והמונה יורד אחרי הפתיחה', {
      ...TWO,
      localLogs: { 'כינוי ב': { delete: [{ action: 'delete', comment: 'הפניה מיותרת', timestamp: '2025-05-01T00:00:00Z' }] } },
      start: {
        check(c) {
          c.eq(toggleLabel(c), 'הפניות חסרות (2)', 'לפני הפתיחה נספרות שתיים');
        },
      },
      steps: [
        {
          ...OPEN,
          check(c) {
            c.eq(rows(c).map((r) => r.title), ['כינוי א'], 'רק השורה הרגילה');
            c.eq(toggleLabel(c), 'הפניות חסרות (1)', 'המונה ירד');
          },
        },
      ],
    }),
    foundScenario('protected', 'מוגנת מפני יצירה: שורה עם הערה, בלי תיבה ובלי כפתור, ולא נספרת', {
      redirects: ['כינוי א', 'מוגנת'],
      texts: { 'כינוי א': wpRedirect(WP_TITLE) },
      createProtected: ['מוגנת'],
      start: {
        check(c) {
          c.eq(toggleLabel(c), 'הפניות חסרות (1)', 'רק החסרה נספרת');
        },
      },
      steps: [
        {
          ...OPEN,
          check(c) {
            const p = row(c, 'מוגנת');
            c.ok(p && !p.check && !p.importBtn, 'בלי תיבה ובלי כפתור');
            c.ok(p.notes.indexOf(rs(c).createProtected) !== -1, 'הערת ההגנה');
            c.eq(c.reads('local-log').length, 1, 'יומן רק להפניה החסרה');
          },
        },
      ],
    }),
    foundScenario('gone-from-wikipedia', 'הפניה שנעלמה מוויקיפדיה בין הזיהוי לפתיחה: "התוכן לא נשלף", בלי פעולה', {
      redirects: ['כינוי א'],
      texts: { 'כינוי א': null },
      steps: [
        {
          ...OPEN,
          check(c) {
            const r = row(c, 'כינוי א');
            c.ok(r.notes.indexOf(rs(c).contentUnchecked) !== -1, 'הערה');
            c.ok(!r.check && !r.importBtn, 'בלי פעולה');
          },
        },
      ],
    }),
    foundScenario('more', 'מעל המכסה: הערה על הפניות נוספות', {
      ...TWO,
      more: true,
      steps: [
        {
          ...OPEN,
          check(c) {
            c.ok(c.text(PANEL + ' .hmk-redirects-body').indexOf(rs(c).more) !== -1, 'הערת "יש עוד"');
          },
        },
      ],
    }),
    foundScenario('log-unchecked', 'יומן המחיקות נכשל להפניה: הערה, בלי פעולה', {
      ...TWO,
      net: { faults: { 'local-log:כינוי ב:delete': { type: 'api', code: 'test-failure' } } },
      steps: [
        {
          ...OPEN,
          check(c) {
            const r = row(c, 'כינוי ב');
            c.ok(r.notes.indexOf(rs(c).logUnchecked) !== -1, 'הערה');
            c.ok(!r.check && !r.importBtn, 'בלי פעולה');
            c.ok(row(c, 'כינוי א').check, 'השורה האחרת לא נפגעה');
          },
        },
      ],
    }),
    foundScenario('close-reopen', 'סגירה ופתיחה מחדש, בלי שאילתות נוספות', {
      ...TWO,
      steps: [
        OPEN,
        {
          do: 'press',
          selector: PANEL + ' .hmk-redirects-close',
          name: 'סגירה',
          check(c) {
            c.ok(!c.visible(PANEL), 'החלונית מוסתרת');
            c.eq(c.doc.querySelector(TOGGLE).getAttribute('aria-expanded'), 'false', 'הפקד סגור');
          },
        },
        {
          ...OPEN,
          name: 'פתיחה-מחדש',
          check(c) {
            c.ok(c.visible(PANEL), 'החלונית מוצגת');
            c.eq(c.frame.reads.length, 0, 'אין שאילתות');
          },
        },
      ],
    })
  );

  // ---------------------------------------------------------------
  // א: עריכה והרשאות
  // ---------------------------------------------------------------
  const EDITED = `#הפניה [[${PAGE}]]\n[[קטגוריה:אחרת]]`;
  out.push(
    foundScenario('edit-save', 'עריכה בלחיצה: התוכן הנערך מסומן, והוא שנשמר', {
      ...TWO,
      steps: [
        OPEN,
        {
          do: 'press',
          selector: rowSel(1, '.hmk-redirects-text'),
          name: 'לחיצה-על-התוכן',
          check(c) {
            c.eq(c.count(rowSel(1, 'textarea')), 1, 'תיבת טקסט נפתחה');
          },
        },
        { do: 'type', selector: rowSel(1, 'textarea'), value: EDITED, name: 'הקלדה' },
        {
          do: 'blur',
          selector: rowSel(1, 'textarea'),
          name: 'יציאה',
          check(c) {
            const r = row(c, 'כינוי א');
            c.eq(r.text, EDITED, 'התוכן עודכן');
            c.ok(r.edited, 'מסומן "נערך"');
            c.eq(c.count(rowSel(1, 'textarea')), 0, 'התיבה נסגרה');
          },
        },
        {
          ...importRow(1),
          check(c) {
            c.eq(c.writes().map((w) => w.params.text), [EDITED], 'נשמר התוכן הנערך');
          },
        },
      ],
    }),
    foundScenario('edit-escape', 'מקש היציאה מבטל ומחזיר את התוכן שנשלף', {
      ...TWO,
      steps: [
        OPEN,
        { do: 'press', selector: rowSel(1, '.hmk-redirects-text'), name: 'לחיצה-על-התוכן' },
        { do: 'type', selector: rowSel(1, 'textarea'), value: EDITED, name: 'הקלדה' },
        {
          do: 'key',
          key: 'Escape',
          selector: rowSel(1, 'textarea'),
          name: 'יציאה-במקש',
          check(c) {
            const r = row(c, 'כינוי א');
            c.eq(r.text, `#הפניה [[${PAGE}]]\n${CATEGORY}`, 'התוכן שנשלף');
            c.ok(!r.edited, 'לא מסומן "נערך"');
          },
        },
      ],
    }),
    foundScenario('edit-keyboard', 'עריכה במקלדת: מקש הכניסה על התוכן פותח תיבה', {
      ...TWO,
      steps: [
        OPEN,
        {
          do: 'key',
          key: 'Enter',
          selector: rowSel(1, '.hmk-redirects-text'),
          name: 'מקש-כניסה',
          check(c) {
            c.eq(c.count(rowSel(1, 'textarea')), 1, 'תיבת טקסט נפתחה');
          },
        },
      ],
    }),
    foundScenario('edit-not-redirect', 'תוכן נערך בלי שורת הפניה: אין שמירה, והודעה בשורה', {
      ...TWO,
      steps: [
        OPEN,
        { do: 'press', selector: rowSel(1, '.hmk-redirects-text'), name: 'לחיצה-על-התוכן' },
        { do: 'type', selector: rowSel(1, 'textarea'), value: 'טקסט רגיל', name: 'הקלדה' },
        { do: 'blur', selector: rowSel(1, 'textarea'), name: 'יציאה' },
        {
          ...importRow(1),
          check(c) {
            c.eq(c.writes().length, 0, 'אין שמירה');
            c.eq(row(c, 'כינוי א').status, rs(c).notRedirect, 'הודעה');
          },
        },
      ],
    }),
    foundScenario('ack-unavailable', 'אישור העיון לא נטען: אין שמירה', {
      ...TWO,
      reviewAck: 'unavailable',
      steps: [
        OPEN,
        {
          ...importRow(1),
          check(c) {
            c.eq(c.writes().length, 0, 'אין שמירה');
            c.eq(row(c, 'כינוי א').status, rs(c).ackUnavailable, 'הודעה');
          },
        },
      ],
    }),
    foundScenario('created-meanwhile', 'ההפניה נוצרה בינתיים: יצירה בלבד עוצרת, ואין דריסה', {
      ...TWO,
      recordWiki: true,
      plans: { edit: [{ effect: (wiki) => wiki.put('כינוי א', { redirectTo: 'אחר' }) }] },
      steps: [
        OPEN,
        {
          ...importRow(1),
          check(c) {
            c.eq(c.writes().map((w) => w.outcome), ['error:articleexists'], 'השרת עצר');
            c.eq(row(c, 'כינוי א').status, rs(c).alreadyExists, 'הודעה');
          },
        },
      ],
    }),
    foundScenario('no-createpage', 'עורך בלי יצירת דף: הטבלה בלי תיבות, כפתורים וסרגל', {
      ...TWO,
      profile: 'עורך',
      steps: [
        {
          ...OPEN,
          check(c) {
            c.eq(rows(c).length, 2, 'השורות מוצגות');
            c.ok(rows(c).every((r) => !r.check && !r.importBtn && !r.editable), 'אין פעולות');
            c.eq(c.count(PANEL + ' .hmk-redirects-toolbar'), 0, 'אין סרגל');
          },
        },
      ],
    }),
    foundScenario('rights-failed', 'כשל בטעינת ההרשאות: אזהרה, ובלי פעולות', {
      ...TWO,
      profile: 'כשל-הרשאות',
      steps: [
        {
          ...OPEN,
          check(c) {
            c.ok(c.text(PANEL + ' .hmk-redirects-body').indexOf(rs(c).permissionsUnchecked) !== -1, 'אזהרה');
            c.ok(rows(c).every((r) => !r.check && !r.importBtn), 'אין פעולות');
          },
        },
      ],
    })
  );

  // ---------------------------------------------------------------
  // ג: דף שאינו קיים
  // ---------------------------------------------------------------
  const OLD = 'ישן';
  const TAG = { do: 'click', selector: '#hmk-tool .hmk-missing-row button', label: { str: 'btnTagMonitors' }, name: 'תיוג' };

  out.push(
    missingScenario('found-one', 'הפניה שקיימת במכלול כערך: כרטיס, בלי הרצת הליבה', {
      redirects: [OLD],
      localPages: { [OLD]: { body: 'ערך.' } },
      start: {
        check(c) {
          c.eq(c.title(), c.STR.missingTitle, 'כותרת');
          c.eq(c.cardType(), 'notice', 'סוג הכרטיס');
          c.eq(c.text('#hmk-tool .hmk-missing-row a'), OLD, 'קישור לערך');
          c.ok(c.body().indexOf(c.STR.missingRowText) !== -1, 'שורת הממצא');
          c.ok(c.body().indexOf(c.STR.missingFooter) !== -1, 'משפט הסיום');
          c.eq(c.text('#hmk-tool .hmk-missing-row button'), c.STR.btnTagMonitors, 'כפתור תיוג לעורך');
          c.eq(c.labels(), [], 'אין פעולות כרטיס');
          noCoreRun(c);
        },
      },
    }),
    missingScenario('found-two', 'שתי הפניות שקיימות כערכים: שורה לכל אחת, והפניה מקומית מתעלמים', {
      redirects: [OLD, 'ישן ב', 'כינוי מקומי'],
      localPages: { [OLD]: { body: 'ערך.' }, 'ישן ב': { body: 'ערך.' }, 'כינוי מקומי': { redirectTo: OLD } },
      start: {
        check(c) {
          const links = [...c.doc.querySelectorAll('#hmk-tool .hmk-missing-row > a')].map((a) => a.textContent);
          c.eq(links, [OLD, 'ישן ב'], 'שתי שורות');
        },
      },
    }),
    missingScenario('none', 'אין ממצא: שקט, ומשאבי הכרטיס לא נטענים', {
      redirects: ['כינוי'],
      start: {
        check(c) {
          c.ok(!c.exists('#hmk-tool'), 'אין מכל');
          c.eq(c.scriptLoads('Gadget page tool.card.js'), 0, 'הכרטיס לא נטען');
          noCoreRun(c);
        },
      },
    }),
    missingScenario('name-rules', 'כללי השמות: השאילתה על שם ויקיפדיה', {
      pageName: 'רבי משה',
      wpTitle: 'משה',
      redirects: [OLD],
      localPages: { [OLD]: { body: 'ערך.' } },
      start: {
        check(c) {
          c.eq(c.reads('wp-linkshere').map((r) => r.params.titles), ['משה'], 'שם ויקיפדיה');
          c.eq(c.title(), c.STR.missingTitle, 'כרטיס');
        },
      },
    }),
    missingScenario('failure', 'כשל בזיהוי: שקט ורישום במסוף, בלי כרטיס כשל', {
      redirects: [OLD],
      net: { faults: { [`wp-linkshere:${PAGE}`]: { type: 'api', code: 'test-failure' } } },
      start: {
        allow: { consoleErrors: 1 },
        check(c) {
          c.ok(!c.exists('#hmk-tool'), 'אין מכל');
          noCoreRun(c);
        },
      },
    }),
    missingScenario('tag-request-page', 'תיוג בדף הבקשות: פסקה חדשה בכותרת הערך שנמצא, עם תבנית המצב', {
      redirects: [OLD],
      localPages: { [OLD]: { body: 'ערך.' } },
      recordWiki: true,
      steps: [
        {
          ...TAG,
          check(c) {
            c.eq(
              c.writes().map((w) => w.params),
              [{ action: 'edit', format: 'json', section: 'new', sectiontitle: '[[ישן]]', text: '{{מצב|חדש}}\n{{ס:הלוק}} ~~~~', title: REQUESTS }],
              'בקשת השמירה'
            );
            c.eq(c.text('#hmk-tool .hmk-missing-row .hmk-redirect-fix-status'), `${c.STR.tagDone} ${c.STR.tagDoneLink}`, 'מצב');
            c.eq(c.href('#hmk-tool .hmk-missing-row .hmk-redirect-fix-status a'), '/wiki/המכלול:בקשות_לעדכון_שמות_ערכים', 'קישור לדף הבקשות');
            c.eq(c.count('#hmk-tool .hmk-missing-row button'), 0, 'הכפתור הוסר');
            c.eq(c.frame.reads.length, 0, 'אין שאילתה לפני השמירה');
          },
        },
      ],
    }),
    missingScenario('tag-failure', 'שגיאה בשמירת התיוג: נשארת שגיאה, בלי ניסיון נוסף', {
      redirects: [OLD],
      localPages: { [OLD]: { body: 'ערך.' } },
      plans: { edit: [{ error: 'protectedpage' }] },
      steps: [
        {
          ...TAG,
          check(c) {
            c.eq(c.writes().length, 1, 'שמירה אחת בלבד');
            c.eq(c.text('#hmk-tool .hmk-missing-row .hmk-redirect-fix-status'), `${c.STR.tagFailed} protectedpage`, 'הודעת השגיאה');
            c.ok(!c.doc.querySelector('#hmk-tool .hmk-missing-row button').disabled, 'הכפתור זמין');
          },
        },
      ],
    }),
    missingScenario('mover-no-tag', 'בעל הרשאת העברה: אין כפתור תיוג', {
      profile: 'מעביר',
      redirects: [OLD],
      localPages: { [OLD]: { body: 'ערך.' } },
      start: {
        check(c) {
          c.eq(c.title(), c.STR.missingTitle, 'כרטיס');
          c.eq(c.count('#hmk-tool .hmk-missing-row button'), 0, 'אין כפתור');
        },
      },
    }),
    missingScenario('rights-failed', 'כשל בטעינת ההרשאות: אזהרה, וכפתור התיוג מוצג כי לא ידוע שיש הרשאת העברה', {
      profile: 'כשל-הרשאות',
      redirects: [OLD],
      localPages: { [OLD]: { body: 'ערך.' } },
      start: {
        check(c) {
          c.ok(c.warnings().indexOf(c.STR.permissionsLoadFailed) !== -1, 'אזהרת הרשאות');
          c.eq(c.count('#hmk-tool .hmk-missing-row button'), 1, 'כפתור התיוג');
        },
      },
    }),
    missingScenario('edit-screen', 'מסך העריכה של דף שאינו קיים: אותו כרטיס', {
      action: 'edit',
      redirects: [OLD],
      localPages: { [OLD]: { body: 'ערך.' } },
      start: {
        check(c) {
          c.eq(c.title(), c.STR.missingTitle, 'כרטיס');
          noCoreRun(c);
        },
      },
    }),
    missingScenario('edit-existing', 'מסך העריכה של דף קיים: הכלי לא רץ', {
      action: 'edit',
      articleId: 55,
      redirects: [OLD],
      localPages: { [PAGE]: { body: 'ערך.' }, [OLD]: { body: 'ערך.' } },
      start: {
        check(c) {
          c.ok(!c.exists('#hmk-tool'), 'אין מכל');
          c.eq(c.frame.reads.length, 0, 'אין שאילתות');
          c.eq(c.frame.scripts.length, 0, 'אין טעינות');
        },
      },
    })
  );

  return out;
}

module.exports = { build };
