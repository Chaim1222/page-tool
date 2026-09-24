// סוויטת בדיקות קבועה לחלון תיקון הקישורים. טוענת את מודול החלון ואת
// קובץ המלל מתיקיית החבילה, בדפדפן מדומה, עם רשת ושמירה מדומות.
"use strict";
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const MODULE = fs.readFileSync(path.join(ROOT, "Gadget%20page%20tool.links.js"), "utf8");
const CORE = fs.readFileSync(path.join(ROOT, "Gadget%20page%20tool.core.js"), "utf8");
const MESSAGES = fs.readFileSync(path.join(ROOT, "Gadget%20page%20tool.messages.js"), "utf8");

const vc = new VirtualConsole();
vc.on("jsdomError", (e) => console.log("שגיאת דפדפן:", e.message));
const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
  runScripts: "outside-only",
  pretendToBeVisual: true,
  virtualConsole: vc,
});
const w = dom.window;
w.jQuery = w.$ = require("jquery")(w);
w.eval(MESSAGES);
const STR = w.HMK_PAGE_TOOL_MESSAGES;
const $ = w.$;

// ---- רשת ושמירה מדומות ----
let pages = {};
let plan = [];
let writes = [];
let reads = [];
let confirmAnswer = true;
let confirms = [];
w.confirm = (text) => { confirms.push(text); return confirmAnswer; };
w.mw = { util: { getUrl: (t) => "/wiki/" + t }, Api: function () {} };
w.mw.Api.prototype.postWithToken = function (token, params) {
  const d = w.$.Deferred();
  writes.push(params);
  const step = plan.shift();
  setTimeout(() => {
    if (step && step.error) {
      d.reject(step.error, { error: { code: step.error, info: step.info || step.error } });
      return;
    }
    if (pages[params.title]) pages[params.title].content = params.text;
    d.resolve({ edit: { result: "Success" } });
  }, 0);
  return d.promise();
};
const runtime = {
  STR,
  localQuery: (q) =>
    Promise.resolve().then(() => {
      reads.push(q);
      const pg = pages[q.titles];
      if (!pg) {
        return { curtimestamp: "T1", query: { pageids: ["-1"], pages: { "-1": { title: q.titles, missing: "" } } } };
      }
      const page = { title: q.titles, revisions: [{ timestamp: "T0", revid: 1, "*": pg.content }] };
      if (pg.redirect) page.redirect = "";
      return { curtimestamp: "T1", query: { pageids: ["1"], pages: { 1: page } } };
    }),
  firstPage: (d) => d.query.pages[d.query.pageids[0]],
  structureError: (m) => new Error(m),
};
// מפענח שורת ההפניה מגיע מהליבה, כמו בכלי עצמו.
w.eval(CORE);
runtime.parseRedirectLine = w.HMK_PAGE_TOOL_CORE_FACTORY({ STR: {}, MAX_CHAIN_DEPTH: 5, address: "", onRetry() {} }).parseRedirectLine;
w.eval(MODULE);
const F = w.HMK_PAGE_TOOL_LINKS_FACTORY(runtime, {
  actionErrorMessage: (p, e) => p + " " + ((e && e.message) || ""),
  wikipediaUrl: (t) => "https://he.wikipedia.org/wiki/" + t,
  toWikipediaTitle: (t) => t,
  extractTemplateFields: (t) => ({ דף: (/\{\{מיון ויקיפדיה\|דף=([^|}]*)/.exec(t) || [])[1] || null }),
});

// ---- עזרים ----
let ok = 0;
let bad = 0;
function eq(actual, expected, name) {
  if (actual === expected) { ok++; return; }
  bad++;
  console.log("נכשל:", name, "\n  קיבלתי:", actual, "\n  ציפיתי:", expected);
}
const tick = () => new Promise((r) => setTimeout(r, 5));
const settle = async () => { await tick(); await tick(); };
const q = (s) => $(".hmk-lf " + s);
const byText = (t) => $(".hmk-lf button").filter(function () { return $(this).text() === t; });
const status = () => q(".hmk-lf-status > span").first().text();
const O = "משמעת מפלגתית";
const N = "משמעת סיעתית";

// ---- 1. פונקציות טהורות ----
const FORMS = [
  ["[[משמעת מפלגתית]]", "[[משמעת סיעתית|משמעת מפלגתית]]", "[[משמעת סיעתית]]"],
  ["[[משמעת_מפלגתית]]", "[[משמעת סיעתית|משמעת מפלגתית]]", "[[משמעת סיעתית]]"],
  ["ה[[משמעת מפלגתית]]", "ה[[משמעת סיעתית|משמעת מפלגתית]]", "ה[[משמעת סיעתית]]"],
  ["[[משמעת מפלגתית]]ות", "[[משמעת סיעתית|משמעת מפלגתית]]ות", "[[משמעת סיעתית]]ות"],
  ["[[:משמעת מפלגתית]]", "[[:משמעת סיעתית|משמעת מפלגתית]]", "[[:משמעת סיעתית]]"],
  ["[[משמעת מפלגתית#היסטוריה]]", "[[משמעת סיעתית#היסטוריה|משמעת מפלגתית#היסטוריה]]", "[[משמעת סיעתית#היסטוריה]]"],
  ["[[משמעת מפלגתית|המשמעת]]", "[[משמעת סיעתית|המשמעת]]", "[[משמעת סיעתית|המשמעת]]"],
  ["[[משמעת מפלגתית#היסטוריה|הרקע]]", "[[משמעת סיעתית#היסטוריה|הרקע]]", "[[משמעת סיעתית#היסטוריה|הרקע]]"],
  ["[[משמעת מפלגתית|משמעת סיעתית]]", "[[משמעת סיעתית]]", "[[משמעת סיעתית]]"],
];
for (const [src, link, text] of FORMS) {
  const occ = F.findOccurrences(src, O);
  eq(occ.length, 1, "מופע יחיד: " + src);
  eq(F.applyReplacements(src, occ, () => true, () => "link", N), link, "תיקון הקישור: " + src);
  eq(F.applyReplacements(src, occ, () => true, () => "text", N), text, "תיקון הקישור וטקסט הקישור: " + src);
}
eq(
  F.findOccurrences(
    "<!-- [[משמעת מפלגתית]] --> <nowiki>[[משמעת מפלגתית]]</nowiki> <pre>[[משמעת מפלגתית]]</pre>" +
      ' <syntaxhighlight lang="x">[[משמעת מפלגתית]]</syntaxhighlight>',
    O
  ).length,
  0,
  "אזורים מוגנים"
);
eq(F.findOccurrences("<nowiki/>[[משמעת מפלגתית]] [[משמעת מפלגתית]]", O).length, 2, "תגית שסוגרת את עצמה");
eq(
  F.findOccurrences("[[קובץ:א.jpg|ממוזער|כיתוב עם [[משמעת מפלגתית]]]] [[משמעת מפלגתיתות]]", O).length,
  1,
  "קישור בכיתוב נתפס, שם אחר לא נתפס"
);
{
  const src = "מחיר $1 ו$& ו$' [[משמעת מפלגתית]]";
  eq(F.applyReplacements(src, F.findOccurrences(src, O), () => true, () => "text", N), "מחיר $1 ו$& ו$' [[משמעת סיעתית]]", "סימני דולר");
}
eq(F.defaultMode(O, N), "text", "ברירת מחדל: שם נרדף");
eq(F.defaultMode("מרקורי", "מרקורי (כוכב לכת)"), "link", "ברירת מחדל: נוספו סוגריים");
eq(F.defaultMode("דן (עיר)", "דן (שבט)"), "text", "ברירת מחדל: הסוגריים השתנו");
{
  const k = F.findOccurrences("[[משמעת מפלגתית]] א [[משמעת מפלגתית]]", O);
  eq(k[0].key !== k[1].key, true, "מפתחות שונים למופעים זהים");
}

(async () => {
  // ---- 2. זרימה מלאה: החלפה, התנגשות, דף בלי קישור, דף חסר ----
  pages = {
    "דף א": { content: "פתיחה ל[[משמעת מפלגתית]] ועוד [[משמעת מפלגתית|טקסט]] <script>x</script> <img src=x onerror=alert(1)>\n{{מיון ויקיפדיה|דף=Page A}}" },
    "דף ב": { content: "בלי קישור בכלל" },
    "דף ג": { content: "[[משמעת מפלגתית]]" },
  };
  writes = []; reads = []; plan = []; confirms = [];
  let done = null;
  F.open({ from: O, to: N, titles: ["דף א", "דף ב", "דף ג", "דף חסר"], more: false }).then((s) => { done = s; });
  await settle();
  eq(reads[0].redirects, undefined, "טעינה בלי מעקב אחרי הפניות");
  eq(reads[0].prop, "info|revisions", "טעינה עם מצב הדף");
  eq(q(".hmk-lf-title").text(), "תיקון קישורים אל " + N, "כותרת");
  eq(q(".hmk-lf-counter").text(), "מופע 1 מתוך 2", "מונה מופעים");
  eq($(".hmk-lf-head a").eq(1).attr("href"), "https://he.wikipedia.org/wiki/Page A", "קישור ויקיפדיה מהתבנית");
  eq($("img").length + $(".hmk-lf script").length, 0, "טקסט הדף לא מורץ כקוד");
  eq(byText(STR.btnSaveNext).prop("disabled"), true, "שמירה מושבתת בלי שינוי");
  byText(STR.btnReplaceOcc).click(); await tick();
  eq(q(".hmk-lf-counter").text(), "מופע 2 מתוך 2", "מעבר קדימה אחרי החלפה");
  eq(w.document.activeElement.tagName !== "TEXTAREA", true, "המיקוד לא עבר לתיבת העריכה");
  byText(STR.btnSkipOcc).click(); await tick();
  eq(status().indexOf(STR.linksNoPendingAfter), 0, "הודעת סוף מופעים");
  plan = [{ error: "editconflict" }];
  byText(STR.btnSaveNext).click(); await settle();
  eq(confirms.length, 0, "בלי מופעים ממתינים אין אישור");
  eq(status().indexOf(STR.linksConflict), 0, "הודעת התנגשות");
  eq([writes[0].basetimestamp, writes[0].starttimestamp, writes[0].nocreate].join("|"), "T0|T1|1", "חותמות זמן ואיסור יצירה");
  byText(STR.btnReload).click(); await settle();
  eq(q(".hmk-lf-result .hmk-lf-occ-replace").length, 1, "ההחלטות נשמרו אחרי טעינה מחדש");
  byText(STR.btnSaveNext).click(); await settle();
  eq(pages["דף א"].content.indexOf("ל[[משמעת סיעתית]] ועוד [[משמעת מפלגתית|טקסט]]") !== -1, true, "נשמר רק המופע שסומן");
  eq(q(".hmk-lf-head a").first().text(), "דף ב", "עבר לדף הבא");
  eq(q(".hmk-lf-notice").css("display") !== "none", true, "הודעה על דף בלי קישור");
  byText(STR.btnSkipPage).click(); await settle();
  eq(q(".hmk-lf-counter").text(), "מופע 1 מתוך 1", "דף ג");
  byText(STR.linksModeLink).first().click(); byText(STR.btnReplaceAll).click(); await tick();
  byText(STR.btnSaveNext).click(); await settle();
  eq(pages["דף ג"].content, "[[משמעת סיעתית|משמעת מפלגתית]]", "ברירת מחדל שהוחלפה ל\"תיקון הקישור\"");
  eq(status(), STR.linksPageMissing, "דף חסר");
  byText(STR.btnSkipPage).click(); await tick();
  eq(q(".hmk-lf-summary-title").text(), STR.linksSummaryTitle, "מסך סיכום");
  byText(STR.btnCloseWindow).click(); await tick();
  eq(done && STR.linkFixesSummary(done), "תוקנו 2 מתוך 4 · דולגו 2 · נכשלו 0", "סיכום בסגירה (התנגשות ואז הצלחה נספרת כתוקן)");
  eq($(".hmk-lf-overlay").length, 0, "החלון נסגר");

  // ---- 3. דף שהפך להפניה, כשלי שמירה, מופעים ממתינים, מספר הדפים ----
  pages = {
    "דף הפניה": { content: "#הפניה [[דף אחר]]", redirect: true },
    "דף רשת": { content: "[[משמעת מפלגתית]]" },
    "דף התנגשות": { content: "[[משמעת מפלגתית]]" },
    "דף ממתין": { content: "[[משמעת מפלגתית]] ו[[משמעת מפלגתית]]" },
    "דף שגיאה": { content: "[[משמעת מפלגתית]]" },
  };
  writes = []; reads = []; plan = []; confirms = [];
  done = null;
  F.open({ from: O, to: N, titles: ["דף הפניה", "דף רשת", "דף התנגשות", "דף ממתין", "דף שגיאה"], more: true }).then((s) => { done = s; });
  await settle();
  eq(status(), STR.linksPageIsRedirectTo("דף אחר"), "דף שהפך להפניה מוצג כמצב מפורש");
  eq(byText(STR.btnOpenRedirectTarget).length, 1, "כפתור פתיחת היעד");
  eq(byText(STR.btnSaveNext).prop("disabled"), true, "דף הפניה אינו נשמר");
  eq(q(".hmk-lf-source").prop("readonly"), true, "דף הפניה אינו נערך");
  byText(STR.btnSkipPage).click(); await settle();

  byText(STR.btnReplaceOcc).click(); await tick();
  plan = [{ error: "http" }];
  byText(STR.btnSaveNext).click(); await settle();
  eq(status(), STR.linksNetworkFailed, "כשל רשת");
  confirmAnswer = true;
  byText(STR.btnSkipPage).click(); await settle();
  eq(confirms[confirms.length - 1], STR.linksLeaveConfirm, "אישור לפני דילוג עם שינויים");

  byText(STR.btnReplaceOcc).click(); await tick();
  plan = [{ error: "editconflict" }];
  byText(STR.btnSaveNext).click(); await settle();
  byText(STR.btnReload).click(); await settle();
  byText(STR.btnSkipPage).click(); await settle();

  byText(STR.btnReplaceOcc).click(); await tick();
  eq(q(".hmk-lf-counter").text(), "מופע 2 מתוך 2", "נשאר מופע ממתין");
  const writesBefore = writes.length;
  const confirmsBefore = confirms.length;
  confirmAnswer = false;
  byText(STR.btnSaveNext).click(); await settle();
  eq(confirms[confirmsBefore], STR.linksPendingConfirm(1), "אישור לפני שמירה עם מופע ממתין");
  eq(writes.length, writesBefore, "ביטול האישור לא שומר");
  confirmAnswer = true;
  byText(STR.btnSaveNext).click(); await settle();
  eq(pages["דף ממתין"].content, "[[משמעת סיעתית]] ו[[משמעת מפלגתית]]", "אחרי אישור נשמר רק המופע שסומן");

  byText(STR.btnReplaceOcc).click(); await tick();
  plan = [{ error: "protectedpage", info: "הדף מוגן" }];
  byText(STR.btnSaveNext).click(); await settle();
  eq(status().indexOf(STR.linksSaveFailed), 0, "שגיאת הרשאה");
  byText(STR.btnSkipPage).click(); await settle();

  eq($(".hmk-lf p").filter(function () { return $(this).text() === STR.linkFixesMore(5); }).length, 1, "המספר האמיתי של הדפים שנשלפו");
  eq($(".hmk-lf li a").filter(function () { return $(this).text() === "דף רשת"; }).length, 1, "דף שנכשל ברשימת הנכשלים");
  byText(STR.btnCloseWindow).click(); await tick();
  eq(done && STR.linkFixesSummary(done), "תוקנו 1 מתוך 5 · דולג 1 · נכשלו 3", "כשל רשת, התנגשות ושגיאה ואז דילוג נספרים כנכשלים");

  // ---- 4. נוספו רק סוגריים: ברירת המחדל שומרת את הטקסט ----
  pages = { "דף סוגריים": { content: "כוכב ה[[מרקורי]] קרוב לשמש" } };
  writes = []; plan = [];
  F.open({ from: "מרקורי", to: "מרקורי (כוכב לכת)", titles: ["דף סוגריים"], more: false });
  await settle();
  byText(STR.btnReplaceOcc).click(); await tick();
  byText(STR.btnSaveNext).click(); await settle();
  eq(pages["דף סוגריים"].content, "כוכב ה[[מרקורי (כוכב לכת)|מרקורי]] קרוב לשמש", "נוספו רק סוגריים: תיקון הקישור בלבד");
  byText(STR.btnCloseWindow).click(); await tick();

  console.log("עברו:", ok, "נכשלו:", bad);
  process.exitCode = bad ? 1 : 0;
})().catch((err) => {
  console.log("שגיאה בהרצה:", err && err.stack);
  process.exitCode = 1;
});
