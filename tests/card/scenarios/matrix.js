'use strict';

// מטריצת רמה א': כל כרטיס נבנה מתוצאה מוזרקת, מול כל פרופיל הרשאות.
// בכל תא: בניית הכרטיס ופתיחת הפרטים, ובדיקת כוונה לפי המפרט שכאן.
//
// המפרט (expectedMoveActions ודומיו) הוא ניסוח עצמאי של הכללים המתועדים
// במסמכי השלבים ובהערות הקוד, ולא העתקה של הקוד.

const { RESULTS, ERRORS, PAGE } = require('../fixtures/results');
const { MATRIX_PROFILES, expectedCapabilities } = require('../fixtures/profiles');

const PROFILE_SLUG = {
  'עורך': 'editor',
  'מעביר': 'mover',
  'מעביר-מלא': 'mover-full',
  'מפעיל': 'sysop',
  'כשל-הרשאות': 'rights-failed',
  'מוחק-הפניות': 'redirect-deleter',
  'רשימה-ריקה': 'rights-empty',
};

const DELETED_INFO_SCRIPT = 'משתמש:בוט גאון הירדן/מידע דף מחוק.js';

function levelA(resultKey, extra) {
  const fx = RESULTS[resultKey];
  if (!fx) throw new Error(`תוצאה לא קיימת בקטלוג: ${resultKey}`);
  const localPages = Object.assign(
    { [PAGE]: fx.local ? Object.assign({}, fx.local) : { fields: fx.fields } },
    (extra && extra.localPages) || {}
  );
  return Object.assign(
    {
      level: 'A',
      fixture: {
        result: fx.result,
        ownFields: fx.fields,
        localStateMatched: !!fx.localStateMatched,
        localSize: fx.localSize,
      },
    },
    extra || {},
    { localPages }
  );
}

// ---------------------------------------------------------------------
// כרטיס ההעברה
// ---------------------------------------------------------------------

// השם הישן בוויקיפדיה: הכותרת שהיא הפניה, או השם שממנו הערך הועבר.
// שאלת ההפניה נשאלת עליו, ולא על שם הדף במכלול.
function wpOldTitle(fx) {
  return fx.result.status === 'redirect' ? fx.result.title : fx.result.from || PAGE;
}

// וריאנטים של בדיקות המשנה לפני פעולה. T הוא יעד ההעברה, OLD השם הישן בוויקיפדיה.
const MOVE_VARIANTS = {
  'redirect-exists': {
    title: 'השם הישן בוויקיפדיה מפנה ליעד; היעד לא קיים במכלול',
    net: (T, OLD) => ({
      wp: { [OLD]: { redirectTo: T } },
      backlinks: { [PAGE]: { direct: ['דף א', 'דף ב'], redirects: ['כינוי ג'], directMore: true } },
    }),
    action: 'move_with_redirect',
    backlinksRow: true,
  },
  'no-redirect': {
    title: 'השם הישן לא קיים בוויקיפדיה; היעד לא קיים במכלול',
    net: (T, OLD) => ({ wp: { [OLD]: { missing: true } } }),
    action: 'move_no_redirect',
  },
  'redirect-check-failed': {
    title: 'בדיקת ההפניה בוויקיפדיה נכשלה; ברירת המחדל הבטוחה היא השארת הפניה',
    net: (T, OLD) => ({ faults: { [`wp-redirect:${OLD}`]: { type: 'api', code: 'wp-check-failed' } } }),
    action: 'move_with_redirect',
  },
  'target-same': {
    title: 'היעד קיים במכלול כערך עם אותו פריט',
    net: (T, OLD) => ({ wp: { [OLD]: { missing: true } } }),
    local: (T) => ({ [T]: { fields: { פריט: 'Q1' } } }),
    action: 'make_redirect',
  },
  'target-different': {
    title: 'היעד קיים במכלול כערך עם פריט אחר',
    net: (T, OLD) => ({ wp: { [OLD]: { missing: true } } }),
    local: (T) => ({ [T]: { fields: { פריט: 'Q2' } } }),
    action: 'manual',
    targetStatus: 'article',
    suppress: true,
  },
  'target-unknown-identity': {
    title: 'היעד קיים במכלול כערך בלי פריט',
    net: (T, OLD) => ({ wp: { [OLD]: { missing: true } } }),
    local: (T) => ({ [T]: { fields: {} } }),
    action: 'manual',
    targetStatus: 'article',
    suppress: true,
  },
  // שונה בסבב ההפניות, לפי הכרעת המשתמש: יעד שהוא הפניה לדף אחר הוא
  // החלטה של המכלול, והשרת יחסום העברה אליו. לכן בדיקה ידנית, שיקוף
  // ובקשת העברה בלבד (קודם: "העברה בלי הפניה").
  'target-local-redirect': {
    title: 'היעד קיים במכלול כהפניה לדף אחר',
    net: (T, OLD) => ({ wp: { [OLD]: { missing: true } } }),
    local: (T) => ({ [T]: { redirectTo: 'אחר' } }),
    action: 'manual',
    targetStatus: 'redirect-elsewhere',
  },
  'target-unchecked': {
    title: 'בדיקת היעד במכלול נכשלה',
    net: (T, OLD) => ({ wp: { [OLD]: { missing: true } }, faults: { [`local-page:${T}`]: { type: 'http', status: 404 } } }),
    action: 'manual',
    targetStatus: 'unchecked',
  },
  'backlinks-failed': {
    title: 'בדיקת הדפים המקשרים נכשלה',
    net: (T, OLD) => ({
      wp: { [OLD]: { missing: true } },
      faults: { [`backlinks:${PAGE}:redirects`]: { type: 'api', code: 'backlinks-failed' } },
    }),
    action: 'move_no_redirect',
    backlinksRow: true,
  },
};

