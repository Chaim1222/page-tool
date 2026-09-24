'use strict';

// דף שהוא הפניה במכלול, והפניות אל דף שעוברת עליו פעולה.
//
// המפרט (מתוך ההחלטות שתועדו ב־REDIRECTS.md):
// - השאלה המכריעה: האם ההפניה המקומית מביאה את הקורא לערך.
// - תקינה: אותו יעד כמו בוויקיפדיה = שקט; אחרת שיקוף בלבד, בלי פעולה.
// - שבורה (יעד חסר, או יעד שהוא הפניה): יעד מוצע לפי הסדר — שרשרת ההפניות
//   במכלול, יומן ההעברות של המכלול, ורק אז ויקיפדיה. פעולה יחידה: עדכון יעד.
// - בשום מצב של דף הפניה: אין העברה, מחיקה, בקשת העברה, הפיכה להפניה או
//   מחוון גודל.
// - עדכון יעד מחליף רק את יעד הקישור בשורת ההפניה, ושומר את כל השאר.

const { levelA } = require('./matrix');
const { PAGE } = require('../fixtures/results');

const CATEGORY = '[[קטגוריה:בדיקה]]';

function redirectPage(target, fragment) {
  return { content: `#הפניה[[${target}${fragment ? '#' + fragment : ''}]]\n${CATEGORY}` };
}

const WP = {
  redirect: (target, fragment) => ({
    status: 'redirect',
    title: PAGE,
    target,
    targetFragment: fragment || null,
    depth: 0,
    moveLog: [],
  }),
  renamed: (title) => ({ status: 'renamed', title, from: PAGE, moveLog: [], via: 'כותרת' }),
  found: () => ({
    status: 'found',
    title: PAGE,
    page: { revisions: [{ size: 5000, revid: 9 }], langlinks: [] },
    via: 'כותרת',
  }),
  deleted: () => ({ status: 'deleted', title: PAGE, moveLog: [] }),
};

// דף הפניה: הכותרת בוויקיפדיה מוזרקת, והדפים המקומיים מוגדרים בוויקי המדומה.
function redirectScenario(id, title, o) {
  return {
    level: 'A',
    id: `R-${id}`,
    title: `דף הפניה: ${title}`,
    group: 'דפי הפניה',
    profile: o.profile || 'מפעיל',
    fixture: { result: o.result, ownFields: {}, localStateMatched: false },
    localPages: o.localPages,
    net: o.net || {},
    confirms: o.confirms,
    start: { allow: o.allow, check: o.start },
    steps: o.steps || [],
  };
}

// הכלל המחייב בכל תרחיש של דף הפניה.
function noArticleActions(c) {
  const forbidden = [
    c.STR.btnMove,
    c.STR.btnMoveWithRedirect,
    c.STR.btnMoveNoRedirect,
    c.STR.btnRequestMove,
    c.STR.btnMakeRedirect,
    c.STR.btnDelete,
    c.STR.btnRequestDelete,
  ];
  const probe = c.STR.btnDeleteAndMove('\u0000').split('\u0000');
  for (const label of c.labels()) {
    c.ok(forbidden.indexOf(label) === -1, `פעולה אסורה בדף הפניה: ${label}`);
    c.ok(!(label.startsWith(probe[0]) && label.endsWith(probe[1])), `מחיקה והעברה בדף הפניה: ${label}`);
  }
  c.ok(!c.exists('.mw-indicators .hmk-size-wrap'), 'אין מחוון גודל בדף הפניה');
  c.ok(!c.exists('.mw-indicators .hmk-update-toggle'), 'אין "מאז הייבוא" בדף הפניה');
}

