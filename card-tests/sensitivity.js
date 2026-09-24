#!/usr/bin/env node
'use strict';

// מבחני רגישות. כל מבחן מעתיק את שבעת קבצי הייצור לתיקייה זמנית,
// (קובץ "מאז הייבוא" אינו חלק מסביבת הכרטיסים ולכן אינו מועתק),
// שובר בה במכוון התנהגות מתועדת אחת, ומריץ עליה את כל הסוויטה.
// הקבצים המקוריים אינם נוגעים בשום שלב.
//
// לכל שבירה מוגדרת רמת התפיסה הצפויה:
//   כוונה      — לפחות בדיקת כוונה אחת חייבת להיכשל (לא רק תמונת ייחוס);
//   ייחוס      — שינוי שאינו שגוי מהותית, ורק תמונת הייחוס אמורה לתפוס;
//   לא-נתפס    — מחוץ לגבולות הסוויטה, ומתועד ככזה במפורש.
// המבחן נכשל אם שבירה נתפסה ברמה שונה מהצפוי.

process.env.TZ = 'Asia/Jerusalem';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadContract } = require('./lib/contract');
const { runScenario } = require('./lib/runner');
const { PRODUCTION_FILES } = require('./lib/env');
const suite = require('./lib/suite');

const MUTATIONS = [
  {
    id: 'preview-drops-fragment',
    title: 'התצוגה המקדימה מעדכנת את הקישור בלי הפסקה',
    file: 'preview',
    find: 'applyLocalLinkStatus($link, title, data.status, linkDestination);',
    replace: 'applyLocalLinkStatus($link, title, data.status);',
    expect: 'כוונה',
  },
  {
    id: 'deleted-not-permission-sensitive',
    title: 'כרטיס "נמחק" אינו מציג אזהרת כשל הרשאות',
    file: 'card',
    find: 'body: STR.deletedLoading,\n        permissionSensitive: true,',
    replace: 'body: STR.deletedLoading,',
    expect: 'כוונה',
  },
  {
    id: 'permission-warning-everywhere',
    title: 'אזהרת כשל הרשאות מוצגת בכל כרטיס, גם בכרטיסי מידע',
    file: 'card',
    find: '!!opts.permissionSensitive',
    replace: 'true',
    expect: 'כוונה',
  },
  {
    id: 'revid-notice-duplicated',
    title: 'הודעת הגרסה שנמחקה מוצגת פעמיים בכרטיס',
    file: 'card',
    find: 'warningSkip: { revidDeletedNotice: true },',
    replace: 'warningSkip: {},',
    expect: 'כוונה',
  },
  {
    id: 'details-retry-locked',
    title: 'אחרי כשל בטעינת הפרטים אין ניסיון חוזר',
    file: 'card',
    find: 'built = false;\n            console.error(error);',
    replace: 'console.error(error);',
    expect: 'כוונה',
  },
  {
    id: 'details-error-swallowed',
    title: 'שגיאת טעינת הפרטים אינה נרשמת במסוף',
    file: 'card',
    find: 'built = false;\n            console.error(error);',
    replace: 'built = false;',
    expect: 'כוונה',
  },
  {
    id: 'details-eager-load',
    title: 'מודול הפרטים נטען מיד עם הכרטיס ולא בלחיצה',
    file: 'card',
    find: 'var built = false;\n      $arrow.on("click", function () {',
    replace: 'var built = false;\n      loadDetailsFeature();\n      $arrow.on("click", function () {',
    expect: 'כוונה',
  },
  {
    id: 'delete-link-for-editors',
    title: 'קישור המחיקה מוצג לכל בעל הרשאת עריכה',
    file: 'card',
    find: 'if (can("deletePage")) {\n        return [',
    replace: 'if (can("request")) {\n        return [',
    expect: 'כוונה',
  },
  {
    id: 'toggle-without-both-rights',
    title: 'בורר ההפניה מוצג גם בלי הרשאת העברה בלי הפניה',
    file: 'details',
    find: 'can("moveWithRedirect") &&\n          can("moveWithoutRedirect") &&',
    replace: 'can("moveWithRedirect") &&',
    expect: 'כוונה',
  },
  {
    id: 'redirect-choice-ignored',
    title: 'בחירת המשתמש בבורר ההפניה אינה משפיעה על בקשת ההעברה',
    file: 'card',
    find: 'var s = currentSuppress();\n                if (!canMove(!!s)) {',
    replace: 'var s = d.suppress;\n                if (!canMove(!!s)) {',
    expect: 'כוונה',
  },
  {
    id: 'unknown-redirect-suppressed',
    title: 'כשבדיקת ההפניה בוויקיפדיה נכשלה, ההמלצה היא העברה בלי הפניה',
    file: 'card',
    find: 'var suppress = wpOld.failed ? false : !redirectToTarget;',
    replace: 'var suppress = wpOld.failed ? true : !redirectToTarget;',
    expect: 'כוונה',
  },
  {
    id: 'early-click-moves-into-same-article',
    title: 'לחיצה מוקדמת כשהיעד הוא אותו ערך מבצעת העברה',
    file: 'card',
    find: 'if (d.action === "make_redirect") {\n                  updateRed(redirectTo, sourceCard);',
    replace: 'if (false) {\n                  updateRed(redirectTo, sourceCard);',
    expect: 'כוונה',
  },
  {
    id: 'request-wrong-section',
    title: 'בקשת העברה נשמרת בסעיף שגוי בדף הבקשות',
    file: 'card',
    find: 'requestToOperators(\n        6,',
    replace: 'requestToOperators(\n        5,',
    expect: 'כוונה',
  },
  {
    id: 'preview-no-delay',
    title: 'התצוגה המקדימה נשלפת מיד בריחוף, בלי השהיה',
    file: 'preview',
    find: 'var PREVIEW_DELAY_MS = 350;',
    replace: 'var PREVIEW_DELAY_MS = 0;',
    expect: 'כוונה',
  },
  {
    id: 'checklist-callback-throws',
    title: 'חריגה בתוך עיבוד הבדיקות לפני פעולה (דחייה שלא טופלה)',
    file: 'card',
    find: 'checklistPromise.then(function (d) {\n        checklist = d;',
    replace: 'checklistPromise.then(function (d) {\n        checklist = d;\n        if (d.action === "manual_review") throw new Error("שבירה מכוונת");',
    expect: 'כוונה',
  },
  {
    id: 'rights-mapping-drops-suppressredirect',
    title: 'העברה בלי הפניה מותרת גם בלי הרשאת suppressredirect',
    file: 'main',
    find: 'moveWithoutRedirect: has("move") && has("suppressredirect"),',
    replace: 'moveWithoutRedirect: has("move"),',
    expect: 'כוונה',
  },
  {
    id: 'empty-rights-accepted',
    title: 'רשימת הרשאות ריקה אינה נחשבת כשל טעינה',
    file: 'main',
    find: 'if (!Array.isArray(rights) || !rights.length) {',
    replace: 'if (!Array.isArray(rights)) {',
    expect: 'כוונה',
  },
  {
    id: 'rights-not-refetched',
    title: 'אחרי כשל בטעינת ההרשאות, "נסה שוב" אינו שולף אותן מחדש',
    file: 'main',
    find: 'if (userCapabilitiesLoadFailed) cardAssetsPromise = null;',
    replace: '',
    expect: 'כוונה',
  },
  {
    id: 'asset-retry-removed',
    title: 'ביטול הטעינה החוזרת: כשל רגעי במשאבים שוב מסתיר את תוצאת הבדיקה',
    file: 'main',
    // ההקשר של המשך השרשרת מצמיד את השבירה למסירת התוצאה הרגילה, כי
    // מסלול דפי ההפניה משתמש באותו דפוס טעינה חוזרת.
    find: '        .catch(function (err) {\n          console.error(err);\n          return ensureCardAssets();\n        })\n        .then(function (card) {\n          card.renderResult(result);',
    replace: '        .then(function (card) {\n          card.renderResult(result);',
    expect: 'כוונה',
  },
  {
    id: 'render-exception-swallowed',
    title: 'חריגה בבניית הכרטיס נבלעת כ"כשל טעינת משאבים" במקום כרטיס כשל',
    file: 'main',
    find: '        .then(function (card) {\n          card.renderResult(result);\n        }, showAssetLoadFailure);',
    replace: '        .then(function (card) {\n          card.renderResult(result);\n        })\n        .catch(showAssetLoadFailure);',
    expect: 'כוונה',
  },
  {
    id: 'core-disambig-match-broken',
    title: 'בליבה: פירושונים מול פירושונים אינו נחשב מצב תואם',
    file: 'core',
    find: 'return Promise.resolve(currentLocalPage.disambiguation === true);',
    replace: 'return Promise.resolve(false);',
    expect: 'כוונה',
  },
  {
    id: 'retry-label-text',
    title: 'שינוי ניסוח של כפתור "נסה שוב" (שינוי לגיטימי שאינו שגיאה)',
    file: 'messages',
    find: 'btnRetry: "נסה שוב",',
    replace: 'btnRetry: "לנסות שוב",',
    expect: 'ייחוס',
  },
  // ---- סבב הפניות, העברות ושמות ----
  {
    id: 'redirect-route-bypassed',
    title: 'דף הפניה במכלול לא מנותב למסלול ההפניות, ומקבל כרטיס של ערך',
    file: 'main',
    find: 'if (core.getCurrentLocalPage().status === "redirect") {',
    replace: 'if (false) {',
    expect: 'כוונה',
  },
  {
    id: 'redirect-local-move-log-skipped',
    title: 'בהפניה שבורה מדלגים על יומן ההעברות של המכלול ועוברים ישר לוויקיפדיה',
    file: 'card',
    find: '      var missingTitle = chain.finalMissing ? chain.finalTitle : null;',
    replace: '      var missingTitle = null;',
    expect: 'כוונה',
  },
  {
    id: 'retarget-rewrites-whole-page',
    title: 'עדכון יעד ההפניה כותב את כל הדף מחדש ומוחק קטגוריות',
    file: 'card',
    find: '          text: content.slice(0, m.index) + line + content.slice(m.index + m[0].length),',
    replace: '          text: "#הפניה[[" + newTarget + (fragment ? "#" + fragment : "") + "]]",',
    expect: 'כוונה',
  },
  {
    id: 'article-action-on-redirect-page',
    title: 'בדף הפניה מוצעת פעולה של ערך (הפיכה להפניה)',
    file: 'card',
    find: '      if (o.found) actions.push(retargetAction(o.local, o.found));',
    replace: '      if (o.found) actions.push(retargetAction(o.local, o.found));\n      actions.push(makeRedirectAction(o.local.title, "quiet"));',
    expect: 'כוונה',
  },
  {
    id: 'matching-redirect-not-silent',
    title: 'הפניה תקינה שתואמת לוויקיפדיה אינה שותקת',
    file: 'card',
    find: '            if (same) {\n              clearTool();\n              return;\n            }',
    replace: '            if (false) {}',
    expect: 'כוונה',
  },
  {
    id: 'wp-old-title-is-local-title',
    title: 'שאלת ההפניה נשאלת שוב על שם הדף במכלול, ולא על השם הישן בוויקיפדיה',
    file: 'card',
    find: '        wpRedirectTarget(wpOldTitle),',
    replace: '        wpRedirectTarget(oldname),',
    expect: 'כוונה',
  },
  {
    id: 'consumed-redirect-listed',
    title: 'ההפניה שיעד ההעברה עצמו נחשב לה נספרת ומוצעת לעדכון',
    file: 'card',
    find: '          .filter(function (item) { return !sameTitle(item.title, target); })',
    replace: '          .filter(function (item) { return true; })',
    expect: 'כוונה',
  },
  {
    id: 'target-redirect-elsewhere-free',
    title: 'יעד שהוא הפניה לדף אחר נחשב פנוי, ומוצעת העברה',
    file: 'card',
    find: '        var targetRedirectsElsewhere = targetStatus === "redirect" && !targetRedirectsHere;',
    replace: '        var targetRedirectsElsewhere = false;',
    expect: 'כוונה',
  },
  // ---- הפניות מוויקיפדיה ודף שאינו קיים ----
  {
    id: 'import-without-createonly',
    title: 'ייבוא הפניה בלי "יצירה בלבד": דורס דף שנוצר בינתיים',
    file: 'redirects',
    find: '          createonly: true,\n',
    replace: '',
    expect: 'כוונה',
  },
  {
    id: 'import-target-not-replaced',
    title: 'ההפניה המיובאת שומרת את יעד ויקיפדיה במקום השם המקומי',
    file: 'redirects',
    find: 'row.prepared = retarget(content.text, parsed, localTitle);',
    replace: 'row.prepared = content.text;',
    expect: 'כוונה',
  },
  {
    id: 'self-title-not-excluded',
    title: 'הפניה בוויקיפדיה מהשם המקומי עצמו נספרת כערך נפרד',
    file: 'redirects',
    find: 'return !sameTitle(title, localTitle);',
    replace: 'return true;',
    expect: 'כוונה',
  },
  {
    id: 'core-runs-on-missing-page',
    title: 'בדף שאינו קיים ההכרעה בליבה רצה, ומוצג כרטיס כשל',
    file: 'main',
    find: '      if (isMissingPage) {\n        runMissingPageCheck();\n        return;\n      }\n',
    replace: '',
    expect: 'כוונה',
  },
  {
    id: 'tag-board-after-any-error',
    title: 'תיוג שעובר ללוח מובנה אחרי כל שגיאה, כמו בסקריפט הישן',
    file: 'redirects',
    find: 'return Promise.resolve(api.postWithToken("csrf", params)).then(function (res) {',
    replace:
      'return Promise.resolve(api.postWithToken("csrf", params)).catch(function () { return api.postWithToken("csrf", { action: "flow", format: "json", submodule: "new-topic", page: TAG_PAGE, nttopic: params.sectiontitle, ntcontent: TAG_TEXT }); }).then(function (res) {',
    expect: 'כוונה',
  },
  {
    id: 'save-without-review-ack',
    title: 'שמירת הפניה בלי אישור העיון של האתר',
    file: 'redirects',
    find: '        return requireReviewAck()\n          .then(',
    replace: '        return Promise.resolve()\n          .then(',
    expect: 'כוונה',
  },
  {
    id: 'deleted-shown-to-all',
    title: 'הפניה שנמחקה בעבר מוצגת גם למי שאינו בקבוצת אספקלריה',
    file: 'redirects',
    find: 'if (deletion.deleted && !inGroup) return;',
    replace: 'if (false) return;',
    expect: 'כוונה',
  },
  {
    id: 'tag-button-for-mover',
    title: 'כפתור תיוג מנטרים מוצג גם למי שיכול להעביר',
    file: 'card',
    find: 'var canTag = !can("moveWithRedirect");',
    replace: 'var canTag = true;',
    expect: 'כוונה',
  },
  {
    id: 'select-all-includes-gray',
    title: '"סימון הכול" מסמן גם שורות אפורות',
    file: 'redirects',
    find: 'else if (!row.deleted) row.$check.prop("checked", true);',
    replace: 'else row.$check.prop("checked", true);',
    expect: 'כוונה',
  },
  {
    id: 'saves-fetched-not-edited',
    title: 'נשמר התוכן שנשלף במקום התוכן הנערך',
    file: 'redirects',
    find: 'row.text = cancelled ? row.prepared : String($area.val());',
    replace: 'row.text = row.prepared;',
    expect: 'כוונה',
  },
  {
    id: 'detection-for-anonymous',
    title: 'הזיהוי רץ גם למשתמש לא מחובר',
    file: 'main',
    find: '      if (!mw.config.get("wgUserName")) return null;\n',
    replace: '',
    expect: 'כוונה',
  },
  {
    id: 'css-accent-color',
    title: 'שינוי צבע ההדגשה של כרטיס הצלחה (עיצוב בלבד)',
    file: 'css',
    find: '.hmk-card-success{--hmk-accent:#1c9c7f;',
    replace: '.hmk-card-success{--hmk-accent:#118866;',
    expect: 'לא-נתפס',
  },
];