// הפעולות הצפויות בכרטיס ההעברה, לפי ההכרעה והיכולות. עריכה ובקשה פתוחות
// לכל משתמש רשום, ומשתמש לא רשום אינו מריץ את הכלי:
// - אין צורך בפעולה: אין פעולות.
// - הפיכה להפניה: כפתור יחיד.
// - העברה: הכפתור לפי ההמלצה אם יש יכולת העברה מתאימה; אחרת בקשת העברה.
// - בדיקה ידנית: יעד שלא נבדק ← "נסה שוב" בלבד. יעד שהוא ערך ← הפיכה
//   להפניה, ואחריה מחיקה והעברה (עם מחיקה והעברה מתאימה) או בקשת העברה.
function expectedMoveActions(variant, caps, STR, target) {
  const canMove = (suppress) => (suppress ? caps.moveWithoutRedirect : caps.moveWithRedirect);
  switch (variant.action) {
    case 'none':
    case 'manual-none':
      return [];
    case 'make_redirect':
      return [STR.btnMakeRedirect];
    case 'move_with_redirect':
    case 'move_no_redirect': {
      const suppress = variant.action === 'move_no_redirect';
      if (canMove(suppress)) return [suppress ? STR.btnMoveNoRedirect : STR.btnMoveWithRedirect];
      return [STR.btnRequestMove];
    }
    case 'manual': {
      if (variant.targetStatus === 'unchecked') return [STR.btnRetry];
      if (variant.targetStatus === 'redirect-elsewhere') return [STR.btnRequestMove];
      const out = [STR.btnMakeRedirect];
      if (caps.deletePage && canMove(!!variant.suppress)) out.push(STR.btnDeleteAndMove(target));
      else out.push(STR.btnRequestMove);
      return out;
    }
    default:
      throw new Error(`הכרעה לא מוכרת: ${variant.action}`);
  }
}

// ערך שמוזג בוויקיפדיה (הכותרת שם היא הפניה): אין העברה. יעד שקיים במכלול
// כערך ← הפיכה להפניה; יעד שלא נבדק ← "נסה שוב"; כל השאר ← בדיקה ידנית בלי פעולות.
function mergedVariant(variant) {
  if (variant.targetStatus === 'unchecked') return variant;
  if (variant.local && variant.targetStatus !== 'redirect-elsewhere') return Object.assign({}, variant, { action: 'make_redirect' });
  return Object.assign({}, variant, { action: 'manual-none' });
}

