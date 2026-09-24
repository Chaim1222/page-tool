function wt(fields = {}) {
  const parts = ['{{מיון ויקיפדיה'];
  for (const [k, v] of Object.entries(fields)) parts.push(`|${k}=${v}`);
  parts.push('}}');
  return parts.join('');
}

function move(to, ts = '2026-02-01T00:00:00Z', ns = 0) {
  return { user: 'Mover', timestamp: ts, comment: 'move', params: { target_title: to, target_ns: ns } };
}
function del(ts = '2026-02-01T00:00:00Z') {
  return { user: 'Deleter', timestamp: ts, comment: 'delete' };
}

const base = {
  pageName: 'מקומי',
  local: { wikitext: wt({}), creationTs: '2026-01-01T00:00:00Z' },
  wikiTitles: {},
  logs: {},
  failures: {},
};

function s(id, name, patch) {
  return {
    ...base,
    ...patch,
    id,
    name,
    local: { ...base.local, ...(patch.local || {}) },
    wikiTitles: { ...base.wikiTitles, ...(patch.wikiTitles || {}) },
    logs: { ...base.logs, ...(patch.logs || {}) },
    failures: { ...base.failures, ...(patch.failures || {}) },
  };
}

const scenarios = [
  s('source-revision-valid', 'גרסה תקינה', {
    local: { wikitext: wt({ דף: 'בסיס', גרסה: '101', פריט: 'Q1' }) },
    revision: { id: 101, title: 'בסיס' },
    wikiTitles: { בסיס: { status: 'found' } },
  }),
  s('source-revision-deleted', 'גרסה שנמחקה ונפילה לפריט', {
    local: { wikitext: wt({ דף: 'בסיס', גרסה: '101', פריט: 'Q1' }) },
    revision: { id: 101, deleted: true },
    wikidata: { title: 'בסיס' },
    wikiTitles: { בסיס: { status: 'found' } },
  }),
  s('source-revision-failure-wikidata', 'כשל גרסה ונפילה לפריט', {
    local: { wikitext: wt({ דף: 'בסיס', גרסה: '101', פריט: 'Q1' }) },
    wikidata: { title: 'בסיס' },
    wikiTitles: { בסיס: { status: 'found' } },
    failures: { 'wp:revision': { type: 'api', code: 'bad-revision-test' } },
  }),
  s('source-both-failure-title', 'כשל גרסה ופריט ונפילה לכותרת', {
    local: { wikitext: wt({ דף: 'בסיס', גרסה: '101', פריט: 'Q1' }) },
    wikiTitles: { בסיס: { status: 'found' } },
    failures: {
      'wp:revision': { type: 'api', code: 'bad-revision-test' },
      'wikidata:Q1': { type: 'http', status: 404 },
    },
  }),

  s('baseline-same', 'כותרת זהה לשדה דף', {
    local: { wikitext: wt({ דף: 'בסיס' }) },
    wikiTitles: { בסיס: { status: 'found' } },
  }),
  s('baseline-different', 'כותרת שונה משדה דף', {
    local: { wikitext: wt({ דף: 'ישן', גרסה: '101' }) },
    revision: { id: 101, title: 'חדש' },
    wikiTitles: { חדש: { status: 'found' } },
  }),
  s('baseline-redirect-to-baseline', 'הפניה ליעד הבסיס', {
    local: { wikitext: wt({ דף: 'חדש', גרסה: '101' }) },
    revision: { id: 101, title: 'ישן' },
    wikiTitles: {
      ישן: { status: 'redirect', target: 'חדש' },
      חדש: { status: 'found' },
    },
  }),
  s('baseline-disambig-renamed', 'פירושונים שהועבר', {
    local: { wikitext: wt({ דף: 'ישן', גרסה: '101' }) },
    revision: { id: 101, title: 'חדש' },
    wikiTitles: { חדש: { status: 'disambiguation' } },
  }),

  s('chain-redirect', 'הפניה', {
    local: { wikitext: wt({}) },
    wikiTitles: { מקומי: { status: 'redirect', target: 'יעד', fragment: 'פסקה' } },
  }),
  s('chain-too-long', 'שרשרת ארוכה מדי', {
    local: { wikitext: wt({}) },
    wikiTitles: {
      מקומי: { status: 'missing' }, T1: { status: 'missing' }, T2: { status: 'missing' },
      T3: { status: 'missing' }, T4: { status: 'missing' }, T5: { status: 'missing' },
    },
    logs: {
      מקומי: { move: [move('T1')] }, T1: { move: [move('T2')] }, T2: { move: [move('T3')] },
      T3: { move: [move('T4')] }, T4: { move: [move('T5')] }, T5: { move: [move('T6')] },
    },
  }),
  s('chain-cycle', 'מעגל', {
    local: { wikitext: wt({}) },
    wikiTitles: { מקומי: { status: 'missing' }, B: { status: 'missing' } },
    logs: { מקומי: { move: [move('B')] }, B: { move: [move('מקומי')] } },
  }),

  s('log-move', 'יומן העברה', {
    local: { wikitext: wt({}) },
    wikiTitles: { מקומי: { status: 'missing' }, חדש: { status: 'found' } },
    logs: { מקומי: { move: [move('חדש')] } },
  }),
  s('log-delete', 'יומן מחיקה', {
    local: { wikitext: wt({}) },
    wikiTitles: { מקומי: { status: 'missing' } },
    logs: { מקומי: { delete: [del()] } },
  }),
  s('log-other-namespace', 'העברה למרחב אחר', {
    local: { wikitext: wt({}) },
    wikiTitles: { מקומי: { status: 'missing' } },
    logs: { מקומי: { move: [move('שיחה:מקומי', '2026-02-01T00:00:00Z', 1)] } },
  }),
  s('log-older-evidence', 'לא ידוע עם ראיה ישנה', {
    local: { wikitext: wt({}), creationTs: '2026-01-01T00:00:00Z' },
    wikiTitles: { מקומי: { status: 'missing' } },
    logs: { מקומי: { move: [move('ישן', '2025-01-01T00:00:00Z')] } },
  }),
  s('log-floor-rejected', 'דחיית הכרעה בלי גבול זמן', {
    local: { wikitext: wt({}) },
    wikiTitles: { מקומי: { status: 'missing' } },
    logs: { מקומי: { move: [move('חדש')] } },
    failures: { 'local:creation': { type: 'api', code: 'creation-failed' } },
  }),

  s('state-same-redirect', 'אותו יעד ואותה פסקה', {
    local: {
      wikitext: wt({}), redirect: true,
      redirectTarget: { title: 'יעד', fragment: 'פסקה' },
    },
    wikiTitles: { מקומי: { status: 'redirect', target: 'יעד', fragment: 'פסקה' } },
  }),
  s('state-different-fragment', 'אותו יעד ופסקאות שונות', {
    local: {
      wikitext: wt({}), redirect: true,
      redirectTarget: { title: 'יעד', fragment: 'א' },
    },
    wikiTitles: { מקומי: { status: 'redirect', target: 'יעד', fragment: 'ב' } },
  }),
  s('state-disambig-match', 'פירושונים מול פירושונים', {
    local: { wikitext: wt({}), disambiguation: true },
    wikiTitles: { מקומי: { status: 'disambiguation' } },
  }),
  s('state-warning-overrides-match', 'אזהרה גוברת על התאמה', {
    local: {
      wikitext: wt({ גרסה: '101' }), redirect: true,
      redirectTarget: { title: 'יעד', fragment: null },
    },
    wikiTitles: { מקומי: { status: 'redirect', target: 'יעד' } },
    failures: { 'wp:revision': { type: 'api', code: 'revision-failed' } },
  }),

  s('local-missing', 'דף מקומי חסר', {
    local: { missing: true, wikitext: wt({}) },
  }),
  s('subcheck-unchecked', 'בדיקת יעד משנית לא הושלמה', {
    local: { wikitext: wt({ דף: 'חדש', גרסה: '101' }) },
    revision: { id: 101, title: 'ישן' },
    wikiTitles: { ישן: { status: 'redirect', target: 'חדש' } },
    failures: { 'wp:title:חדש': { type: 'api', code: 'target-check-failed' } },
  }),

  s('error-transient-retry', 'כשל רגעי עם ניסיון חוזר', {
    local: { wikitext: wt({ דף: 'בסיס', גרסה: '101' }) },
    revision: { id: 101, title: 'בסיס' },
    wikiTitles: { בסיס: { status: 'found' } },
    failures: { 'wp:revision': [{ type: 'http', status: 503 }, null] },
  }),
  s('error-permanent', 'כשל קבוע', {
    local: { wikitext: wt({}) },
    failures: { 'wp:title:מקומי': { type: 'api', code: 'permanent-test' } },
  }),
  s('error-silent', 'כשל שקט', {
    local: { wikitext: wt({}) },
    failures: { 'local:page': { type: 'abort' } },
  }),
];