function parseArgs(argv) {
  const args = { tool: path.join(suite.SUITE_DIR, '..'), only: [], check: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--tool') args.tool = argv[++i];
    else if (argv[i] === '--only') args.only.push(argv[++i]);
    else if (argv[i] === '--check') args.check = true;
    else throw new Error(`ארגומנט לא מוכר: ${argv[i]}`);
  }
  return args;
}

function prepare(baseDir, mutation) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-sensitivity-'));
  for (const file of Object.values(PRODUCTION_FILES)) {
    fs.copyFileSync(path.join(baseDir, file), path.join(dir, file));
  }
  const target = path.join(dir, PRODUCTION_FILES[mutation.file]);
  const source = fs.readFileSync(target, 'utf8');
  const count = source.split(mutation.find).length - 1;
  if (count !== 1) throw new Error(`${mutation.id}: המחרוזת לשבירה מופיעה ${count} פעמים (צריך בדיוק פעם אחת)`);
  fs.writeFileSync(target, source.replace(mutation.find, mutation.replace));
  return dir;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseDir = path.resolve(args.tool);
  const report = suite.baselineReport(baseDir);
  if (report.changed.length || report.missing.length) {
    console.log('מבחני הרגישות רצים רק על הבסיס הנעול, כדי שכל כשל יוסבר בשבירה עצמה.');
    return 1;
  }
  const contract = loadContract(suite.CONTRACT_DIR);
  const scenarios = suite.loadScenarios();
  const selected = args.only.length ? MUTATIONS.filter((m) => args.only.includes(m.id)) : MUTATIONS;

  let bad = 0;
  const started = Date.now();
  for (const m of selected) {
    const dir = prepare(baseDir, m);
    if (args.check) {
      console.log(`תקין  ${m.id}`);
      fs.rmSync(dir, { recursive: true, force: true });
      continue;
    }
    const intent = [];
    const snapshotOnly = [];
    let example = null;
    for (const scn of scenarios) {
      const run = await runScenario(scn, { toolDir: dir, contract });
      if (run.failures.length) {
        intent.push(scn.id);
        if (!example) example = `${scn.id}: ${run.failures[0]}`;
      } else if (suite.snapshotFailures(scn, run.frames).length) {
        snapshotOnly.push(scn.id);
      }
    }
    fs.rmSync(dir, { recursive: true, force: true });

    const level = intent.length ? 'כוונה' : snapshotOnly.length ? 'ייחוס' : 'לא-נתפס';
    // רמת התפיסה חייבת להיות בדיוק הצפויה: שינוי לגיטימי שנתפס בבדיקת
    // כוונה פירושו בדיקה שבירה מדי, ושינוי עיצוב שנתפס פירושו שהגבול
    // המתועד של הסוויטה אינו מדויק.
    const ok = level === m.expect;
    if (!ok) bad++;
    console.log(`${ok ? 'OK  ' : 'MISS'} ${m.id} — ${m.title}`);
    console.log(`      צפוי: ${m.expect} | נתפס: ${level} | בדיקות כוונה שנכשלו: ${intent.length} | רק תמונת ייחוס: ${snapshotOnly.length}`);
    if (example) console.log(`      דוגמה: ${example}`);
  }
  console.log('');
  console.log(`${selected.length - bad}/${selected.length} שבירות נתפסו ברמה הצפויה, ${((Date.now() - started) / 1000).toFixed(0)} שניות.`);
  return bad ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exit(2);
  }
);