function moveScenario(resultKey, variantKey, rawVariant, profile) {
  const fx = RESULTS[resultKey];
  const variant = fx.result.status === 'redirect' ? mergedVariant(rawVariant) : rawVariant;
  const T = fx.target;
  const expected = expectedCapabilities(profile);
  const cardTitleKey = fx.result.status === 'redirect' ? 'redirectTitle' : 'renamedTitle';
  return levelA(resultKey, {
    id: `A-move-${resultKey}-${variantKey}-${PROFILE_SLUG[profile]}`,
    title: `כרטיס העברה (${resultKey}): ${variant.title} — ${profile}`,
    group: 'מטריצה: כרטיס העברה',
    profile,
    net: variant.net ? variant.net(T, wpOldTitle(fx)) : {},
    localPages: variant.local ? variant.local(T) : {},
    start: {
      check(c) {
        c.eq(c.cardType(), 'notice', 'סוג הכרטיס');
        c.eq(c.title(), c.STR[cardTitleKey], 'כותרת הכרטיס');
        c.eq(c.labels(), expectedMoveActions(variant, expected.caps, c.STR, T), 'הפעולות בכרטיס');
        c.eq(c.hasPermissionWarning(), expected.failed, 'אזהרת כשל ההרשאות');
        c.ok(c.exists('#hmk-tool .hmk-carddecision'), 'חסרה שורת ההכרעה בכרטיס');
        const backlinksRow = c.warnings().some((w) => w.indexOf(c.STR.backlinksLabel) === 0);
        c.eq(backlinksRow, !!variant.backlinksRow && variant.action !== 'none', 'שורת הדפים המקשרים בכרטיס');
        c.eq(c.exists('#hmk-tool .hmk-note'), !!fx.result.targetIsDisambig, 'הערת יעד פירושונים');
        c.ok(c.exists('#hmk-tool .hmk-arrow[aria-expanded="false"]'), 'החץ צריך להיות סגור לפני פתיחה');
        c.ok(!c.visible('#hmk-tool .hmk-panel'), 'הפאנל צריך להיות מוסתר לפני פתיחה');
        c.eq(c.scriptLoads('Gadget page tool.details.js'), 0, 'מודול הפרטים לא נטען לפני פתיחה');
      },
    },
    steps: [
      {
        do: 'open',
        name: 'פתיחת-פרטים',
        check(c) {
          c.ok(c.visible('#hmk-tool .hmk-panel'), 'הפאנל לא נפתח');
          c.eq(c.scriptLoads('Gadget page tool.details.js'), 1, 'טעינות מודול הפרטים');
          const both = expected.caps.moveWithRedirect && expected.caps.moveWithoutRedirect;
          const isMove = variant.action === 'move_with_redirect' || variant.action === 'move_no_redirect';
          c.eq(c.exists('#hmk-tool .hmk-toggle-redirect'), both && isMove, 'בורר ההפניה בפרטים');
          if (both && isMove) {
            const on = c.text('#hmk-tool .hmk-seg-btn.hmk-seg-on');
            const recommended = variant.action === 'move_no_redirect' ? c.STR.btnMoveNoRedirect : c.STR.btnMoveWithRedirect;
            c.eq(on, recommended, 'הבחירה המסומנת בבורר');
          }
        },
      },
    ],
  });
}

// הפניה בוויקיפדיה שמצביעה אל הדף הנוכחי: אין פעולה בכלל.
function moveToCurrentScenario(profile) {
  const expected = expectedCapabilities(profile);
  return levelA('redirect-to-current', {
    id: `A-move-redirect-to-current-${PROFILE_SLUG[profile]}`,
    title: `כרטיס העברה: היעד הוא הדף הנוכחי — ${profile}`,
    group: 'מטריצה: כרטיס העברה',
    profile,
    net: { wp: { [wpOldTitle(RESULTS['redirect-to-current'])]: { missing: true } } },
    start: {
      check(c) {
        c.eq(c.labels(), [], 'הפעולות בכרטיס');
        c.eq(c.hasPermissionWarning(), expected.failed, 'אזהרת כשל ההרשאות');
        c.ok((c.text('#hmk-tool .hmk-carddecision') || '').indexOf(c.STR.noActionNeeded) !== -1, 'שורת ההכרעה צריכה לומר שאין צורך בפעולה');
      },
    },
    steps: [
      {
        do: 'open',
        name: 'פתיחת-פרטים',
        check(c) {
          c.ok(!c.exists('#hmk-tool .hmk-toggle-redirect'), 'אין בורר הפניה כשאין פעולה');
          c.ok(!c.exists('#hmk-tool .hmk-backlinks'), 'אין פירוט מקשרים כשאין פעולה');
        },
      },
    ],
  });
}

// ---------------------------------------------------------------------
// מצבים פשוטים
// ---------------------------------------------------------------------

// פעולות מחיקה: מפעיל ← קישור למחיקה; כל משתמש אחר ← בקשת מחיקה.
function expectedDeleteActions(caps, STR) {
  return caps.deletePage ? [STR.btnDelete] : [STR.btnRequestDelete];
}