const expectations = {
  'source-revision-valid': { terminal: 'success', delivery: 'render', status: 'found', sourceFailures: [] },
  'source-revision-deleted': { terminal: 'success', delivery: 'render', status: 'found', revidDeletedNotice: true },
  'source-revision-failure-wikidata': { terminal: 'success', delivery: 'render', status: 'found', sourceFailures: ['failureSourceRevision'] },
  'source-both-failure-title': { terminal: 'success', delivery: 'render', status: 'found', sourceFailures: ['failureSourceRevision', 'failureSourceWikidata'] },
  'baseline-same': { terminal: 'success', delivery: 'render', status: 'found' },
  'baseline-different': { terminal: 'success', delivery: 'render', status: 'renamed', from: 'ישן', title: 'חדש' },
  'baseline-redirect-to-baseline': { terminal: 'success', delivery: 'render', status: 'already_synced', resolvedStatus: 'found' },
  'baseline-disambig-renamed': { terminal: 'success', delivery: 'render', status: 'renamed', targetIsDisambig: true },
  'chain-redirect': { terminal: 'success', delivery: 'render', status: 'redirect', target: 'יעד', targetFragment: 'פסקה' },
  'chain-too-long': { terminal: 'success', delivery: 'render', status: 'chain_too_long' },
  'chain-cycle': { terminal: 'success', delivery: 'render', status: 'cycle_detected' },
  'log-move': { terminal: 'success', delivery: 'render', status: 'renamed', via: 'יומן' },
  'log-delete': { terminal: 'success', delivery: 'render', status: 'deleted', via: 'יומן' },
  'log-other-namespace': { terminal: 'success', delivery: 'render', status: 'moved_to_other_namespace', via: 'יומן' },
  'log-older-evidence': { terminal: 'success', delivery: 'render', status: 'unknown', olderLogEvidenceMin: 1 },
  'log-floor-rejected': { terminal: 'failure', delivery: 'failure', errorKind: 'log-floor' },
  'state-same-redirect': { terminal: 'success', delivery: 'suppressed', status: 'redirect', localStateMatched: true },
  'state-different-fragment': { terminal: 'success', delivery: 'render', status: 'redirect', localStateMatched: false },
  'state-disambig-match': { terminal: 'success', delivery: 'suppressed', status: 'disambiguation', localStateMatched: true },
  'state-warning-overrides-match': { terminal: 'success', delivery: 'render', status: 'redirect', resultLocalStateMatched: true, sourceFailures: ['failureSourceRevision'] },
  'local-missing': { terminal: 'failure', delivery: 'failure', errorKind: 'structure' },
  'subcheck-unchecked': { terminal: 'success', delivery: 'render', status: 'already_synced', resolvedStatus: 'unchecked', baselineTargetFailureKind: 'api' },
  'error-transient-retry': { terminal: 'success', delivery: 'render', status: 'found', stageCallCount: { revision: 2 } },
  'error-permanent': { terminal: 'failure', delivery: 'failure', errorKind: 'api' },
  'error-silent': { terminal: 'silent', delivery: 'silent', errorKind: 'aborted' },
};

for (const scenario of scenarios) scenario.expect = expectations[scenario.id];

module.exports = scenarios;
