'use strict';

// קטלוג תוצאות הכרעה לרמה א'. כל תוצאה בנויה בדיוק בצורה שהליבה
// מחזירה (אומת מול תמונות הייחוס של סוויטת החוזה), כולל שדה הודעת
// השגיאה בכשלי מקורות, שהכרטיס מציג ושסוויטת החוזה משמיטה בנרמול.
//
// הדף הנוכחי בכל התרחישים: "מקומי".

const PAGE = 'מקומי';

function wpPage(title, extra) {
  return Object.assign(
    { ns: 0, pageid: 30, revisions: [{ revid: 301, size: 200 }], title },
    extra || {}
  );
}

function failure(sourceKey, messageKey, kind, message) {
  return {
    sourceKey,
    messageKey,
    errorMessage: message,
    error: { kind, transient: false, silent: false, netError: true, message },
  };
}

const FAIL_REVISION = failure(
  'failureSourceRevision',
  'fallbackRevisionFailed',
  'api',
  'השרת החזיר שגיאה: bad-revision-test'
);
const FAIL_WIKIDATA = failure(
  'failureSourceWikidata',
  'fallbackWikidataFailed',
  'notfound',
  'הכתובת המבוקשת לא נמצאה.'
);

const RESULTS = {
  // ---- נמצא ----
  found: {
    fields: { דף: 'בסיס', גרסה: '101', פריט: 'Q1' },
    result: {
      depth: 0,
      moveLog: [],
      page: wpPage('בסיס', {
        langlinks: [{ lang: 'en', url: 'https://en.wikipedia.org/wiki/Base', langname: 'אנגלית', '*': 'Base' }],
      }),
      revid: '101',
      status: 'found',
      title: 'בסיס',
      via: 'גרסה',
    },
  },
  'found-revid-deleted': {
    fields: { דף: 'בסיס', גרסה: '101', פריט: 'Q1' },
    result: { depth: 0, moveLog: [], page: wpPage('בסיס'), revidDeletedNotice: true, status: 'found', title: 'בסיס', via: 'פריט' },
  },
  'found-source-failures': {
    fields: { דף: 'בסיס', גרסה: '101', פריט: 'Q1' },
    result: {
      depth: 0,
      moveLog: [],
      page: wpPage('בסיס'),
      sourceFailures: [FAIL_REVISION, FAIL_WIKIDATA],
      status: 'found',
      title: 'בסיס',
    },
  },
  'found-revid-deleted-and-failure': {
    fields: { דף: 'בסיס', גרסה: '101', פריט: 'Q1' },
    result: {
      depth: 0,
      moveLog: [],
      page: wpPage('בסיס'),
      revidDeletedNotice: true,
      sourceFailures: [FAIL_WIKIDATA],
      status: 'found',
      title: 'בסיס',
    },
  },

  // ---- מצב מקומי תואם, עם אזהרה שגוברת ----
  'matched-with-warning': {
    fields: { גרסה: '101' },
    localStateMatched: true,
    local: { redirectTo: 'יעד' },
    result: {
      depth: 0,
      localStateMatched: true,
      moveLog: [],
      sourceFailures: [FAIL_REVISION],
      status: 'redirect',
      target: 'יעד',
      targetFragment: null,
      title: PAGE,
    },
  },

  // ---- כרטיסי העברה ----
  renamed: {
    fields: { דף: 'ישן', גרסה: '101', פריט: 'Q1' },
    target: 'חדש',
    result: {
      from: 'ישן',
      moveLog: [],
      page: wpPage('חדש'),
      revid: '101',
      status: 'renamed',
      targetIsDisambig: false,
      title: 'חדש',
      via: 'גרסה',
    },
  },
  'renamed-disambig': {
    fields: { דף: 'ישן', גרסה: '101', פריט: 'Q1' },
    target: 'חדש',
    result: {
      from: 'ישן',
      moveLog: [],
      revid: '101',
      status: 'renamed',
      targetIsDisambig: true,
      title: 'חדש',
      via: 'גרסה',
    },
  },
  // שינוי שם שזוהה מהיומן: רצף ההעברות מגיע מוכן בתוצאה.
  'renamed-by-log': {
    fields: { פריט: 'Q1' },
    target: 'חדש',
    result: {
      from: PAGE,
      moveLog: [
        {
          comment: 'שינוי שם לפי מדיניות',
          params: { target_title: 'חדש', target_ns: 0 },
          timestamp: '2026-02-01T10:30:00Z',
          type: 'move',
          user: 'Mover',
        },
      ],
      page: wpPage('חדש'),
      status: 'renamed',
      timestamp: '2026-02-01T10:30:00Z',
      title: 'חדש',
      via: 'יומן',
    },
  },
  redirect: {
    fields: { פריט: 'Q1' },
    target: 'יעד',
    fragment: 'פסקה',
    result: {
      depth: 0,
      moveLog: [],
      status: 'redirect',
      target: 'יעד',
      targetFragment: 'פסקה',
      title: PAGE,
    },
  },
  // הפניה בוויקיפדיה שמצביעה אל הדף הנוכחי עצמו: אין מה לעשות.
  'redirect-to-current': {
    fields: { פריט: 'Q1' },
    target: PAGE,
    result: {
      depth: 0,
      moveLog: [],
      status: 'redirect',
      target: PAGE,
      targetFragment: null,
      title: 'כינוי',
    },
  },

  // ---- מצבים פשוטים ----
  disambiguation: {
    fields: {},
    result: { depth: 0, moveLog: [], page: wpPage(PAGE, { pageprops: { disambiguation: '' } }), status: 'disambiguation', title: PAGE },
  },
  already_synced: {
    fields: { דף: 'חדש', גרסה: '101' },
    result: {
      baseline: 'חדש',
      from: 'ישן',
      moveLog: [],
      page: wpPage('חדש'),
      resolvedStatus: 'found',
      revid: '101',
      status: 'already_synced',
      target: 'חדש',
      title: 'חדש',
      via: 'גרסה',
    },
  },
  'already_synced-target-unchecked': {
    fields: { דף: 'חדש', גרסה: '101' },
    result: {
      baseline: 'חדש',
      baselineTargetFailure: { kind: 'api', transient: false, silent: false, netError: true, message: 'השרת החזיר שגיאה: target-check-failed' },
      from: 'ישן',
      moveLog: [],
      page: null,
      resolvedStatus: 'unchecked',
      revid: '101',
      status: 'already_synced',
      target: 'חדש',
      title: 'חדש',
      via: 'גרסה',
    },
  },
  deleted: {
    fields: {},
    result: {
      moveLog: [{ comment: 'הפרת זכויות יוצרים, ראו [[ויקיפדיה:זכויות יוצרים|מדיניות]]', timestamp: '2026-02-01T10:30:00Z', type: 'delete', user: 'Deleter' }],
      reason: 'הפרת זכויות יוצרים, ראו [[ויקיפדיה:זכויות יוצרים|מדיניות]]; התוכן היה: "טקסט שנמחק"',
      status: 'deleted',
      timestamp: '2026-02-01T10:30:00Z',
      title: PAGE,
      via: 'יומן',
    },
  },
  'deleted-no-reason': {
    fields: {},
    result: {
      moveLog: [{ comment: '', timestamp: '2026-02-01T10:30:00Z', type: 'delete', user: 'Deleter' }],
      reason: '',
      status: 'deleted',
      timestamp: '2026-02-01T10:30:00Z',
      title: PAGE,
      via: 'יומן',
    },
  },
  moved_to_other_namespace: {
    fields: {},
    result: {
      moveLog: [{ comment: 'הועבר לטיוטה', params: { target_ns: 118, target_title: 'טיוטה:מקומי' }, timestamp: '2026-02-01T10:30:00Z', type: 'move', user: 'Mover' }],
      status: 'moved_to_other_namespace',
      target: 'טיוטה:מקומי',
      targetNs: 118,
      timestamp: '2026-02-01T10:30:00Z',
      title: PAGE,
      via: 'יומן',
    },
  },
  chain_too_long: {
    fields: {},
    result: { moveLog: [], status: 'chain_too_long', title: 'T6' },
  },
  cycle_detected: {
    fields: {},
    result: { moveLog: [], status: 'cycle_detected', title: PAGE },
  },
  unknown: {
    fields: {},
    result: { moveLog: [], status: 'unknown', title: PAGE },
  },
  'unknown-older-evidence': {
    fields: {},
    result: {
      moveLog: [],
      olderLogEvidence: [
        { comment: 'move', params: { target_ns: 0, target_title: 'ישן' }, timestamp: '2025-01-01T08:00:00Z', type: 'move', user: 'Mover' },
      ],
      status: 'unknown',
      title: PAGE,
    },
  },
};

// שגיאות שהליבה דוחה בהן (כרטיס כשל)
const ERRORS = {
  'net-error': { netError: true, transient: false, kind: 'api', code: 'permanent-test', message: 'השרת החזיר שגיאה: permanent-test' },
  'plain-error': { message: 'שגיאה פנימית' },
};

module.exports = { PAGE, RESULTS, ERRORS, FAIL_REVISION, FAIL_WIKIDATA, wpPage };