const SENSITIVE_STATES = {
  deleted: {
    title: 'נמחק בוויקיפדיה',
    check(c, expected) {
      c.eq(c.cardType(), 'error', 'סוג הכרטיס');
      c.eq(c.labels(), expectedDeleteActions(expected.caps, c.STR), 'פעולות המחיקה');
      const link = c.actions().find((a) => a.label === c.STR.btnDelete);
      if (link) {
        c.eq(link.tag, 'a', 'מחיקה למפעיל היא קישור לטופס המחיקה');
        c.ok(/action=delete/.test(link.href) && /wpReason=/.test(link.href), 'קישור המחיקה חייב לכלול פעולה וסיבה');
      }
      c.eq(c.env.log.imports, [DELETED_INFO_SCRIPT], 'הסקריפט "מידע דף מחוק" נטען פעם אחת');
      const parse = c.reads('parse-text');
      c.eq(parse.length, 1, 'בקשות עיבוד סיבת המחיקה');
      if (parse.length) {
        c.ok(parse[0].params.text.indexOf('[https://he.wikipedia.org/wiki/') !== -1, 'קישורים בסיבה חייבים להפנות לוויקיפדיה');
      }
      const body = c.body() || '';
      c.ok(body.indexOf(c.STR.deleteReasonPrefix.trim()) === 0, 'גוף הכרטיס מתחיל בקידומת הסיבה');
      c.ok(body.indexOf('התוכן היה') === -1, 'הסיבה נחתכת לפני "התוכן היה"');
    },
  },
  moved_to_other_namespace: {
    title: 'הועבר למרחב אחר',
    check(c, expected) {
      c.eq(c.cardType(), 'warning', 'סוג הכרטיס');
      c.eq(c.labels(), expectedDeleteActions(expected.caps, c.STR), 'פעולות המחיקה');
      c.ok((c.title() || '').indexOf('טיוטה') !== -1, 'הכותרת מציינת את המרחב');
    },
  },
};

// מצבי מידע: לא תלויים בהרשאות. נבדקים מול מפעיל ומול כשל הרשאות,
// כדי לוודא שאזהרת ההרשאות אינה מופיעה בהם.
const INFO_STATES = {
  disambiguation: { title: 'פירושונים', type: 'notice', actions: [] },
  already_synced: { title: 'כבר טופל', type: 'success', actions: [] },
  'already_synced-target-unchecked': {
    title: 'כבר טופל, אימות היעד חלקי',
    type: 'success',
    actions: [],
    warn: 'alreadyHandledTargetUnchecked',
  },
  chain_too_long: { title: 'שרשרת ארוכה מדי', type: 'warning', actions: ['btnRetry'] },
  cycle_detected: { title: 'מעגל', type: 'warning', actions: ['btnRetry'] },
  unknown: { title: 'לא ידוע', type: 'neutral', actions: ['btnRetry'], importsDeletedInfo: true },
  'unknown-older-evidence': { title: 'לא ידוע עם ראיה ישנה', type: 'neutral', actions: ['btnRetry'], importsDeletedInfo: true },
  'deleted-no-reason': { title: 'נמחק בלי סיבה', type: 'error', sensitive: true },
};

function infoScenario(resultKey, spec, profile) {
  const expected = expectedCapabilities(profile);
  return levelA(resultKey, {
    id: `A-state-${resultKey}-${PROFILE_SLUG[profile]}`,
    title: `כרטיס מצב: ${spec.title} — ${profile}`,
    group: 'מטריצה: מצבים',
    profile,
    start: {
      check(c) {
        c.eq(c.cardType(), spec.type, 'סוג הכרטיס');
        if (spec.actions) c.eq(c.labels(), spec.actions.map((k) => c.STR[k]), 'הפעולות בכרטיס');
        c.eq(c.hasPermissionWarning(), !!spec.sensitive && expected.failed, 'אזהרת כשל ההרשאות');
        if (spec.warn) c.eq(c.warnings(), [c.STR[spec.warn]], 'שורות האזהרה');
        if (spec.importsDeletedInfo) c.eq(c.env.log.imports, [DELETED_INFO_SCRIPT], 'טעינת "מידע דף מחוק"');
        if (resultKey === 'deleted-no-reason') {
          c.eq(c.body(), c.STR.deletedNoReason, 'גוף הכרטיס בלי סיבה');
          c.eq(c.reads('parse-text').length, 0, 'אין עיבוד כשאין סיבה');
        }
      },
    },
    steps: [{ do: 'open', name: 'פתיחת-פרטים', check(c) { c.ok(c.visible('#hmk-tool .hmk-panel'), 'הפאנל לא נפתח'); } }],
  });
}