function build() {
  const out = [];

  // ---- תקינה ----
  out.push(
    redirectScenario('renamed-same-target', 'הערך הועבר בוויקיפדיה, וההפניה כבר מובילה לשם החדש: סימן ירוק', {
      result: WP.renamed('יעד'),
      localPages: { [PAGE]: redirectPage('יעד'), 'יעד': { body: 'ערך.' } },
      start(c) {
        c.ok(!c.card(), 'אין כרטיס');
        c.eq(c.text('.mw-indicators .hmk-diff'), '✓ ההפניה תואמת לוויקיפדיה', 'סימן התאמה');
        noArticleActions(c);
      },
    }),
    redirectScenario('healthy-different-target', 'הפניה תקינה ליעד אחר מזה שבוויקיפדיה: שיקוף בלבד', {
      result: WP.redirect('אחר'),
      localPages: { [PAGE]: redirectPage('יעד'), 'יעד': { body: 'ערך.' }, 'אחר': { body: 'ערך אחר.' } },
      start(c) {
        c.eq(c.title(), c.STR.lrDifferentTitle, 'כותרת');
        c.eq(c.cardType(), 'notice', 'סוג הכרטיס');
        c.eq(c.text('#hmk-tool .hmk-text > div:nth-child(1)'), c.STR.lrLocalLine('יעד'), 'שורת המכלול');
        c.eq(c.text('#hmk-tool .hmk-text > div:nth-child(2)'), c.STR.lrWikiLine(c.STR.lrWikiRedirect('אחר')), 'שורת ויקיפדיה');
        c.eq(c.labels(), [], 'אין פעולות');
        noArticleActions(c);
      },
    }),
    redirectScenario('healthy-wp-article', 'בוויקיפדיה ערך בשם הזה, ובמכלול הפניה תקינה: שיקוף בלבד', {
      result: WP.found(),
      localPages: { [PAGE]: redirectPage('יעד'), 'יעד': { body: 'ערך.' } },
      start(c) {
        c.eq(c.title(), c.STR.lrDifferentTitle, 'כותרת');
        c.ok(c.body().indexOf(c.STR.lrWikiArticle) !== -1, 'השיקוף אומר שבוויקיפדיה זה ערך');
        c.eq(c.labels(), [], 'אין פעולות');
        noArticleActions(c);
      },
    }),
    redirectScenario('healthy-wp-deleted', 'הדף נמחק בוויקיפדיה, ובמכלול הפניה תקינה: שיקוף בלי פעולות מחיקה', {
      result: WP.deleted(),
      localPages: { [PAGE]: redirectPage('יעד'), 'יעד': { body: 'ערך.' } },
      start(c) {
        c.eq(c.title(), c.STR.lrDifferentTitle, 'כותרת');
        c.ok(c.body().indexOf(c.STR.lrWikiDeleted) !== -1, 'השיקוף אומר שהדף נמחק');
        c.eq(c.labels(), [], 'אין פעולות');
        noArticleActions(c);
      },
    })
  );

  // ---- שבורה: הסדר ----
  out.push(
    redirectScenario('broken-by-wikipedia', 'יעד חסר, לא הועבר במכלול, ויעד ויקיפדיה קיים: עדכון לפי ויקיפדיה', {
      result: WP.redirect('בעיות', 'פסקה'),
      localPages: { [PAGE]: redirectPage('בעיה'), 'בעיות': { body: 'ערך.' } },
      start(c) {
        c.eq(c.title(), c.STR.lrBrokenTitle, 'כותרת');
        c.eq(c.cardType(), 'warning', 'סוג הכרטיס');
        c.ok(c.body().indexOf(c.STR.lrLocalMissing) !== -1, 'השיקוף אומר שהיעד המקומי חסר');
        c.eq(c.text('#hmk-tool .hmk-carddecision'), `${c.STR.lrProposedLead} בעיות#פסקה — ${c.STR.lrReasonWikipedia}`, 'היעד המוצע');
        c.eq(c.labels(), [c.STR.btnRetargetRedirect], 'פעולה יחידה: עדכון יעד');
        noArticleActions(c);
      },
      steps: [
        {
          do: 'click',
          label: { str: 'btnRetargetRedirect' },
          name: 'עדכון-יעד',
          check(c) {
            c.eq(c.env.log.confirms, [c.STR.retargetConfirm('בעיה', 'בעיות#פסקה')], 'חלון האישור');
            const w = c.writes()[0] || {};
            c.eq(w.api, 'edit', 'עריכה דרך עוזר העריכה');
            c.eq(w.title, PAGE, 'הדף שנערך');
            c.eq(w.params && w.params.text, `#הפניה[[בעיות#פסקה]]\n${CATEGORY}`, 'רק יעד הקישור הוחלף, והקטגוריה נשמרה');
            c.eq(w.params && w.params.summary, c.STR.retargetSummary('בעיות'), 'תקציר העריכה');
            c.eq(c.title(), c.STR.retargetDoneTitle, 'כרטיס הצלחה');
          },
        },
      ],
    }),
    redirectScenario('broken-cancel', 'עדכון יעד בוטל בחלון האישור: אין כתיבה', {
      result: WP.redirect('בעיות'),
      localPages: { [PAGE]: redirectPage('בעיה'), 'בעיות': { body: 'ערך.' } },
      confirms: [false],
      start(c) {
        c.eq(c.labels(), [c.STR.btnRetargetRedirect], 'פעולה יחידה');
      },
      steps: [
        {
          do: 'click',
          label: { str: 'btnRetargetRedirect' },
          name: 'ביטול',
          check(c) {
            c.eq(c.writes(), [], 'אין כתיבה');
            c.eq(c.title(), c.STR.lrBrokenTitle, 'הכרטיס נשאר');
          },
        },
      ],
    }),
    redirectScenario('broken-moved-locally', 'היעד הועבר במכלול: יומן ההעברות קודם לוויקיפדיה', {
      result: WP.redirect('אחר'),
      localPages: {
        [PAGE]: redirectPage('בעיה'),
        'בעיות במכלול': { body: 'ערך.' },
        'אחר': { body: 'ערך אחר.' },
      },
      net: {
        localLogs: { 'בעיה': { move: [{ params: { target_title: 'בעיות במכלול' }, timestamp: '2026-09-01T00:00:00Z' }] } },
      },
      start(c) {
        c.eq(c.title(), c.STR.lrBrokenTitle, 'כותרת');
        c.eq(
          c.text('#hmk-tool .hmk-carddecision'),
          `${c.STR.lrProposedLead} בעיות במכלול — ${c.STR.lrReasonMoved('בעיה')}`,
          'היעד המוצע הוא לאן שהועבר במכלול, ולא יעד ויקיפדיה'
        );
        c.eq(c.labels(), [c.STR.btnRetargetRedirect], 'פעולה יחידה');
        noArticleActions(c);
      },
    }),
    redirectScenario('double-redirect', 'היעד המקומי הוא בעצמו הפניה: עדכון אל היעד הסופי של השרשרת', {
      result: WP.redirect('אחר'),
      localPages: {
        [PAGE]: redirectPage('ביניים'),
        'ביניים': { redirectTo: 'סופי' },
        'סופי': { body: 'ערך.' },
        'אחר': { body: 'ערך אחר.' },
      },
      start(c) {
        c.eq(c.title(), c.STR.lrBrokenTitle, 'כותרת');
        c.ok(c.body().indexOf(c.STR.lrLocalIsRedirect) !== -1, 'השיקוף אומר שהיעד הוא הפניה');
        c.eq(c.text('#hmk-tool .hmk-carddecision'), `${c.STR.lrProposedLead} סופי — ${c.STR.lrReasonChain}`, 'היעד המוצע');
        c.eq(c.labels(), [c.STR.btnRetargetRedirect], 'פעולה יחידה');
        noArticleActions(c);
      },
    }),
    redirectScenario('broken-no-destination', 'יעד חסר, לא הועבר, ויעד ויקיפדיה לא קיים במכלול: שיקוף בלבד', {
      result: WP.redirect('חסר'),
      localPages: { [PAGE]: redirectPage('בעיה') },
      start(c) {
        c.eq(c.title(), c.STR.lrBrokenTitle, 'כותרת');
        c.eq(c.text('#hmk-tool .hmk-carddecision'), c.STR.lrNoDestination, 'אין יעד');
        c.eq(c.labels(), [], 'אין פעולות');
        noArticleActions(c);
      },
    }),
    redirectScenario('broken-log-failure', 'כשל ביומן ההעברות: כרטיס כשל, ולא מדלגים לוויקיפדיה', {
      result: WP.redirect('בעיות'),
      localPages: { [PAGE]: redirectPage('בעיה'), 'בעיות': { body: 'ערך.' } },
      net: { faults: { 'local-log:בעיה:move': { type: 'api', code: 'log-failed' } } },
      allow: { consoleErrors: 1 },
      start(c) {
        c.eq(c.title(), c.STR.checkFailedTitle, 'כרטיס כשל');
        c.eq(c.labels(), [c.STR.btnRetry], 'ניסיון חוזר בלבד');
        c.eq(c.writes(), [], 'אין כתיבה');
      },
    })
  );

  // ---- הפניות אל דף שמועבר ----
  out.push(
    levelA('renamed', {
      id: 'R-move-then-fix-redirects',
      title: 'העברה בלי הפניה: אזהרה על הפניה שתישבר, ובכרטיס ההצלחה השוואה ועדכון שלה',
      group: 'דפי הפניה',
      profile: 'מפעיל',
      net: {
        wp: { 'ישן': { missing: true } },
        backlinks: { [PAGE]: { redirects: ['כינוי ג'] } },
      },
      localPages: { 'כינוי ג': { content: `#הפניה[[${PAGE}]]\n${CATEGORY}` } },
      start: {
        check(c) {
          c.ok(c.warnings().indexOf(c.STR.redirectsWillBreak(1, false, 'fix')) !== -1, 'שורת האזהרה על ההפניה');
        },
      },
      steps: [
        {
          do: 'click',
          label: { str: 'btnMoveNoRedirect' },
          name: 'העברה',
          check(c) {
            c.eq(c.title(), c.STR.moveCompletedTitle, 'כרטיס הצלחה');
            c.eq(c.count('#hmk-tool .hmk-redirect-fix'), 1, 'שורה אחת להפניה');
            c.eq(c.text('#hmk-tool .hmk-redirect-fix a'), 'כינוי ג', 'ההפניה ברשימה');
          },
        },
        {
          do: 'click',
          selector: '#hmk-tool .hmk-redirect-fix button',
          label: { str: 'btnCompareWikipedia' },
          name: 'השוואה',
          check(c) {
            c.eq(c.reads('wp-redirect').length, 1, 'שאילתה אחת לוויקיפדיה');
            c.eq(c.text('#hmk-tool .hmk-redirect-fix-status'), c.STR.wpStateArticle, 'מצב הכותרת בוויקיפדיה');
          },
        },
        {
          do: 'click',
          selector: '#hmk-tool .hmk-redirect-fix button',
          label: { str: 'btnRetargetTo', args: ['חדש'] },
          name: 'עדכון-ההפניה',
          check(c) {
            const w = c.writes()[0] || {};
            c.eq(w.title, 'כינוי ג', 'הדף שנערך');
            c.eq(w.params && w.params.text, `#הפניה[[חדש]]\n${CATEGORY}`, 'רק יעד הקישור הוחלף');
            c.eq(c.text('#hmk-tool .hmk-redirect-fix-status'), c.STR.retargetRowDone, 'סטטוס השורה');
          },
        },
      ],
    })
  );

  // ---- יעד העברה שהוא הפניה במכלול ----
  out.push(
    levelA('renamed', {
      id: 'R-move-over-redirect-to-current',
      title: 'היעד הוא הפניה אל הדף הנוכחי: ההעברה בלי הפניה דורסת אותה, והיא לא נספרת ולא מוצעת לעדכון',
      group: 'דפי הפניה',
      profile: 'מפעיל',
      net: {
        wp: { 'ישן': { missing: true } },
        backlinks: { [PAGE]: { redirects: ['חדש', 'כינוי ג'] } },
      },
      localPages: {
        'חדש': { content: `#הפניה[[${PAGE}]]` },
        'כינוי ג': { content: `#הפניה[[${PAGE}]]\n${CATEGORY}` },
      },
      start: {
        check(c) {
          c.eq(c.labels()[0], c.STR.btnMoveNoRedirect, 'ההעברה מוצעת כרגיל');
          c.ok(c.warnings().indexOf(c.STR.redirectsWillBreak(1, false, 'fix')) !== -1, 'האזהרה סופרת רק את ההפניה שתישבר');
        },
      },
      steps: [
        {
          do: 'click',
          label: { str: 'btnMoveNoRedirect' },
          name: 'העברה',
          check(c) {
            c.eq(c.title(), c.STR.moveCompletedTitle, 'כרטיס הצלחה');
            c.eq(c.count('#hmk-tool .hmk-redirect-fix'), 1, 'רק ההפניה שנשברה ברשימה');
            c.eq(c.text('#hmk-tool .hmk-redirect-fix a'), 'כינוי ג', 'היעד החדש אינו מוצג כהפניה');
          },
        },
      ],
    }),
    levelA('renamed', {
      id: 'R-move-with-redirect-no-fixes',
      title: 'העברה עם הפניה: ההפניות הופכות לכפולות, ואין תיבת עדכון בכרטיס ההצלחה',
      group: 'דפי הפניה',
      profile: 'מפעיל',
      net: {
        wp: { 'ישן': { redirectTo: 'חדש' } },
        backlinks: { [PAGE]: { redirects: ['כינוי ג'] } },
      },
      localPages: { 'כינוי ג': { content: `#הפניה[[${PAGE}]]\n${CATEGORY}` } },
      start: {
        check(c) {
          c.ok(c.warnings().indexOf(c.STR.redirectsWillBreak(1, false, 'double')) !== -1, 'שורת האזהרה על הפניות כפולות');
        },
      },
      steps: [
        {
          do: 'click',
          label: { str: 'btnMoveWithRedirect' },
          name: 'העברה',
          check(c) {
            c.eq(c.title(), c.STR.moveCompletedTitle, 'כרטיס הצלחה');
            c.eq(c.count('#hmk-tool .hmk-redirect-fix'), 0, 'אין תיבת עדכון הפניות');
          },
        },
      ],
    }),
    levelA('renamed', {
      id: 'L-link-fixes-bot-group',
      title: 'העברה בלי הפניה עם קישורים ישירים, משתמש בקבוצה bot: אזהרה עם הפניה לכרטיס, ותיבת תיקון קישורים',
      group: 'דפי הפניה',
      profile: 'מפעיל',
      userGroups: ['bot'],
      net: {
        wp: { 'ישן': { missing: true } },
        backlinks: { [PAGE]: { direct: ['דף א', 'דף ב'] } },
      },
      start: {
        check(c) {
          c.ok(c.warnings().indexOf(c.STR.directLinksWillBreak(2, false, true)) !== -1, 'אזהרה שמזכירה את כרטיס ההצלחה');
        },
      },
      steps: [
        {
          do: 'click',
          label: { str: 'btnMoveNoRedirect' },
          name: 'העברה',
          check(c) {
            c.eq(c.title(), c.STR.moveCompletedTitle, 'כרטיס הצלחה');
            c.eq(c.count('#hmk-tool .hmk-link-fixes'), 1, 'תיבת תיקון קישורים');
            c.eq(c.text('#hmk-tool .hmk-link-fixes button'), c.STR.btnFixLinks(2), 'הכפתור עם מספר הדפים');
          },
        },
      ],
    }),
    levelA('renamed', {
      id: 'L-link-fixes-opens-window',
      title: 'לחיצה על "תיקון קישורים" בכרטיס ההצלחה פותחת את החלון עם הדפים הנכונים, מהשם הישן אל החדש',
      group: 'דפי הפניה',
      profile: 'מפעיל',
      userGroups: ['bot'],
      net: {
        wp: { 'ישן': { missing: true } },
        backlinks: { [PAGE]: { direct: ['דף א', 'דף ב'] } },
      },
      localPages: {
        'דף א': { content: `טקסט עם [[${PAGE}]].` },
        'דף ב': { content: `עוד [[${PAGE}|קישור]].` },
      },
      steps: [
        { do: 'click', label: { str: 'btnMoveNoRedirect' }, name: 'העברה' },
        {
          do: 'press',
          selector: '#hmk-tool .hmk-link-fixes button',
          name: 'פתיחת-החלון',
          check(c) {
            const doc = c.doc;
            c.eq(doc.querySelectorAll('.hmk-lf').length, 1, 'החלון נפתח');
            c.eq(c.text('#hmk-lf-title'), c.STR.linksWindowTitle('חדש'), 'אל השם החדש');
            c.eq(c.text('.hmk-lf-head .hmk-lf-muted'), c.STR.linksPageCounter(1, 2), 'שני דפים ברשימה');
            c.eq(c.text('.hmk-lf-head a:not(.hmk-lf-muted)'), 'דף א', 'הדף הראשון ברשימה');
            c.eq(doc.querySelector('.hmk-lf-source').value, `טקסט עם [[${PAGE}]].`, 'תוכן הדף נטען');
            c.eq(c.text('.hmk-lf-counter'), c.STR.linksOccCounter(1, 1), 'הקישור אל השם הישן זוהה');
          },
        },
      ],
    }),
    levelA('renamed', {
      id: 'L-link-fixes-hidden-for-non-bot',
      title: 'אותו מקרה, משתמש שאינו בקבוצה bot: אזהרה בלי הפניה לכרטיס, ובלי תיבת תיקון',
      group: 'דפי הפניה',
      profile: 'מפעיל',
      net: {
        wp: { 'ישן': { missing: true } },
        backlinks: { [PAGE]: { direct: ['דף א', 'דף ב'] } },
      },
      start: {
        check(c) {
          c.ok(c.warnings().indexOf(c.STR.directLinksWillBreak(2, false, false)) !== -1, 'אזהרה בלי הפניה לכרטיס');
        },
      },
      steps: [
        {
          do: 'click',
          label: { str: 'btnMoveNoRedirect' },
          name: 'העברה',
          check(c) {
            c.eq(c.title(), c.STR.moveCompletedTitle, 'כרטיס הצלחה');
            c.eq(c.count('#hmk-tool .hmk-link-fixes'), 0, 'אין תיבת תיקון קישורים');
          },
        },
      ],
    }),
    levelA('renamed', {
      id: 'L-templates-shown-as-fact',
      title: 'קישורים גם ממרחב התבניות, בשאילתה נפרדת: בסיכום, באזהרה, ובכרטיס ההצלחה כקישורים לעדכון בדף התבנית',
      group: 'דפי הפניה',
      profile: 'מפעיל',
      userGroups: ['bot'],
      net: {
        wp: { 'ישן': { missing: true } },
        backlinks: { [PAGE]: { direct: ['דף א', 'דף ב'], templates: ['תבנית:ניווט'] } },
      },
      start: {
        check(c) {
          const w = c.warnings();
          c.ok(
            w.indexOf(`${c.STR.backlinksLabel}: ${c.STR.backlinksSummary(2, 0, false, false, 1, false)}`) !== -1,
            'שורת הסיכום כוללת את התבנית'
          );
          c.ok(w.indexOf(c.STR.directLinksWillBreak(2, false, true, 1, false)) !== -1, 'האזהרה מזכירה את התבנית');
        },
      },
      steps: [
        {
          do: 'click',
          label: { str: 'btnMoveNoRedirect' },
          name: 'העברה',
          check(c) {
            c.eq(c.title(), c.STR.moveCompletedTitle, 'כרטיס הצלחה');
            c.eq(c.text('#hmk-tool .hmk-link-fixes-templates a'), 'תבנית:ניווט', 'קישור לתבנית');
            c.eq(c.text('#hmk-tool .hmk-link-fixes button'), c.STR.btnFixLinks(2), 'החלון רק לדפי הערכים');
            c.eq(c.count('#hmk-tool .hmk-link-fixes .hmk-redirect-fixes-more'), 0, 'אין הערת "יש עוד" כשאין');
          },
        },
      ],
    }),
    levelA('renamed', {
      id: 'L-templates-only',
      title: 'רק תבניות מקשרות, ויש עוד: אזהרה וסיכום עם סימן "יש עוד" לתבניות בלבד, ובכרטיס ההצלחה קישור והערה על תבניות נוספות, בלי כפתור חלון',
      group: 'דפי הפניה',
      profile: 'מפעיל',
      userGroups: ['bot'],
      net: {
        wp: { 'ישן': { missing: true } },
        backlinks: { [PAGE]: { templates: ['תבנית:ניווט'], templateMore: true } },
      },
      start: {
        check(c) {
          const w = c.warnings();
          c.ok(
            w.indexOf(`${c.STR.backlinksLabel}: ${c.STR.backlinksSummary(0, 0, false, false, 1, true)}`) !== -1,
            'סימן "יש עוד" רק לתבניות'
          );
          c.ok(w.indexOf(c.STR.directLinksWillBreak(0, false, true, 1, true)) !== -1, 'אזהרה על התבניות בלבד');
        },
      },
      steps: [
        {
          do: 'click',
          label: { str: 'btnMoveNoRedirect' },
          name: 'העברה',
          check(c) {
            c.eq(c.count('#hmk-tool .hmk-link-fixes-templates a'), 1, 'קישור לתבנית');
            c.eq(c.text('#hmk-tool .hmk-link-fixes .hmk-redirect-fixes-more'), c.STR.linkFixesTemplatesMore, 'הערה על תבניות נוספות');
            c.eq(c.count('#hmk-tool .hmk-link-fixes button'), 0, 'אין כפתור חלון');
          },
        },
      ],
    }),
    levelA('renamed', {
      id: 'R-move-target-redirect-elsewhere',
      title: 'היעד הוא הפניה אל דף אחר: בדיקה ידנית, שיקוף ובקשת העברה בלבד',
      group: 'דפי הפניה',
      profile: 'מפעיל',
      net: { wp: { 'ישן': { redirectTo: 'חדש' } } },
      localPages: {
        'חדש': { content: '#הפניה[[אחר]]' },
        'אחר': { body: 'ערך אחר.' },
      },
      start: {
        check(c) {
          c.eq(c.labels(), [c.STR.btnRequestMove], 'בקשת העברה בלבד, בלי מחיקה והעברה');
          c.eq(
            c.text('#hmk-tool .hmk-carddecision'),
            `${c.STR.decisionLeadManual} — ${c.STR.targetRedirectElsewhereReason('אחר')}`,
            'הנימוק'
          );
          c.eq(c.writes(), [], 'אין כתיבה');
        },
      },
    })
  );

  return out;
}

module.exports = { build };
