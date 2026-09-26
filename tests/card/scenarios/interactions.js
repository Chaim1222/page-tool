'use strict';

// תרחישי אינטראקציה. כל תרחיש מבצע רצף פעולות משתמש ובודק את
// ההתנהגות המתועדת: במסמכי השלבים (טעינה עצלה, תיקוני הסקירה, נעילת
// שלב 6) ובהערות הקוד. כל כתיבה נלכדת בהדמיה ואינה נשלחת לשום מקום.

const { levelA, MOVE_VARIANTS, wpOldTitle } = require('./matrix');
const { RESULTS, PAGE } = require('../fixtures/results');

const T = 'חדש';
const REASON = 'השוואה לוויקיפדיה העברית';
const DETAILS = 'Gadget page tool.details.js';
const PREVIEW = 'Gadget page tool.preview.js';
const CARD = 'Gadget page tool.card.js';
const ASSET_FAILED = 'לא ניתן לטעון את משאבי הכרטיס. רענן את הדף ונסה שוב.';

function mergeNet(a, b) {
  const out = Object.assign({}, a || {});
  for (const [k, v] of Object.entries(b || {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? Object.assign({}, out[k] || {}, v) : v;
  }
  return out;
}

// כרטיס מוזרק עם וריאנט בדיקות־משנה, ותוספות ספציפיות לתרחיש.
function card(resultKey, variantKey, props) {
  const fx = RESULTS[resultKey];
  const v = variantKey ? MOVE_VARIANTS[variantKey] : {};
  const target = fx.target;
  const net = mergeNet(v.net ? v.net(target, wpOldTitle(fx)) : {}, props.net);
  const localPages = Object.assign({}, v.local ? v.local(target) : {}, props.localPages || {});
  const s = levelA(resultKey, Object.assign({}, props, { net, localPages }));
  if (props.fixture) s.fixture = Object.assign({}, s.fixture, props.fixture);
  if (props.currentPage) s.localPages[PAGE] = props.currentPage;
  delete s.currentPage;
  return s;
}

function writeOf(c, i) {
  return c.writes()[i] || {};
}

function assetFailure(id, title, faults, consoleErrors, extraCheck) {
  return Object.assign(card('renamed', 'no-redirect', {}), faults, {
    id,
    title,
    group: 'אינטראקציה: טעינת משאבים',
    profile: 'מפעיל',
    start: {
      allow: { consoleErrors },
      check(c) {
        c.eq(c.text('#hmk-tool'), ASSET_FAILED, 'הודעת כשל טעינת המשאבים');
        c.ok(!c.exists('#hmk-tool .hmk-card'), 'אין כרטיס');
        if (extraCheck) extraCheck(c);
      },
    },
    steps: [],
  });
}

const SCENARIOS = [
  // ===================================================================
  // פאנל הפרטים: טעינה עצלה, סגירה ופתיחה חוזרת, כשל טעינה
  // ===================================================================
  // שינוי שם שזוהה לפי גרסה: היומן נשלף לתצוגה, ומוצגים בו רק אירועים
  // מאז יצירת הדף במכלול (1 בינואר 2026 בסביבת הבדיקה).
  card('renamed', 'no-redirect', {
    id: 'I-details-log-since-creation',
    title: 'פרטים: יומן ההעברות מציג את ההעברה שאחרי יצירת הדף במכלול',
    group: 'אינטראקציה: פאנל הפרטים',
    profile: 'מפעיל',
    net: {
      wpLogs: {
        ישן: {
          move: [
            { timestamp: '2026-02-01T10:00:00Z', user: 'Mover', comment: 'שם מדויק', params: { target_ns: 0, target_title: T, suppressredirect: '' } },
            { timestamp: '2025-06-01T10:00:00Z', user: 'Old', comment: 'ישן מאוד', params: { target_ns: 0, target_title: 'אחר' } },
          ],
          delete: [],
        },
      },
    },
    steps: [
      {
        do: 'open',
        name: 'פתיחה',
        check(c) {
          c.eq(c.count('#hmk-tool .hmk-log-item'), 1, 'אירועים ביומן');
          c.ok((c.text('#hmk-tool .hmk-log-item') || '').indexOf('Mover') !== -1, 'ההעברה שאחרי יצירת הדף מוצגת');
        },
      },
    ],
  }),
  card('renamed', 'no-redirect', {
    id: 'I-details-open-close-reopen',
    title: 'פתיחה, סגירה ופתיחה חוזרת של הפרטים: המודול נטען ונבנה פעם אחת',
    group: 'אינטראקציה: פאנל הפרטים',
    profile: 'מפעיל',
    start: {
      check(c) {
        c.eq(c.scriptLoads(DETAILS), 0, 'מודול הפרטים לא נטען לפני לחיצה');
        c.ok(c.exists('#hmk-tool .hmk-card'), 'הכרטיס מוצג לפני טעינת מודול הפרטים');
      },
    },
    steps: [
      {
        do: 'open',
        name: 'פתיחה',
        check(c) {
          c.eq(c.scripts(), [DETAILS], 'המודול נטען בפתיחה הראשונה');
          c.eq(c.env.detailsFactories, 1, 'מפעל הפרטים נוצר פעם אחת');
          c.ok(c.visible('#hmk-tool .hmk-panel'), 'הפאנל גלוי');
          c.ok(c.exists('#hmk-tool .hmk-overview'), 'סקירת המצב נבנתה');
        },
      },
      {
        do: 'close',
        name: 'סגירה',
        check(c) {
          c.ok(!c.visible('#hmk-tool .hmk-panel'), 'הפאנל מוסתר');
          c.ok(c.exists('#hmk-tool .hmk-arrow[aria-expanded="false"]'), 'החץ מסומן כסגור');
          c.eq(c.frame.reads.length + c.scripts().length, 0, 'סגירה אינה שולחת בקשות');
        },
      },
      {
        do: 'open',
        name: 'פתיחה-חוזרת',
        check(c) {
          c.ok(c.visible('#hmk-tool .hmk-panel'), 'הפאנל גלוי שוב');
          c.eq(c.scripts(), [], 'אין טעינה חוזרת של המודול');
          c.eq(c.frame.reads, [], 'אין שליפה חוזרת של מידע');
          c.eq(c.env.detailsFactories, 1, 'המפעל לא נוצר שוב');
        },
      },
    ],
    after({ frames, fail }) {
      if (JSON.stringify(frames[1].dom.tool) !== JSON.stringify(frames[3].dom.tool)) {
        fail('תוכן הפאנל אחרי פתיחה חוזרת שונה מהפתיחה הראשונה');
      }
    },
  }),

  card('renamed', 'no-redirect', {
    id: 'I-details-load-failure-retry',
    title: 'כשל בטעינת מודול הפרטים: הודעה, רישום במסוף, וניסיון חוזר בפתיחה הבאה ולא בסגירה',
    group: 'אינטראקציה: פאנל הפרטים',
    profile: 'מפעיל',
    scriptFaults: { details: { times: 1 } },
    steps: [
      {
        do: 'open',
        name: 'פתיחה-נכשלת',
        allow: { consoleErrors: 1 },
        check(c) {
          c.eq(c.text('#hmk-tool .hmk-panel'), c.STR.detailsLoadFailed, 'הודעת כשל טעינת הפרטים');
          c.ok(/טעינת הסקריפט נכשלה/.test(c.frame.console.map((x) => x.text).join(' ')), 'השגיאה נרשמה במסוף');
          c.eq(c.labels(), [c.STR.btnMoveNoRedirect], 'הכרטיס והפעולות ממשיכים לעבוד');
        },
      },
      {
        do: 'close',
        name: 'סגירה',
        check(c) {
          c.eq(c.scripts(), [], 'אין ניסיון טעינה בסגירה');
        },
      },
      {
        do: 'open',
        name: 'פתיחה-חוזרת',
        check(c) {
          c.eq(c.scripts(), [DETAILS], 'ניסיון טעינה חוזר בפתיחה');
          c.ok(c.exists('#hmk-tool .hmk-overview'), 'הפאנל נבנה בהצלחה');
          c.eq(c.env.detailsFactories, 1, 'המפעל נוצר פעם אחת');
        },
      },
    ],
  }),

  card('renamed', 'no-redirect', {
    id: 'I-details-load-failure-actions-still-work',
    title: 'כשל קבוע בטעינת מודול הפרטים אינו פוגע בפעולת ההעברה',
    group: 'אינטראקציה: פאנל הפרטים',
    profile: 'מפעיל',
    scriptFaults: { details: {} },
    steps: [
      { do: 'open', name: 'פתיחה-נכשלת', allow: { consoleErrors: 1 } },
      { do: 'close', name: 'סגירה' },
      { do: 'open', name: 'פתיחה-נכשלת-שוב', allow: { consoleErrors: 1 }, check(c) { c.eq(c.scripts(), [DETAILS], 'ניסיון נוסף בכל פתיחה'); } },
      {
        do: 'click',
        label: { str: 'btnMoveNoRedirect' },
        name: 'העברה',
        check(c) {
          c.eq(writeOf(c, 0).params && writeOf(c, 0).params.action, 'move', 'ההעברה נשלחה');
          c.eq(c.title(), c.STR.moveCompletedTitle, 'ההעברה הושלמה');
        },
      },
    ],
  }),

  // ===================================================================
  // בורר ההפניה
  // ===================================================================
  card('renamed', 'no-redirect', {
    id: 'I-toggle-choose-with-redirect',
    title: 'בורר ההפניה: המלצה בלי הפניה, המשתמש בוחר עם הפניה, והבקשה נשלחת בהתאם',
    group: 'אינטראקציה: בורר ההפניה',
    profile: 'מפעיל',
    recordWiki: true,
    steps: [
      { do: 'open', name: 'פתיחה' },
      {
        do: 'toggle',
        label: { str: 'btnMoveWithRedirect' },
        name: 'בחירה-עם-הפניה',
        check(c) {
          c.eq(c.labels(), [c.STR.btnMoveWithRedirect], 'שם הכפתור הראשי מתעדכן לבחירה');
          c.eq(c.text('#hmk-tool .hmk-choice'), `${c.STR.userChoiceLabel}: ${c.STR.btnMoveWithRedirect}`, 'שורת בחירת המשתמש');
          c.eq(c.text('#hmk-tool .hmk-seg-btn.hmk-seg-on'), c.STR.btnMoveWithRedirect, 'הבורר מסמן את הבחירה');
        },
      },
      {
        do: 'click',
        label: { str: 'btnMoveWithRedirect' },
        name: 'העברה',
        check(c) {
          const move = writeOf(c, 0);
          c.eq(move.params, { action: 'move', format: 'json', from: PAGE, movesubpages: 1, movetalk: 1, reason: REASON, to: T }, 'בקשת ההעברה, בלי noredirect');
          const edit = writeOf(c, 1);
          c.eq(edit.api, 'edit', 'עדכון שדה דף אחרי ההעברה');
          c.eq(edit.title, T, 'העדכון נעשה בדף היעד');
          c.ok(edit.params && /\|דף=חדש/.test(edit.params.text), 'שדה דף עודכן ליעד');
          c.eq(edit.params && edit.params.summary, 'מיון ויקיפדיה', 'תקציר העריכה');
          c.eq(c.cardType(), 'success', 'כרטיס סיום');
          c.eq(c.title(), c.STR.moveCompletedTitle, 'כותרת הסיום');
          c.eq(c.href('#hmk-tool .hmk-final-target a'), `/wiki/${T}`, 'קישור ליעד בכרטיס הסיום');
        },
      },
    ],
  }),

  card('renamed', 'redirect-exists', {
    id: 'I-toggle-choose-without-redirect',
    title: 'בורר ההפניה: המלצה עם הפניה, המשתמש בוחר בלי הפניה, והבקשה כוללת noredirect',
    group: 'אינטראקציה: בורר ההפניה',
    profile: 'מפעיל',
    steps: [
      { do: 'open', name: 'פתיחה', check(c) { c.eq(c.text('#hmk-tool .hmk-seg-btn.hmk-seg-on'), c.STR.btnMoveWithRedirect, 'ההמלצה המסומנת'); } },
      { do: 'toggle', label: { str: 'btnMoveNoRedirect' }, name: 'בחירה-בלי-הפניה', check(c) { c.eq(c.labels(), [c.STR.btnMoveNoRedirect], 'שם הכפתור הראשי'); } },
      { do: 'click', label: { str: 'btnMoveNoRedirect' }, name: 'העברה', check(c) { c.eq(writeOf(c, 0).params.noredirect, 1, 'הבקשה כוללת noredirect'); } },
    ],
  }),

  card('renamed', 'no-redirect', {
    id: 'I-toggle-disabled-while-busy',
    title: 'בזמן העברה: הכפתורים והבורר מושבתים ומוצג סטטוס',
    group: 'אינטראקציה: בורר ההפניה',
    profile: 'מפעיל',
    plans: { move: [{ delay: 2000 }] },
    steps: [
      { do: 'open', name: 'פתיחה' },
      {
        do: 'click',
        label: { str: 'btnMoveNoRedirect' },
        name: 'העברה-ממתינה',
        settle: { advance: false },
        check(c) {
          c.eq(c.status(), c.STR.moveStarting, 'סטטוס בזמן העברה');
          c.ok(c.actions().every((a) => a.disabled), 'כל הכפתורים מושבתים');
          c.ok([...c.doc.querySelectorAll('#hmk-tool .hmk-seg-btn')].every((b) => b.disabled), 'הבורר מושבת');
        },
      },
      { do: 'settle', name: 'סיום', check(c) { c.eq(c.title(), c.STR.moveCompletedTitle, 'ההעברה הושלמה'); } },
    ],
  }),

  // ===================================================================
  // העברה: הצלחה, עדכוני המשך ושגיאות
  // ===================================================================
  card('renamed', 'no-redirect', {
    id: 'I-move-success',
    title: 'העברה ישירה מהכרטיס בלי לפתוח פרטים',
    group: 'אינטראקציה: העברה',
    profile: 'מעביר-מלא',
    recordWiki: true,
    steps: [
      {
        do: 'click',
        label: { str: 'btnMoveNoRedirect' },
        name: 'העברה',
        check(c) {
          c.eq(c.writes().map((w) => w.api + ':' + (w.params ? w.params.action || '' : '')), ['postWithToken:move', 'edit:'], 'רצף הכתיבות');
          c.eq(writeOf(c, 0).token, 'csrf', 'אסימון ההעברה');
          c.eq(c.title(), c.STR.moveCompletedTitle, 'ההעברה הושלמה');
          c.eq(c.body(), c.STR.moveCompletedBody, 'גוף כרטיס הסיום');
          c.eq(c.text('#hmk-tool .hmk-final-target'), `${c.STR.moveCompletedTarget} ${T}`, 'שורת היעד בכרטיס הסיום');
        },
      },
    ],
  }),

  card('renamed', 'no-redirect', {
    id: 'I-move-template-missing',
    title: 'העברה הצליחה אבל בדף אין שדה דף לעדכון: כרטיס סיום עם הערה',
    group: 'אינטראקציה: העברה',
    profile: 'מפעיל',
    currentPage: { content: 'ערך בלי תבנית מיון.' },
    steps: [
      {
        do: 'click',
        label: { str: 'btnMoveNoRedirect' },
        name: 'העברה',
        check(c) {
          c.eq(c.cardType(), 'warning', 'כרטיס סיום עם הערה');
          c.eq(c.title(), c.STR.moveCompletedWithWarningsTitle, 'כותרת');
          c.ok((c.body() || '').indexOf(c.STR.templateMissing) === 0, 'ההערה על שדה דף חסר');
          c.eq(writeOf(c, 1).outcome, 'transform-threw:template-not-found', 'העריכה לא נשלחה');
        },
      },
    ],
  }),

  card('renamed', 'no-redirect', {
    id: 'I-move-articleexists-occupied-operator',
    title: 'היעד נוצר במכלול בין הבדיקה להעברה (ערך אחר): מפעיל מקבל מחיקה והעברה',
    group: 'אינטראקציה: העברה',
    profile: 'מפעיל',
    plans: { move: [{ effect: (wiki) => wiki.put(T, { fields: { פריט: 'Q2' } }) }] },
    steps: [
      {
        do: 'click',
        label: { str: 'btnMoveNoRedirect' },
        name: 'העברה-חסומה',
        check(c) {
          c.eq(writeOf(c, 0).outcome, 'error:articleexists', 'השרת החזיר שהיעד קיים');
          c.eq(c.title(), c.STR.targetOccupiedTitle, 'כרטיס יעד תפוס');
          c.ok((c.body() || '').indexOf(c.STR.targetOccupiedOperator) === 0, 'הסבר למפעיל');
          c.eq(c.labels(), [c.STR.btnMakeRedirect, c.STR.btnDeleteAndMove(T)], 'פעולות היעד התפוס');
        },
      },
    ],
  }),

  card('renamed', 'no-redirect', {
    id: 'I-move-articleexists-occupied-user',
    title: 'יעד תפוס (ערך אחר) למשתמש בלי הרשאת מחיקה: בקשה ממפעילים',
    group: 'אינטראקציה: העברה',
    profile: 'מעביר-מלא',
    plans: { move: [{ effect: (wiki) => wiki.put(T, { fields: { פריט: 'Q2' } }) }] },
    steps: [
      {
        do: 'click',
        label: { str: 'btnMoveNoRedirect' },
        name: 'העברה-חסומה',
        check(c) {
          c.ok((c.body() || '').indexOf(c.STR.targetOccupiedUser) === 0, 'הסבר למשתמש');
          c.eq(c.labels(), [c.STR.btnMakeRedirect, c.STR.btnRequestMove], 'פעולות היעד התפוס');
        },
      },
    ],
  }),

  card('renamed', 'no-redirect', {
    id: 'I-move-articleexists-same-identity',
    title: 'יעד תפוס שהוא אותו ערך: הצעה להפוך את הדף להפניה',
    group: 'אינטראקציה: העברה',
    profile: 'מפעיל',
    plans: { move: [{ effect: (wiki) => wiki.put(T, { fields: { פריט: 'Q1' } }) }] },
    steps: [
      {
        do: 'click',
        label: { str: 'btnMoveNoRedirect' },
        name: 'העברה-חסומה',
        check(c) {
          c.ok((c.body() || '').indexOf(c.STR.targetSameReason) === 0, 'הסבר זהות');
          c.eq(c.labels(), [c.STR.btnMakeRedirect], 'רק הפיכה להפניה');
          c.eq(c.actions()[0] && c.actions()[0].style, 'primary', 'הפיכה להפניה היא הפעולה הראשית');
        },
      },
    ],
  }),

  card('renamed', 'no-redirect', {
    id: 'I-move-articleexists-unchecked',
    title: 'יעד תפוס שלא ניתן לבדוק: אין פעולה עיוורת, רק ניסיון חוזר',
    group: 'אינטראקציה: העברה',
    profile: 'מפעיל',
    plans: { move: [{ error: 'articleexists' }] },
    net: { faults: { [`local-page:${T}`]: { type: 'http', status: 404, skip: 1 } } },
    steps: [
      {
        do: 'click',
        label: { str: 'btnMoveNoRedirect' },
        name: 'העברה-חסומה',
        check(c) {
          c.eq(c.body(), c.STR.targetIdentityUncheckedReason, 'הסבר');
          c.eq(c.labels(), [c.STR.btnRetry], 'רק ניסיון חוזר');
        },
      },
    ],
  }),

  card('renamed', 'no-redirect', {
    id: 'I-move-redirectexists-retry-once',
    title: 'היעד הוא הפניה: ניסיון חוזר אוטומטי אחד שמצליח',
    group: 'אינטראקציה: העברה',
    profile: 'מפעיל',
    plans: { move: [{ error: 'redirectexists' }] },
    steps: [
      {
        do: 'click',
        label: { str: 'btnMoveNoRedirect' },
        name: 'העברה',
        check(c) {
          c.eq(c.writes().filter((w) => w.params && w.params.action === 'move').map((w) => w.outcome), ['error:redirectexists', 'ok'], 'שתי בקשות העברה');
          c.eq(c.title(), c.STR.moveCompletedTitle, 'ההעברה הושלמה');
        },
      },
    ],
  }),

  card('renamed', 'no-redirect', {
    id: 'I-move-redirectexists-twice',
    title: 'היעד הוא הפניה גם בניסיון החוזר: כרטיס יעד תפוס עם מחיקת ההפניה',
    group: 'אינטראקציה: העברה',
    profile: 'מוחק-הפניות',
    plans: {
      move: [
        { error: 'redirectexists' },
        { error: 'redirectexists', effect: (wiki) => wiki.put(T, { redirectTo: 'אחר' }) },
      ],
    },
    steps: [
      {
        do: 'click',
        label: { str: 'btnMoveNoRedirect' },
        name: 'העברה',
        check(c) {
          c.eq(c.writes().length, 2, 'ניסיון חוזר אחד בלבד');
          c.eq(c.title(), c.STR.targetOccupiedTitle, 'כרטיס יעד תפוס');
          c.eq(c.body(), c.STR.targetOccupiedOperator, 'מחיקת הפניה מותרת גם בלי הרשאת מחיקת ערכים');
          c.eq(c.labels(), [c.STR.btnDeleteAndMove(T)], 'יעד שהוא הפניה: מחיקה והעברה, בלי הפיכה להפניה');
        },
      },
    ],
  }),

  card('renamed', 'no-redirect', {
    id: 'I-move-selfmove',
    title: 'הדף כבר בשם היעד: רק עדכון שדה דף',
    group: 'אינטראקציה: העברה',
    profile: 'מפעיל',
    plans: { move: [{ error: 'selfmove', effect: (wiki) => wiki.put(T, { fields: { דף: 'ישן', פריט: 'Q1' } }) }] },
    steps: [
      {
        do: 'click',
        label: { str: 'btnMoveNoRedirect' },
        name: 'העברה',
        check(c) {
          c.eq(c.title(), c.STR.templateUpdatedTitle, 'כותרת');
          c.eq(c.body(), c.STR.templateUpdatedSelfMove, 'גוף');
          c.eq(writeOf(c, 1).title, T, 'עדכון שדה דף בדף היעד');
        },
      },
    ],
  }),

  card('renamed', 'no-redirect', {
    id: 'I-move-missingtitle',
    title: 'הדף להעברה לא נמצא: שגיאה בכרטיס והכפתור חוזר לפעולה',
    group: 'אינטראקציה: העברה',
    profile: 'מפעיל',
    plans: { move: [{ error: 'missingtitle' }] },
    steps: [
      {
        do: 'click',
        label: { str: 'btnMoveNoRedirect' },
        name: 'העברה',
        check(c) {
          c.eq(c.status(), c.STR.pageMissingBody, 'סטטוס השגיאה');
          c.ok(c.actions().every((a) => !a.disabled), 'הכפתורים חוזרים לפעולה');
          c.eq(c.title(), c.STR.renamedTitle, 'נשארים באותו כרטיס');
        },
      },
    ],
  }),

  card('renamed', 'no-redirect', {
    id: 'I-move-other-error',
    title: 'שגיאת העברה אחרת: הקוד מוצג בסטטוס',
    group: 'אינטראקציה: העברה',
    profile: 'מפעיל',
    plans: { move: [{ error: 'protectedpage' }] },
    steps: [
      { do: 'click', label: { str: 'btnMoveNoRedirect' }, name: 'העברה', check(c) { c.eq(c.status(), `${c.STR.moveFailedTitle}: protectedpage`, 'סטטוס'); } },
    ],
  }),

  card('renamed', 'no-redirect', {
    id: 'I-move-structured-archive',
    title: 'העברה עם דף ארכיון של דיונים מבניים שלא הועבר: קישור הארכיון מתעדכן',
    group: 'אינטראקציה: העברה',
    profile: 'מפעיל',
    recordWiki: true,
    localPages: { 'שיחה:מקומי': { content: '{{תיבת ארכיון|[[/ארכיון 1]]}}\nדיון.' } },
    plans: {
      move: [
        {
          data: {
            subpages: [
              { from: 'שיחה:מקומי/ארכיון_1', to: 'שיחה:חדש/ארכיון 1', errors: [{ code: 'flow-error-protected-readonly' }] },
            ],
          },
        },
      ],
    },
    steps: [
      {
        do: 'click',
        label: { str: 'btnMoveNoRedirect' },
        name: 'העברה',
        check(c) {
          const archive = c.writes().find((w) => w.api === 'edit' && w.title === 'שיחה:חדש');
          c.ok(!!archive, 'עריכת דף השיחה החדש');
          if (archive && archive.params) {
            c.eq(archive.params.text.split('\n')[0], '{{תיבת ארכיון|*[[שיחה:מקומי/ארכיון 1|ארכיון]]}}', 'הקישור לארכיון הפך למוחלט');
            c.eq(archive.params.summary, c.STR.archiveUpdateSummary, 'תקציר');
          }
          c.eq(c.title(), c.STR.moveCompletedTitle, 'ההעברה הושלמה בלי הערות');
        },
      },
    ],
  }),

  card('renamed', 'no-redirect', {
    id: 'I-move-structured-archive-link-missing',
    title: 'ארכיון דיונים מבניים בלי קישור יחסי בתיבה: הערה לבדיקה ידנית',
    group: 'אינטראקציה: העברה',
    profile: 'מפעיל',
    localPages: { 'שיחה:מקומי': { content: 'דיון בלי תיבת ארכיון.' } },
    plans: {
      move: [{ data: { subpages: [{ from: 'שיחה:מקומי/ארכיון 1', errors: [{ message: 'flow-error-protected-readonly' }] }] } }],
    },
    steps: [
      {
        do: 'click',
        label: { str: 'btnMoveNoRedirect' },
        name: 'העברה',
        check(c) {
          c.eq(c.title(), c.STR.moveCompletedWithWarningsTitle, 'הושלם עם הערה');
          c.eq(c.body(), c.STR.archiveLinkMissing, 'הערת הארכיון');
        },
      },
    ],
  }),

  card('renamed', 'no-redirect', {
    id: 'I-click-before-checklist',
    title: 'לחיצה על העברה לפני שבדיקת היעד הסתיימה: ממתינים להכרעה ואז פועלים',
    group: 'אינטראקציה: העברה',
    profile: 'מפעיל',
    net: { delays: { [`local-page:${T}`]: 1000 } },
    startSettle: { advance: false },
    start: {
      allowPending: true,
      check(c) {
        c.eq(c.labels(), [c.STR.btnMove], 'כפתור כללי עד שהבדיקה מסתיימת');
      },
    },
    steps: [
      {
        do: 'click',
        label: { str: 'btnMove' },
        name: 'לחיצה-מוקדמת',
        settle: { advance: false },
        allowPending: true,
        check(c) {
          c.eq(c.status(), c.STR.loadingFacts, 'סטטוס המתנה');
          c.eq(c.writes(), [], 'אין כתיבה לפני ההכרעה');
          c.ok(c.actions().every((a) => a.disabled), 'הכפתור מושבת בזמן ההמתנה');
        },
      },
      {
        do: 'settle',
        name: 'סיום-הבדיקה',
        check(c) {
          c.eq(writeOf(c, 0).params && writeOf(c, 0).params.noredirect, 1, 'ההעברה נשלחה לפי ההכרעה');
          c.eq(c.title(), c.STR.moveCompletedTitle, 'ההעברה הושלמה');
        },
      },
    ],
  }),

  card('renamed', 'target-same', {
    id: 'I-click-before-checklist-same-identity',
    title: 'לחיצה מוקדמת כשהיעד הוא אותו ערך: לא מבוצעת העברה אל תוך היעד',
    group: 'אינטראקציה: העברה',
    profile: 'מפעיל',
    confirms: [false],
    net: { delays: { [`local-page:${T}`]: 1000 } },
    startSettle: { advance: false },
    start: { allowPending: true },
    steps: [
      { do: 'click', label: { str: 'btnMove' }, name: 'לחיצה-מוקדמת', settle: { advance: false }, allowPending: true },
      {
        do: 'settle',
        name: 'סיום-הבדיקה',
        check(c) {
          c.eq(c.writes(), [], 'לא נשלחה העברה');
          c.eq(c.env.log.confirms.length, 1, 'במקום העברה הוצע אישור להפיכה להפניה');
        },
      },
    ],
  }),

  // ===================================================================
  // מחיקה והעברה
  // ===================================================================
  card('renamed', 'target-different', {
    id: 'I-delete-and-move',
    title: 'מחיקת יעד תפוס והעברה: מחיקה, העברה ועדכון שדה דף',
    group: 'אינטראקציה: מחיקה והעברה',
    profile: 'מפעיל',
    recordWiki: true,
    steps: [
      {
        do: 'click',
        label: { str: 'btnDeleteAndMove', args: [T] },
        name: 'מחיקה-והעברה',
        check(c) {
          const kinds = c.writes().map((w) => w.api + ':' + (w.params ? w.params.action || '' : ''));
          c.eq(kinds, ['postWithToken:delete', 'postWithToken:move', 'edit:'], 'רצף הכתיבות');
          c.eq(writeOf(c, 0).params.title, T, 'מחיקת דף היעד');
          c.eq(writeOf(c, 0).params.reason, c.STR.deleteForMoveReason(PAGE), 'סיבת המחיקה');
          c.eq(writeOf(c, 1).params.noredirect, 1, 'ההעברה לפי ההכרעה (בלי הפניה)');
          c.eq(c.title(), c.STR.moveCompletedTitle, 'ההעברה הושלמה');
        },
      },
    ],
  }),

  card('renamed', 'target-different', {
    id: 'I-delete-and-move-delete-fails',
    title: 'מחיקת היעד נכשלה: אין העברה, והשגיאה מוצגת',
    group: 'אינטראקציה: מחיקה והעברה',
    profile: 'מפעיל',
    plans: { delete: [{ error: 'permissiondenied' }] },
    steps: [
      {
        do: 'click',
        label: { str: 'btnDeleteAndMove', args: [T] },
        name: 'מחיקה-והעברה',
        check(c) {
          c.eq(c.writes().length, 1, 'רק בקשת המחיקה');
          c.eq(c.status(), `${c.STR.deleteForMoveFailed} permissiondenied`, 'סטטוס');
        },
      },
    ],
  }),

  card('renamed', 'target-different', {
    id: 'I-delete-and-move-move-fails',
    title: 'היעד נמחק אבל ההעברה נכשלה: כרטיס אזהרה עם קישור לדף שנמחק',
    group: 'אינטראקציה: מחיקה והעברה',
    profile: 'מפעיל',
    plans: { move: [{ error: 'missingtitle' }] },
    steps: [
      {
        do: 'click',
        label: { str: 'btnDeleteAndMove', args: [T] },
        name: 'מחיקה-והעברה',
        check(c) {
          c.eq(c.cardType(), 'warning', 'סוג');
          c.eq(c.title(), c.STR.moveAfterDeleteFailedTitle, 'כותרת');
          c.ok(c.exists('#hmk-tool .hmk-final-target a'), 'קישור לדף היעד שנמחק');
        },
      },
    ],
  }),

  // ===================================================================
  // הפיכה להפניה
  // ===================================================================
  card('renamed', 'target-same', {
    id: 'I-make-redirect-confirm',
    title: 'הפיכה להפניה: אישור, עריכה ותוכן ההפניה',
    group: 'אינטראקציה: הפיכה להפניה',
    profile: 'עורך',
    recordWiki: true,
    steps: [
      {
        do: 'click',
        label: { str: 'btnMakeRedirect' },
        name: 'הפיכה-להפניה',
        check(c) {
          c.eq(c.env.log.confirms, [`התוכן החדש יהיה: #הפניה[[${T}]]`], 'חלון האישור');
          c.eq(writeOf(c, 0).params, { action: 'edit', bot: true, format: 'json', nocreate: 1, text: `#הפניה[[${T}]]`, title: PAGE }, 'בקשת העריכה');
          c.eq(writeOf(c, 0).token, 'csrf', 'אסימון');
          c.eq(c.title(), c.STR.redirectCompletedTitle, 'כרטיס סיום');
        },
      },
    ],
  }),

  card('renamed', 'target-same', {
    id: 'I-make-redirect-cancel',
    title: 'הפיכה להפניה בוטלה בחלון האישור: אין כתיבה והכרטיס חוזר למצבו',
    group: 'אינטראקציה: הפיכה להפניה',
    profile: 'עורך',
    confirms: [false],
    steps: [
      {
        do: 'click',
        label: { str: 'btnMakeRedirect' },
        name: 'ביטול',
        check(c) {
          c.eq(c.writes(), [], 'אין כתיבה');
          c.eq(c.status(), '', 'אין סטטוס');
          c.ok(c.actions().every((a) => !a.disabled), 'הכפתורים פעילים');
        },
      },
    ],
  }),

  card('redirect', 'target-same', {
    id: 'I-make-redirect-with-fragment',
    title: 'הפיכה להפניה כשבוויקיפדיה ההפניה היא לפסקה: הפסקה נשמרת בתוכן',
    group: 'אינטראקציה: הפיכה להפניה',
    profile: 'מפעיל',
    steps: [
      {
        do: 'click',
        label: { str: 'btnMakeRedirect' },
        name: 'הפיכה-להפניה',
        check(c) {
          c.eq(writeOf(c, 0).params && writeOf(c, 0).params.text, '#הפניה[[יעד#פסקה]]', 'תוכן ההפניה כולל פסקה');
        },
      },
    ],
  }),

  // ===================================================================
  // בקשות ממפעילים
  // ===================================================================
  card('renamed', 'no-redirect', {
    id: 'I-request-move',
    title: 'בקשת העברה ממפעילים למשתמש בלי הרשאת העברה',
    group: 'אינטראקציה: בקשות',
    profile: 'עורך',
    steps: [
      {
        do: 'click',
        label: { str: 'btnRequestMove' },
        name: 'בקשה',
        check(c) {
          c.eq(
            writeOf(c, 0).params,
            {
              action: 'edit',
              appendtext: `\n*{{העברה|${PAGE}|${T}|${REASON}}} ~~~~`,
              format: 'json',
              pageid: '18228',
              section: 6,
              summary: `/* בקשות העברת דף / העברת קובץ */ [[${PAGE}]] >> [[${T}]]`,
            },
            'בקשת העריכה לדף הבקשות'
          );
          c.eq(c.status(), c.STR.requestSaved, 'סטטוס הצלחה בתוך הכרטיס');
          c.eq(c.env.log.notifies, [], 'אין הודעה קופצת');
        },
      },
    ],
  }),

  card('renamed', 'no-redirect', {
    id: 'I-request-move-failure',
    title: 'שמירת בקשת ההעברה נכשלה',
    group: 'אינטראקציה: בקשות',
    profile: 'עורך',
    plans: { edit: [{ error: 'readonly' }] },
    steps: [
      { do: 'click', label: { str: 'btnRequestMove' }, name: 'בקשה', check(c) { c.eq(c.status(), `${c.STR.requestFailed} readonly`, 'סטטוס'); } },
    ],
  }),

  Object.assign(levelA('deleted', {}), {
    id: 'I-request-delete',
    title: 'בקשת מחיקה ממפעילים',
    group: 'אינטראקציה: בקשות',
    profile: 'עורך',
    steps: [
      {
        do: 'click',
        label: { str: 'btnRequestDelete' },
        name: 'בקשה',
        check(c) {
          const p = writeOf(c, 0).params || {};
          c.eq(p.section, '1', 'סעיף בקשות המחיקה');
          c.eq(p.appendtext, `\n\n*{{בקשת מחיקה|${PAGE}|הדף נמחק בוויקיפדיה העברית}} ~~~~`, 'תוכן הבקשה');
          c.eq(c.status(), c.STR.requestSaved, 'סטטוס');
        },
      },
    ],
  }),

  // ===================================================================
  // תצוגה מקדימה בריחוף
  // ===================================================================
  card('redirect', 'target-same', {
    id: 'I-preview-hover-keeps-fragment',
    title: 'ריחוף על קישור ליעד עם פסקה: המודול נטען פעם אחת, הבועה מוצגת, והפסקה נשמרת בקישור',
    group: 'אינטראקציה: תצוגה מקדימה',
    profile: 'מפעיל',
    start: {
      check(c) {
        c.eq(c.href('#hmk-tool .hmk-target a'), '/wiki/יעד#פסקה', 'הקישור ליעד כולל פסקה');
        c.eq(c.scriptLoads(PREVIEW), 0, 'מודול התצוגה המקדימה לא נטען לפני ריחוף');
      },
    },
    steps: [
      {
        do: 'hover',
        name: 'ריחוף',
        check(c) {
          c.eq(c.scripts(), [PREVIEW], 'המודול נטען בריחוף הראשון');
          c.ok(c.visible('#hmk-link-preview'), 'הבועה גלויה');
          c.eq(c.text('#hmk-link-preview .hmk-link-preview-title'), c.STR.previewArticle, 'כותרת הבועה');
          c.eq(c.href('#hmk-tool .hmk-target a'), '/wiki/יעד#פסקה', 'הפסקה נשמרת אחרי עדכון מצב הקישור');
          c.eq(c.doc.querySelector('#hmk-tool .hmk-target a').getAttribute('aria-describedby'), 'hmk-link-preview', 'הקישור מקושר לבועה');
        },
      },
      { do: 'leave', name: 'יציאה', check(c) { c.ok(!c.visible('#hmk-link-preview'), 'הבועה מוסתרת'); } },
      {
        do: 'hover',
        name: 'ריחוף-שני',
        check(c) {
          c.eq(c.scripts(), [], 'אין טעינה חוזרת של המודול');
          c.eq(c.frame.reads, [], 'התצוגה מגיעה מהמטמון');
          c.ok(c.visible('#hmk-link-preview'), 'הבועה גלויה שוב');
          c.eq(c.env.previewFactories, 1, 'מפעל התצוגה נוצר פעם אחת');
        },
      },
      { do: 'key', key: 'Escape', name: 'אסקייפ', check(c) { c.ok(!c.visible('#hmk-link-preview'), 'אסקייפ מסתיר את הבועה'); } },
    ],
  }),

  card('renamed', 'no-redirect', {
    id: 'I-preview-leave-before-delay',
    title: 'יציאה מהקישור לפני תום ההשהיה: אין שליפה ואין בועה',
    group: 'אינטראקציה: תצוגה מקדימה',
    profile: 'מפעיל',
    steps: [
      {
        do: 'hover',
        name: 'ריחוף-קצר',
        settle: { advance: false },
        check(c) {
          c.eq(c.scripts(), [PREVIEW], 'המודול נטען');
          c.eq(c.reads('preview-info').length, 0, 'עדיין אין שליפה');
        },
      },
      {
        do: 'leave',
        name: 'יציאה',
        check(c) {
          c.eq(c.env.log.reads.filter((r) => r.params.prop === 'info|pageprops').length, 0, 'לא נשלפה תצוגה מקדימה');
          c.ok(!c.visible('#hmk-link-preview'), 'אין בועה גלויה');
        },
      },
    ],
  }),

  card('renamed', 'no-redirect', {
    id: 'I-preview-missing-target',
    title: 'ריחוף על קישור ליעד שלא קיים במכלול: "הדף אינו קיים", והקישור נשאר אדום',
    group: 'אינטראקציה: תצוגה מקדימה',
    profile: 'מפעיל',
    steps: [
      {
        do: 'hover',
        name: 'ריחוף',
        check(c) {
          c.eq(c.text('#hmk-link-preview .hmk-link-preview-title'), c.STR.previewMissing, 'כותרת הבועה');
          c.ok(c.doc.querySelector('#hmk-tool .hmk-target a').classList.contains('new'), 'הקישור נשאר אדום');
          c.eq(c.reads('parse-page').length, 0, 'אין עיבוד לדף שאינו קיים');
        },
      },
    ],
  }),

  card('renamed', 'no-redirect', {
    id: 'I-preview-load-failure',
    title: 'כשל טעינת מודול התצוגה המקדימה: הקישור ממשיך לעבוד ואין שגיאה',
    group: 'אינטראקציה: תצוגה מקדימה',
    profile: 'מפעיל',
    scriptFaults: { preview: {} },
    steps: [
      {
        do: 'hover',
        name: 'ריחוף',
        check(c) {
          c.ok(!c.exists('#hmk-link-preview'), 'אין בועה');
          c.ok(c.exists('#hmk-tool .hmk-target a[href]'), 'הקישור קיים');
        },
      },
      { do: 'leave', name: 'יציאה' },
      { do: 'hover', name: 'ריחוף-שני', check(c) { c.eq(c.scripts(), [PREVIEW], 'ניסיון טעינה חוזר בריחוף הבא'); } },
    ],
  }),

  card('renamed', 'no-redirect', {
    id: 'I-preview-final-card-link',
    title: 'קישור היעד בכרטיס הסיום תומך גם הוא בתצוגה מקדימה',
    group: 'אינטראקציה: תצוגה מקדימה',
    profile: 'מפעיל',
    steps: [
      { do: 'click', label: { str: 'btnMoveNoRedirect' }, name: 'העברה' },
      {
        do: 'hover',
        name: 'ריחוף-על-היעד',
        selector: '#hmk-tool .hmk-final-target a',
        check(c) {
          c.eq(c.text('#hmk-link-preview .hmk-link-preview-title'), c.STR.previewArticle, 'אחרי ההעברה היעד הוא ערך');
          c.ok((c.text('#hmk-link-preview .hmk-link-preview-text') || '').indexOf(T) === 0, 'תקציר מתוך הדף, בלי טבלאות');
        },
      },
    ],
  }),

  // ===================================================================
  // עץ הדפים המקשרים
  // ===================================================================
  card('renamed', 'redirect-exists', {
    id: 'I-backlinks-tree',
    title: 'עץ המקשרים: הצגה, הרחבת הפניה, וסגירה ופתיחה בלי שליפה חוזרת',
    group: 'אינטראקציה: עץ המקשרים',
    profile: 'מפעיל',
    net: { backlinks: { 'כינוי ג': { direct: ['דף ד'] } } },
    steps: [
      { do: 'open', name: 'פתיחה' },
      {
        do: 'backlinks',
        name: 'הצגת-מקשרים',
        check(c) {
          c.ok(c.visible('#hmk-tool .hmk-backlinks-tree'), 'העץ גלוי');
          c.eq(c.text('#hmk-tool .hmk-backlinks-toggle'), c.STR.btnHideBacklinks, 'כפתור ההסתרה');
          c.eq(c.frame.reads, [], 'הצגת העץ אינה שולחת בקשות');
        },
      },
      {
        do: 'expand',
        title: 'כינוי ג',
        name: 'הרחבה',
        check(c) {
          c.eq(c.reads('backlinks').length, 3, 'שליפת המקשרים להפניה: ערכים, תבניות והפניות');
          c.ok((c.text('#hmk-tool .hmk-backlink-children') || '').indexOf('דף ד') !== -1, 'הילד מוצג');
        },
      },
      { do: 'expand', title: 'כינוי ג', name: 'כיווץ', check(c) { c.ok(!c.visible('#hmk-tool .hmk-backlink-children'), 'כווץ'); } },
      { do: 'expand', title: 'כינוי ג', name: 'הרחבה-חוזרת', check(c) { c.eq(c.frame.reads, [], 'אין שליפה חוזרת'); } },
    ],
  }),

  card('renamed', 'redirect-exists', {
    id: 'I-backlinks-expand-failure-retry',
    title: 'כשל בשליפת מקשרים של הפניה: "לא נבדק", והרחבה חוזרת שולפת שוב',
    group: 'אינטראקציה: עץ המקשרים',
    profile: 'מפעיל',
    net: {
      backlinks: { 'כינוי ג': { direct: ['דף ד'] } },
      faults: { 'backlinks:כינוי ג:nonredirects': { type: 'api', code: 'bl-failed', times: 1 } },
    },
    steps: [
      { do: 'open', name: 'פתיחה' },
      { do: 'backlinks', name: 'הצגת-מקשרים' },
      { do: 'expand', title: 'כינוי ג', name: 'הרחבה-נכשלת', check(c) { c.eq(c.text('#hmk-tool .hmk-backlink-children'), c.STR.notChecked, 'לא נבדק'); } },
      { do: 'expand', title: 'כינוי ג', name: 'כיווץ' },
      {
        do: 'expand',
        title: 'כינוי ג',
        name: 'הרחבה-חוזרת',
        check(c) {
          c.eq(c.reads('backlinks').length, 3, 'שליפה חוזרת: ערכים, תבניות והפניות');
          c.ok((c.text('#hmk-tool .hmk-backlink-children') || '').indexOf('דף ד') !== -1, 'הילד מוצג');
        },
      },
    ],
  }),

  // ===================================================================
  // הרשאות
  // ===================================================================
  Object.assign(levelA('unknown', {}), {
    id: 'I-rights-failure-retry-refetches',
    title: 'כשל רגעי בטעינת ההרשאות: "נסה שוב" שולף אותן מחדש',
    group: 'אינטראקציה: הרשאות',
    profile: 'מפעיל',
    net: { faults: { userinfo: { type: 'api', code: 'rights-flaky', times: 1 } } },
    start: {
      check(c) {
        c.ok(c.runtime.userCapabilitiesLoadFailed, 'הטעינה הראשונה נכשלה');
        c.ok(!c.hasPermissionWarning(), 'אין אזהרה בכרטיס מידע');
      },
    },
    steps: [
      {
        do: 'click',
        label: { str: 'btnRetry' },
        name: 'נסה-שוב',
        check(c) {
          c.eq(c.reads('userinfo').length, 1, 'ההרשאות נשלפו שוב');
          c.ok(!c.runtime.userCapabilitiesLoadFailed, 'הפעם הטעינה הצליחה');
          c.eq(c.env.cardRuntimes.length, 2, 'הכרטיס נבנה מחדש עם היכולות החדשות');
          c.eq(c.env.log.runs.length, 2, 'הבדיקה רצה שוב');
          c.eq(c.count('#hmk-tool .hmk-card'), 1, 'כרטיס אחד');
        },
      },
    ],
  }),

  card('renamed', 'no-redirect', {
    id: 'I-rights-empty-list',
    title: 'רשימת הרשאות ריקה נחשבת כשל: אזהרה, ובמקום העברה רק בקשת העברה',
    group: 'אינטראקציה: הרשאות',
    profile: 'רשימה-ריקה',
    start: {
      check(c) {
        c.ok(c.hasPermissionWarning(), 'אזהרת כשל ההרשאות');
        c.eq(c.labels(), [c.STR.btnRequestMove], 'בקשת העברה בלבד');
      },
    },
    steps: [],
  }),

  card('renamed', 'target-different', {
    id: 'I-rights-redirect-deleter-article-target',
    title: 'מוחק הפניות מול יעד שהוא ערך: אין מחיקה, רק בקשה',
    group: 'אינטראקציה: הרשאות',
    profile: 'מוחק-הפניות',
    start: {
      check(c) {
        c.eq(c.labels(), [c.STR.btnMakeRedirect, c.STR.btnRequestMove], 'מחיקת ערך אינה מוצעת');
      },
    },
    steps: [],
  }),

  // ===================================================================
  // טעינת משאבים
  // ===================================================================
  Object.assign(card('renamed', 'no-redirect', {}), {
    id: 'I-card-script-flaky',
    title: 'כשל רגעי בטעינת סקריפט הכרטיס כשהבדיקה עצמה הצליחה: טעינה חוזרת ותוצאת הבדיקה מוצגת',
    group: 'אינטראקציה: טעינת משאבים',
    profile: 'מפעיל',
    scriptFaults: { card: { times: 1 } },
    start: {
      allow: { consoleErrors: 1 },
      check(c) {
        c.eq(c.env.log.scripts.filter((s) => s === CARD).length, 2, 'הסקריפט נטען פעמיים');
        c.eq(c.env.log.runs.length, 1, 'הבדיקה רצה פעם אחת');
        c.eq(c.title(), c.STR.renamedTitle, 'מוצגת תוצאת הבדיקה ולא "הבדיקה נכשלה"');
        c.eq(c.labels(), [c.STR.btnMoveNoRedirect], 'הפעולות של הכרטיס');
        c.ok(/טעינת הסקריפט נכשלה/.test(c.frame.console.map((x) => x.text).join(' ')), 'כשל הטעינה הראשון נרשם במסוף');
      },
    },
    steps: [],
  }),

  Object.assign(card('renamed', 'no-redirect', {}), {
    id: 'I-stylesheet-flaky',
    title: 'כשל רגעי בטעינת קובץ העיצוב כשהבדיקה עצמה הצליחה: טעינה חוזרת ותוצאת הבדיקה מוצגת',
    group: 'אינטראקציה: טעינת משאבים',
    profile: 'מפעיל',
    styleFault: { times: 1 },
    start: {
      allow: { consoleErrors: 1 },
      check(c) {
        c.eq(c.env.log.styles.length, 2, 'קובץ העיצוב נטען פעמיים');
        c.eq(c.env.log.runs.length, 1, 'הבדיקה רצה פעם אחת');
        c.eq(c.title(), c.STR.renamedTitle, 'מוצגת תוצאת הבדיקה ולא "הבדיקה נכשלה"');
      },
    },
    steps: [],
  }),

  // חריגה בזמן בניית הכרטיס (תוצאה פגומה במכוון: הועבר למרחב אחר בלי
  // יעד). זו תקלה בקוד ולא בטעינה, ולכן היא צריכה להגיע לכרטיס הכשל.
  {
    level: 'A',
    id: 'I-render-exception-failure-card',
    title: 'חריגה בזמן בניית הכרטיס מגיעה לכרטיס הכשל, בלי טעינה חוזרת של המשאבים',
    group: 'אינטראקציה: טעינת משאבים',
    profile: 'מפעיל',
    fixture: {
      result: { moveLog: [], status: 'moved_to_other_namespace', title: PAGE, via: 'יומן' },
      ownFields: {},
    },
    localPages: { [PAGE]: { fields: {} } },
    start: {
      allow: { consoleErrors: 1 },
      check(c) {
        c.eq(c.title(), c.STR.checkFailedTitle, 'כרטיס כשל');
        c.eq(c.body(), c.STR.checkFailedBody, 'גוף כרטיס הכשל');
        c.eq(c.labels(), [c.STR.btnRetry], 'ניסיון חוזר');
        c.eq(c.scriptLoads(CARD), 1, 'המשאבים לא נטענו מחדש');
        c.ok(/TypeError/.test(c.frame.console.map((x) => x.text).join(' ')), 'החריגה נרשמה במסוף');
      },
    },
    steps: [],
  },

  assetFailure('I-card-script-failure', 'כשל קבוע בטעינת סקריפט הכרטיס: הודעת כשל טעינת משאבים', { scriptFaults: { card: {} } }, 2),
  assetFailure('I-stylesheet-failure', 'כשל קבוע בטעינת קובץ העיצוב: הודעת כשל טעינת משאבים', { styleFault: {} }, 2, (c) => {
    c.eq(c.env.log.styles.length, 2, 'ניסיון טעינה חוזר אחד');
  }),
  assetFailure('I-messages-failure', 'כשל קבוע בטעינת קובץ ההודעות: הודעת כשל טעינת משאבים', { scriptFaults: { messages: {} } }, 2),
  assetFailure('I-core-script-failure', 'כשל קבוע בטעינת הליבה: הודעת כשל טעינת משאבים ולא כרטיס', { scriptFaults: { core: {} } }, 2, (c) => {
    c.eq(c.env.log.runs.length, 0, 'הבדיקה לא רצה');
  }),

  // ===================================================================
  // ניסיון חוזר ומצבים נוספים
  // ===================================================================
  {
    level: 'A',
    id: 'I-failure-then-retry-success',
    title: 'כרטיס כשל, "נסה שוב", ובריצה השנייה מתקבל כרטיס העברה',
    group: 'אינטראקציה: ניסיון חוזר',
    profile: 'מפעיל',
    fixture: {
      ownFields: RESULTS.renamed.fields,
      runs: [
        { error: { netError: true, kind: 'server', transient: true, message: 'השרת עמוס או אינו זמין כעת.' } },
        { result: RESULTS.renamed.result },
      ],
    },
    localPages: { [PAGE]: { fields: RESULTS.renamed.fields } },
    net: { wp: { [wpOldTitle(RESULTS.renamed)]: { missing: true } } },
    start: {
      allow: { consoleErrors: 1 },
      check(c) {
        c.eq(c.body(), 'השרת עמוס או אינו זמין כעת.', 'הודעת השגיאה בכרטיס');
      },
    },
    steps: [
      {
        do: 'click',
        label: { str: 'btnRetry' },
        name: 'נסה-שוב',
        check(c) {
          c.eq(c.title(), c.STR.renamedTitle, 'כרטיס ההעברה');
          c.eq(c.count('#hmk-tool .hmk-card'), 1, 'כרטיס אחד');
          c.eq(c.count('#hmk-tool .hmk-skeleton'), 0, 'אין שלד טעינה שנשאר');
          c.eq(c.env.cardRuntimes.length, 1, 'משאבי הכרטיס לא נטענו מחדש');
        },
      },
    ],
  },

  Object.assign(levelA('deleted', {}), {
    id: 'I-deleted-reason-parse-failure',
    title: 'עיבוד סיבת המחיקה נכשל: הסיבה הגולמית וציון שהעיבוד נכשל',
    group: 'אינטראקציה: מצבים נוספים',
    profile: 'מפעיל',
    net: { faults: { 'parse-text': { type: 'http', status: 404 } } },
    start: {
      check(c) {
        const body = c.body() || '';
        c.ok(body.indexOf(RESULTS.deleted.result.reason) !== -1, 'הסיבה הגולמית מוצגת');
        c.ok(body.endsWith(c.STR.deleteReasonFormatFailed), 'ציון שהעיבוד נכשל');
      },
    },
    steps: [],
  }),

  Object.assign(levelA('found', {}), {
    id: 'I-found-size-not-checked',
    title: 'נמצא, גודל הדף המקומי לא ידוע: "לא נבדקה" ולא מספר',
    group: 'אינטראקציה: מצבים נוספים',
    profile: 'מפעיל',
    fixture: {
      result: Object.assign({}, RESULTS.found.result, { page: { ns: 0, pageid: 30, revisions: [{ revid: 301, size: 200 }], title: 'בסיס' } }),
      ownFields: RESULTS.found.fields,
      localSize: null,
    },
    start: {
      check(c) {
        c.eq(c.text('.mw-indicators .hmk-diff'), 'השוואת הגודל: לא נבדקה', 'מחוון הגודל');
        c.ok(!c.exists('#p-lang .hmk-en-link'), 'אין קישור לאנגלית כשאין קישור שפה');
      },
    },
    steps: [],
  }),

  Object.assign(levelA('chain_too_long', {}), {
    id: 'I-retry-replaces-card',
    title: '"נסה שוב" מנקה את הכרטיס ומריץ את הבדיקה מחדש בלי כפילויות',
    group: 'אינטראקציה: ניסיון חוזר',
    profile: 'מפעיל',
    steps: [
      {
        do: 'click',
        label: { str: 'btnRetry' },
        name: 'נסה-שוב',
        check(c) {
          c.eq(c.env.log.runs.length, 2, 'הבדיקה רצה פעמיים');
          c.eq(c.count('#hmk-tool .hmk-card'), 1, 'כרטיס אחד');
          c.eq(c.count('#hmk-tool .hmk-panel'), 1, 'פאנל אחד');
          c.eq(c.frame.scripts, [], 'המשאבים לא נטענו שוב');
        },
      },
    ],
  }),
];

function build() {
  return SCENARIOS.map((s) => Object.assign({ level: 'A' }, s));
}

module.exports = { build };