function sensitiveScenario(resultKey, spec, profile) {
  const expected = expectedCapabilities(profile);
  return levelA(resultKey, {
    id: `A-state-${resultKey}-${PROFILE_SLUG[profile]}`,
    title: `כרטיס מצב: ${spec.title} — ${profile}`,
    group: 'מטריצה: מצבים',
    profile,
    net: {
      wpLogs: {
        [PAGE]: {
          delete: resultKey === 'deleted' ? [{ comment: 'מחיקה', timestamp: '2026-02-01T10:30:00Z', user: 'Deleter' }] : [],
          move: [],
        },
      },
    },
    start: {
      check(c) {
        spec.check(c, expected);
        c.eq(c.hasPermissionWarning(), expected.failed, 'אזהרת כשל ההרשאות');
      },
    },
    steps: [{ do: 'open', name: 'פתיחת-פרטים', check(c) { c.ok(c.visible('#hmk-tool .hmk-panel'), 'הפאנל לא נפתח'); } }],
  });
}

// ---------------------------------------------------------------------
// "נמצא" ואזהרות עצמאיות
// ---------------------------------------------------------------------

const FOUND_STATES = {
  found: {
    title: 'נמצא בלי אזהרות: אין כרטיס, רק מחוון גודל',
    localSize: 150,
    check(c) {
      c.ok(!c.exists('#hmk-tool'), 'אין מכל כלל');
      c.eq(c.scripts(), ['Gadget page tool.core.js'], 'רק הליבה נטענת; משאבי הכרטיס לא נטענים');
      c.eq(c.reads('userinfo').length, 0, 'ההרשאות לא נשלפות בלי כרטיס');
      c.eq(c.text('.mw-indicators .hmk-diff'), 'ויקיפדיה: +50', 'מחוון הגודל (200 בוויקיפדיה מול 150 במכלול)');
      c.ok(c.exists('#p-lang .hmk-en-link a[href="https://en.wikipedia.org/wiki/Base"]'), 'קישור לאנגלית');
      c.eq(c.text('.mw-indicators .hmk-diff-alt'), '(בסיס)', 'השם בוויקיפדיה שונה מהשם המקומי ולכן מוצג לצד המחוון');
    },
  },
  'found-revid-deleted': {
    title: 'נמצא, הגרסה שיובאה נמחקה',
    check(c) {
      c.eq(c.cardType(), 'warning', 'סוג הכרטיס');
      c.eq(c.title(), c.STR.revidGoneTitle, 'כותרת');
      c.eq(c.body(), c.STR.revidDeletedNotice, 'גוף הכרטיס');
      c.eq(c.warnings(), [], 'ההודעה מוצגת פעם אחת בלבד, לא גם כשורת אזהרה');
      c.ok(!c.exists('.mw-indicators .hmk-diff'), 'אין מחוון גודל כשהגרסה נמחקה');
    },
  },
  'found-source-failures': {
    title: 'נמצא דרך מקור חלופי',
    check(c) {
      c.eq(c.title(), c.STR.fallbackTitle, 'כותרת');
      const body = c.body() || '';
      c.ok(body.indexOf(c.STR.fallbackRevisionFailed) !== -1 && body.indexOf(c.STR.fallbackWikidataFailed) !== -1, 'שני הכשלים בגוף הכרטיס');
      c.ok(body.indexOf('bad-revision-test') !== -1, 'הודעת השגיאה של המקור מוצגת');
      c.eq(c.warnings(), [], 'הכשלים אינם משוכפלים כשורת אזהרה');
      c.ok(c.exists('.mw-indicators .hmk-diff'), 'מחוון הגודל מוצג (האזהרה אינה סופית)');
    },
  },
  'found-revid-deleted-and-failure': {
    title: 'נמצא, גרסה נמחקה וגם כשל מקור',
    check(c) {
      c.eq(c.body(), c.STR.revidDeletedNotice, 'גוף הכרטיס הוא הודעת הגרסה');
      const rows = c.warnings();
      c.eq(rows.length, 1, 'שורת אזהרה אחת נוספת');
      c.ok(rows[0] && rows[0].indexOf(c.STR.fallbackWikidataFailed) !== -1, 'השורה הנוספת היא כשל ויקינתונים');
      c.ok(!c.exists('.mw-indicators .hmk-diff'), 'אין מחוון גודל');
    },
  },
  'matched-with-warning': {
    title: 'מצב מקומי תואם, אבל יש אזהרה על מסלול הזיהוי',
    check(c) {
      c.eq(c.cardType(), 'warning', 'סוג הכרטיס');
      c.eq(c.title(), c.STR.fallbackTitle, 'כותרת');
      c.eq(c.labels(), [], 'אין פעולות כשהמצב כבר תואם');
      c.eq(c.warnings(), [], 'אין שורות אזהרה נוספות');
    },
  },
};

function foundScenario(resultKey, spec, profile) {
  const s = levelA(resultKey, {
    id: `A-found-${resultKey}-${PROFILE_SLUG[profile]}`,
    title: `${spec.title} — ${profile}`,
    group: 'מטריצה: נמצא ואזהרות',
    profile,
    start: {
      check(c) {
        spec.check(c);
        c.ok(!c.hasPermissionWarning(), 'אזהרת הרשאות אינה מופיעה בכרטיס מידע');
      },
    },
    steps: [{ do: 'open', name: 'פתיחת-פרטים', ifPresent: true }],
  });
  if (spec.localSize !== undefined) s.fixture.localSize = spec.localSize;
  return s;
}

// ---------------------------------------------------------------------
// כרטיס כשל
// ---------------------------------------------------------------------

function failureScenario(errorKey, profile) {
  const error = ERRORS[errorKey];
  return {
    level: 'A',
    id: `A-failure-${errorKey}-${PROFILE_SLUG[profile]}`,
    title: `כרטיס כשל (${errorKey}) — ${profile}`,
    group: 'מטריצה: כשל',
    profile,
    fixture: { error },
    localPages: { [PAGE]: { fields: {} } },
    start: {
      allow: { consoleErrors: 1 },
      check(c) {
        c.eq(c.cardType(), 'error', 'סוג הכרטיס');
        c.eq(c.title(), c.STR.checkFailedTitle, 'כותרת');
        c.eq(c.body(), error.netError ? error.message : c.STR.checkFailedBody, 'גוף הכרטיס');
        c.eq(c.labels(), [c.STR.btnRetry], 'הפעולות');
        c.ok(!c.hasPermissionWarning(), 'אין אזהרת הרשאות בכרטיס כשל');
        c.ok(!c.exists('#hmk-tool .hmk-arrow'), 'אין פרטים בכרטיס כשל');
      },
    },
    steps: [],
  };
}

// ---------------------------------------------------------------------

function build() {
  const out = [];
  for (const resultKey of ['renamed', 'redirect']) {
    for (const [variantKey, variant] of Object.entries(MOVE_VARIANTS)) {
      if (resultKey === 'redirect' && ['target-local-redirect', 'backlinks-failed', 'redirect-check-failed', 'target-unknown-identity'].includes(variantKey)) continue;
      for (const profile of MATRIX_PROFILES) out.push(moveScenario(resultKey, variantKey, variant, profile));
    }
  }
  for (const profile of MATRIX_PROFILES) out.push(moveToCurrentScenario(profile));
  for (const profile of ['מפעיל', 'כשל-הרשאות']) {
    out.push(moveScenario('renamed-disambig', 'no-redirect', MOVE_VARIANTS['no-redirect'], profile));
    out.push(moveScenario('renamed-by-log', 'no-redirect', MOVE_VARIANTS['no-redirect'], profile));
  }

  for (const [key, spec] of Object.entries(SENSITIVE_STATES)) {
    for (const profile of MATRIX_PROFILES) out.push(sensitiveScenario(key, spec, profile));
  }
  for (const [key, spec] of Object.entries(INFO_STATES)) {
    for (const profile of ['מפעיל', 'כשל-הרשאות']) out.push(infoScenario(key, spec, profile));
  }
  for (const [key, spec] of Object.entries(FOUND_STATES)) {
    for (const profile of ['מפעיל', 'כשל-הרשאות']) out.push(foundScenario(key, spec, profile));
  }
  for (const key of Object.keys(ERRORS)) {
    for (const profile of ['מפעיל', 'כשל-הרשאות']) out.push(failureScenario(key, profile));
  }
  return out;
}

module.exports = { build, levelA, MOVE_VARIANTS, expectedMoveActions, PROFILE_SLUG, DELETED_INFO_SCRIPT, wpOldTitle };
