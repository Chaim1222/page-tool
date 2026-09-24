// משתמש:בוט גאון הירדן/Gadget page tool.messages.js
// מלל הכרטיסים של כלי עמוד-הערך. נטען עצל רק כאשר באמת נדרש כרטיס.
window.HMK_PAGE_TOOL_MESSAGES = {
  // כותרות וגוף כרטיסים
  renamedTitle: "שם הערך שונה בוויקיפדיה",
  redirectTitle: "הכותרת היא הפניה בוויקיפדיה",
  disambigTitle: "דף פירושונים בוויקיפדיה",
  disambigBody: "הכותרת המקבילה בוויקיפדיה היא דף פירושונים, לא ערך.",
  deletedTitle: "הדף נמחק בוויקיפדיה",
  deletedLoading: "טוען את סיבת המחיקה…",
  deletedNoReason: "לא נמסרה סיבת מחיקה.",
  deleteReasonPrefix: "סיבת המחיקה: ",
  chainTooLongTitle: "שרשרת שינויי-שם ארוכה מדי",
  chainTooLongBody: function (max) {
    return "המעקב נעצר אחרי " + max + " קפיצות. נדרשת בדיקה ידנית.";
  },
  cycleTitle: "זוהה מעגל בשרשרת שינויי-השם",
  cycleBody: "השרשרת חוזרת לכותרת שכבר נבדקה. נדרשת בדיקה ידנית.",
  unknownTitle: "לא נמצא דף בשם זה",
  unknownBody: "לא נמצא ערך, הפניה, שינוי-שם או מחיקה בוויקיפדיה.",
  unknownBodyWithOldEvidence: "לא נמצאה ראיה שמספיקה להכרעה. נמצא ביומן אירוע שקדם ליצירת הדף במכלול; הוא מוצג בפרטים כראיה בלבד.",
  revidGoneTitle: "הגרסה שיובאה אינה קיימת בוויקיפדיה",
  movedNsTitle: function (space) {
    return "הערך הועבר בוויקיפדיה למרחב " + space;
  },
  movedNsBody: "המעקב נעצר כאן - הכלי אינו עוקב אחרי מרחבי-שם שאינם המרחב הראשי.",
  checkFailedTitle: "הבדיקה נכשלה",
  checkFailedBody: "אירעה שגיאה בבדיקת מצב הערך.",

  // נסיגה ממקור זיהוי
  fallbackTitle: "הבדיקה הושלמה דרך מקור חלופי",
  fallbackRevisionFailed: "בדיקת מזהה הגרסה נכשלה; הבדיקה המשיכה למקור זיהוי חלופי.",
  fallbackWikidataFailed: "בדיקת פריט ויקינתונים נכשלה; ההכרעה התקבלה לפי מעקב הכותרת.",
  failureSourceRevision: "מזהה הגרסה",
  failureSourceWikidata: "פריט ויקינתונים",

  // תוויות יעד והערות
  newNameLabel: "השם החדש:",
  redirectToLabel: "הפניה אל:",
  targetIsDisambig: "היעד הוא דף פירושונים בוויקיפדיה",
  revidDeletedNotice: "הדף שממנו יובאה הגרסה למכלול נמחק בוויקיפדיה; הדף המוצג כאן הוא ערך אחר, לפי הכותרת הנוכחית.",

  // כפתורים והכרעה
  btnMove: "העברת הדף",
  btnMoveWithRedirect: "העברה עם הפניה",
  btnMoveNoRedirect: "העברה בלי הפניה",
  btnMakeRedirect: "הפיכה להפניה",
  noActionNeeded: "אין צורך בפעולה",
  manualReview: "בדיקה ידנית לפני פעולה",
  alreadyHandledTitle: "השינוי כבר טופל",
  alreadyHandledBody: "מזהה הגרסה מצביע על הפניה ישנה, אבל יעד ההפניה כבר זהה לשדה דף בתבנית. אין שינוי חדש לטיפול.",
  alreadyHandledTargetUnchecked: "בדיקת יעד ההפניה לא הושלמה; האימות חלקי.",
  permissionsLoadFailed: "לא ניתן היה לבדוק את הרשאות המשתמש; ייתכן שחלק מהפעולות אינן מוצגות. רענן את הדף ונסה שוב.",
  userChoiceLabel: "בחירת המשתמש",
  btnDetails: "פרטים",
  btnRetry: "נסה שוב",
  decisionLeadMoveWithRedirect: "השם הישן מפנה ליעד החדש",
  decisionLeadMoveNoRedirect: "השם הישן אינו מפנה ליעד החדש",
  decisionLeadMakeRedirect: "היעד כבר קיים כאותו ערך",
  decisionLeadNone: "הדף כבר נמצא בשם היעד",
  decisionLeadManual: "נדרשת בדיקה ידנית",
  decisionLeadMerged: "הערך מוזג בוויקיפדיה",

  // תצוגה מקדימה לקישורי יעד
  previewLoading: "טוען תצוגה מקדימה…",
  previewArticle: "ערך",
  previewDisambiguation: "דף פירושונים",
  previewRedirectTo: function (target) { return "הפניה אל " + target; },
  previewRedirectDisambiguation: "יעד ההפניה הוא דף פירושונים.",
  previewMissing: "הדף אינו קיים",
  previewRedirectTargetMissing: "יעד ההפניה אינו קיים.",
  previewEmpty: "לא נמצא תקציר להצגה.",
  previewFailed: "לא ניתן לטעון תצוגה מקדימה.",

  // תצוגת רפרוף
  overviewWp: "מה קרה בוויקיפדיה",
  whyRecommendation: "למה זו ההמלצה?",
  whyManualReview: "למה נדרשת בדיקה ידנית?",
  whyNoAction: "למה אין צורך בפעולה?",
  decisiveFacts: "מידע שמשפיע על הפעולה",
  technicalDetails: "פרטי הזיהוי",
  detectedBy: "זוהה לפי",
  detectedByImportedRevision: "זוהה לפי הגרסה שיובאה",
  importedRevision: "הגרסה שיובאה",
  overviewRedirectMain: "הכותרת היא הפניה",
  overviewRedirectsTo: "מפנה אל",
  overviewMoveEventMain: "העברה בוויקיפדיה",
  overviewCurrentWikipediaName: "השם הנוכחי בוויקיפדיה",
  overviewOldTitleNow: "הכותרת הישנה כיום",
  overviewOldTitleRedirectMain: "הפניה",
  overviewOldTitleMissingMain: "אינה קיימת",
  overviewOldTitleNotRedirectMain: "אינה הפניה",
  overviewHandledMain: "השינוי כבר טופל",
  overviewBaselinePointsTo: "דף כבר מצביע על ",
  overviewDeletedMain: "הדף נמחק",
  overviewMovedNsMain: "הועבר מחוץ למרחב הערכים",
  overviewTargetPrefix: "היעד: ",
  overviewDisambigMain: "דף פירושונים",
  overviewStoppedMain: "המעקב נעצר",
  overviewChainLong: "שרשרת שינויי השם ארוכה מדי · נעצר ב־",
  overviewCycle: "זוהה מעגל בשרשרת · ",
  overviewUnknownMain: "לא ניתן לקבוע",
  overviewUnknownSub: "לא נמצא מצב חד־משמעי לכותרת",
  overviewUnknownOldEvidenceSub: "נמצא אירוע ישן מלפני יצירת הדף במכלול; הוא מוצג כראיה בלבד",
  overviewFoundMain: "הערך קיים",
  // הסיבות להמלצה
  notChecked: "לא נבדק",
  unknownSafeRedirect: "בדיקת מצב ההפניה בוויקיפדיה לא הושלמה; ברירת המחדל הבטוחה היא להשאיר הפניה.",
  targetSameReason: "דף היעד כבר קיים במכלול והוא אותו ערך לפי פריט. לכן אין להעביר עליו; יש להפוך את הדף הנוכחי להפניה אליו.",
  targetCurrentReason: "דף המכלול כבר נמצא בשם היעד. אין צורך בהעברה.",
  targetDifferentReason: "דף היעד קיים במכלול אך שייך לערך אחר לפי פריט. נדרשת בדיקה ידנית לפני בחירת פעולה.",
  targetUnknownReason: "דף היעד קיים במכלול, אך לא ניתן לאמת שהוא אותו ערך. נדרשת בדיקה ידנית לפני בחירת פעולה.",
  targetIdentityUncheckedReason: "בדיקת זהות דף היעד נכשלה. לא מבצעים פעולה אוטומטית עד שהבדיקה תושלם.",
  targetRedirectElsewhereReason: function (to) {
    return (
      "השם החדש קיים במכלול כהפניה" +
      (to ? " אל " + to : "") +
      ". ההעברה תיחסם, ולכן נדרשת בדיקה ידנית."
    );
  },
  targetStatusUnknownReason: "בדיקת מצב דף היעד במכלול לא הושלמה. לא מבצעים פעולה אוטומטית.",
  moveWithRedirectReason: "בוויקיפדיה השם הישן מפנה אל היעד החדש, ולכן מומלץ להשאיר הפניה גם במכלול.",
  mergedTargetReason: "בוויקיפדיה הערך מוזג לערך אחר, שקיים גם במכלול. לכן הדף הופך להפניה אליו, בלי העברה.",
  mergedMissingReason: "בוויקיפדיה הערך מוזג לערך אחר, שאינו קיים במכלול. נדרשת בדיקה ידנית.",
  moveNoRedirectReason: "בוויקיפדיה השם הישן אינו מפנה אל היעד החדש, ולכן מומלץ להעביר בלי להשאיר הפניה.",

  // פאנל: מסלול ההכרעה
  traceBaseline: "דף בתבנית",
  traceFailedSource: "בדיקה שלא הושלמה",
  baselineTargetUnchecked: "בדיקת יעד ההפניה לאחר הסנכרון: לא נבדק",
  viaVersion: "מזהה גרסה",
  viaWikidata: "מזהה ויקינתונים",
  viaLog: "יומן ההעברות",
  viaTitle: "מעקב כותרת",

  // פאנל: עובדות
  factOldTitleRedirect: "הפניה מהשם הישן",
  factTargetStatus: "מצב דף היעד במכלול",
  factTargetIdentity: "זהות דף היעד",
  factLogStatus: "שלמות יומן ההעברות והמחיקות",
  factLogRange: "גבול הזמן של היומן",
  factLog: "יומן ההעברות והמחיקות בוויקיפדיה",
  selectorLabel: "בעת ההעברה:",
  loadingFacts: "בודק מצב…",
  factsFailed: "בדיקת המצב נכשלה.",

  // ערכי סטטוס
  revidExistsVal: "קיימת בוויקיפדיה",
  revidGoneVal: "אינה קיימת בוויקיפדיה",
  backlinksLabel: "דפים מקשרים",
  // תבניות מוצגות רק כשיש כאלה, כך שבלעדיהן הנוסח זהה לקודם.
  backlinksSummary: function (direct, redirects, directMore, redirectMore, templates, templateMore) {
    templates = templates || 0;
    var total = direct + redirects + templates;
    if (!total) return "0";
    var anyMore = directMore || redirectMore || (templates && templateMore);
    var directText = direct + (directMore ? "+" : "") + (direct === 1 && !directMore ? " ישיר" : " ישירים");
    var redirectText = redirects + (redirectMore ? "+" : "") + (redirects === 1 && !redirectMore ? " הפניה" : " הפניות");
    var templateText = templates
      ? " · " + templates + (templateMore ? "+" : "") + (templates === 1 && !templateMore ? " תבנית" : " תבניות")
      : "";
    return total + (anyMore ? "+" : "") + " · " + directText + " · " + redirectText + templateText;
  },
  btnShowBacklinks: "הצג דפים מקשרים",
  btnHideBacklinks: "הסתר דפים מקשרים",
  btnShowBacklinkChildren: "הצג דפים המקשרים להפניה",
  backlinkRedirect: "הפניה",
  backlinkTemplate: "תבנית",
  backlinksLoading: "טוען…",
  backlinksNone: "אין דפים מקשרים",
  backlinksMore: "יש דפים נוספים",

  // מצב הכותרת בוויקיפדיה

  // זהות היעד
  identitySame: function (q) {
    return "אותו ערך ויקיפדיה (פריט זהה: " + q + ")";
  },
  identityDifferent: function (b, a) {
    return "ערך ויקיפדיה אחר (פריט היעד " + b + " מול " + a + " של הדף הנוכחי)";
  },
  identityUnknown: "לא ניתן לקבוע (חסר פריט באחת התבניות)",
  identitySameShort: "אותו ערך",
  identityDifferentShort: "ערך אחר",
  identityUnknownShort: "לא ודאי",

  // יומן
  logActionMove: "העביר את הדף",
  logActionDelete: "מחק את הדף",
  logMoveTo: " לשם ",
  logWithRedirect: "עם הפניה",
  logWithoutRedirect: "ללא הפניה",

  // פעולות ושגיאות פעולה
  pageMissingBody: "לא נמצא דף להעברה.",
  moveFailedTitle: "ההעברה נכשלה",
  targetOccupiedTitle: "היעד תפוס",
  targetOccupiedOperator: "כדי להעביר יש למחוק תחילה את הדף בכותרת היעד.",
  targetOccupiedUser: "אין לך הרשאה לדרוס אותו. אפשר לבקש ממפעילים לבצע את ההעברה.",
  btnDeleteAndMove: function (to) { return "מחיקת " + to + " והעברה"; },
  btnRequestMove: "בקשת העברה ממפעילים",
  btnDelete: "מחיקת הדף",
  btnRequestDelete: "בקשת מחיקה",
  deleteReasonFormatFailed: "סיבת המחיקה מוצגת ללא עיבוד, משום שבדיקת התצוגה נכשלה.",
  requestSaving: "שומר את הבקשה…",
  requestSaved: "בקשתך נשמרה בדף הבקשות ממפעילים",
  requestFailed: "שמירת הבקשה נכשלה:",
  moveStarting: "מעביר את הדף…",
  moveCompletedTitle: "ההעברה הושלמה",
  moveCompletedWithWarningsTitle: "ההעברה הושלמה עם הערה",
  moveCompletedBody: "הדף הועבר בהצלחה. התוכן המוצג בעמוד טרם רוענן.",
  moveCompletedTarget: "היעד החדש:",
  movePostUpdating: "ההעברה הצליחה; משלים את העדכונים הנלווים…",
  archiveUpdateSummary: "עדכון קישור לארכיון דיונים מבניים",
  archiveUpdateFailed: "ההעברה הצליחה, אבל עדכון הקישור לארכיון הדיונים המבניים נכשל. יש לעדכן אותו ידנית.",
  archiveLinkMissing: "ההעברה הצליחה, אבל לא נמצא הקישור הצפוי בתיבת הארכיון. יש לעדכן אותו ידנית.",
  moveAfterDeleteFailedTitle: "דף היעד נמחק, אבל ההעברה נכשלה",
  moveAfterDeleteFailedBody: "דף היעד כבר נמחק. ההעברה לא הושלמה.",
  deletedTargetLabel: "דף היעד שנמחק:",
  deleteForMoveStarting: "מוחק את דף היעד…",
  deleteForMoveFailed: "מחיקת דף היעד נכשלה.",
  deleteForMoveReason: function (oldname) {
    return "מחיקה כדי לאפשר העברה מהשם [[" + oldname + "]]";
  },
  deletedWaitMove: "דף היעד נמחק; ממשיך בהעברה…",
  templateUpdatedTitle: "שדה דף עודכן",
  templateUpdatedSelfMove: "הדף כבר נמצא בשם היעד; שדה דף בתבנית עודכן בהצלחה.",
  templateUpdateFailed: "ההעברה הצליחה, אבל עדכון שדה דף בתבנית נכשל. יש לעדכן אותו ידנית.",
  templateUpdateFailedNoMove: "עדכון שדה דף בתבנית נכשל.",
  templateMissing: "ההעברה הצליחה, אבל לא נמצא שדה דף בתבנית לעדכון.",
  templateMissingNoMove: "לא נמצא שדה דף בתבנית לעדכון.",
  alreadyAtTarget: "הדף כבר נמצא בשם היעד; לא בוצעה העברה. מעדכן רק את שדה דף בתבנית.",
  retryRedirectExists: "היעד הוא הפניה; מנסה שוב את ההעברה פעם אחת.",
  redirectStarting: "הופך את הדף להפניה…",
  redirectCompletedTitle: "הדף הפך להפניה",
  redirectCompletedBody: "הפעולה הושלמה. התוכן המוצג בעמוד טרם רוענן.",
  redirectCompletedTarget: "הפניה אל:",
  redirectFailed: "הפיכת הדף להפניה נכשלה.",

  // שם יעד שהותאם לכללי השמות של המכלול
  localizedTargetNote: function (wikipediaTitle) {
    return "השם הותאם לכללי השמות של המכלול. בוויקיפדיה: " + wikipediaTitle;
  },

  // הפניות אל הדף, לפני פעולה ובכרטיס ההצלחה
  // mode: "fix" - העברה בלי הפניה, מתוקנות מכרטיס ההצלחה (ברירת המחדל);
  // "double" - העברה עם הפניה או הפיכה להפניה; "plain" - כל פעולה אחרת.
  redirectsWillBreak: function (count, more, mode) {
    var n = more ? "יותר מ־" + count : String(count);
    var tail =
      mode === "double"
        ? " אחרי הפעולה הן יהפכו להפניות כפולות."
        : mode === "plain"
        ? " אחרי הפעולה הן לא יובילו לערך."
        : " אחרי הפעולה הן לא יובילו לערך, ואפשר יהיה לעדכן אותן מכרטיס ההצלחה.";
    return (count === 1 && !more ? "הפניה אחת מובילה" : n + " הפניות מובילות") + " לדף." + tail;
  },
  // canFix: המשתמש בקבוצה "bot", ולכן תיבת התיקון תוצע לו בכרטיס ההצלחה.
  // תבניות מקשרות מוזכרות כעובדה; את הדפים שמכלילים אותן הכלי לא מנחש.
  // בלי תבניות הנוסח זהה לקודם.
  directLinksWillBreak: function (count, more, canFix, templates, templatesMore) {
    templates = templates || 0;
    var oneTemplate = templates === 1 && !templatesMore;
    var templatesN = templatesMore ? "יותר מ־" + templates : String(templates);
    if (!count) {
      return (
        (oneTemplate ? "תבנית אחת מקשרת" : templatesN + " תבניות מקשרות") +
        " ישירות לדף. בהעברה בלי הפניה " +
        (oneTemplate ? "הקישור ממנה יהפוך לאדום." : "הקישורים מהן יהפכו לאדומים.")
      );
    }
    var one = count === 1 && !more;
    var head = one
      ? "דף אחד מקשר ישירות לדף"
      : (more ? "יותר מ־" + count : String(count)) + " דפים מקשרים ישירות לדף";
    if (templates) {
      head += oneTemplate ? ", ותבנית אחת מקשרת אליו" : ", ו־" + templatesN + " תבניות מקשרות אליו";
    }
    var tail =
      one && !templates
        ? ". בהעברה בלי הפניה הקישור ממנו יהפוך לאדום"
        : ". בהעברה בלי הפניה הקישורים מהם יהפכו לאדומים";
    var fix = "";
    if (canFix) {
      if (templates) fix = ", ואת הדפים אפשר יהיה לעדכן מכרטיס ההצלחה";
      else fix = one ? ", ואפשר יהיה לעדכן אותו מכרטיס ההצלחה" : ", ואפשר יהיה לעדכן אותם מכרטיס ההצלחה";
    }
    return head + tail + fix + ".";
  },
  // תיקון קישורים ישירים אחרי העברה בלי הפניה: כרטיס ההצלחה וחלון התיקון
  directLinkFixesTitle: function (count) {
    return "קישורים ישירים אל השם הישן (" + count + ")";
  },
  btnFixLinks: function (count) {
    return "תיקון קישורים (" + count + ")";
  },
  btnContinueLinkFix: "המשך תיקון",
  linkFixesTemplates: "תבניות שמקשרות לשם הישן, לעדכון בדף התבנית:",
  linkFixesTemplatesMore: "יש תבניות מקשרות נוספות שלא הוצגו.",
  linksLoadFailed: "טעינת חלון התיקון נכשלה. אפשר לנסות שוב.",
  linkFixesMore: function (count) {
    return "מוצגים " + count + " הדפים הראשונים; את השאר אפשר למצוא בדף הדפים המקשרים.";
  },
  linkFixesSummary: function (s) {
    return (
      "תוקנו " + s.fixed + " מתוך " + s.total +
      " · " + (s.skipped === 1 ? "דולג 1" : "דולגו " + s.skipped) +
      " · " + (s.failed === 1 ? "נכשל 1" : "נכשלו " + s.failed)
    );
  },
  linksWindowTitle: function (to) {
    return "תיקון קישורים אל " + to;
  },
  linksPageCounter: function (i, n) {
    return "דף " + i + " מתוך " + n;
  },
  linksWikipedia: "הדף בוויקיפדיה",
  linksWikipediaGuessed: "הדף בוויקיפדיה (משוער)",
  linksDefaultLabel: "ברירת מחדל:",
  linksModeLink: "תיקון הקישור",
  linksModeText: "תיקון הקישור וטקסט הקישור",
  linksDefaultHint: "נבחר לפי סוג שינוי השם",
  linksOccCounter: function (i, n) {
    return "מופע " + i + " מתוך " + n;
  },
  linksNoOcc: "אין מופעים בטקסט",
  btnPrevOcc: "הקודם",
  btnNextOcc: "הבא",
  btnReplaceOcc: "החלפת המופע",
  btnUnreplaceOcc: "ביטול ההחלפה",
  btnSkipOcc: "דילוג על המופע",
  btnReplaceAll: "החלפת כל המופעים",
  linksOccModeLabel: "למופע הזה:",
  linksOccOverrides: "גובר על ברירת המחדל.",
  linksOccPiped: "לקישור הזה יש טקסט משלו, ולכן מתוקן רק הקישור.",
  linksSourceLabel: "טקסט הדף",
  linksResultLabel: "אחרי ההחלפה",
  linksLegendPending: "ממתין",
  linksLegendReplace: "יוחלף",
  linksLegendSkip: "דולג",
  btnSaveNext: "שמירה והמשך",
  btnSkipPage: "דילוג על הדף",
  btnCloseWindow: "סגירה",
  btnReload: "טעינה מחדש",
  // מפתח נפרד: btnRetry כבר קיים בקובץ ("נסה שוב") ומשמש את כרטיסי הכשל.
  linksBtnRetry: "ניסיון חוזר",
  linksLoading: "טוען את הדף…",
  linksSaving: "שומר…",
  linksSavedNext: "נשמר.",
  linksNoChange: "לא היה שינוי לשמור.",
  linksConflict: "הדף נערך מאז שנטען. טעינה מחדש תשמור את ההחלפות שסימנת, אבל שינויים ידניים יאבדו.",
  linksReloadConfirm: "שינויים ידניים בטקסט יאבדו. לטעון מחדש?",
  linksNoLinkInText: "הקישור לא נמצא בטקסט הדף. ייתכן שהוא מגיע מתבנית; אפשר לתקן ידנית בחלון הימני או לדלג.",
  linksPageMissing: "הדף לא קיים עוד.",
  linksPageStructure: "הדף המקשר",
  linksPageIsRedirectTo: function (target) {
    return "הדף הזה הוא עכשיו הפניה אל " + target + ", ולכן אינו נערך כאן.";
  },
  btnOpenRedirectTarget: "פתיחת היעד",
  linksPendingConfirm: function (count) {
    return count === 1
      ? "נשאר מופע ממתין אחד בדף הזה. לשמור בלי לטפל בו?"
      : "נשארו " + count + " מופעים ממתינים בדף הזה. לשמור בלי לטפל בהם?";
  },
  linksLeaveConfirm: "יש שינויים שלא נשמרו. לצאת בלי לשמור?",
  linksLoadPageFailed: "טעינת הדף נכשלה.",
  linksSaveFailed: "השמירה נכשלה.",
  linksNetworkFailed: "השמירה נכשלה בגלל תקלת רשת.",
  linksNoPendingAfter: "אין מופעים ממתינים אחרי זה.",
  linksPendingEarlier: "נשארו מופעים ממתינים מוקדם יותר בדף.",
  linksFirstOcc: "זה המופע הראשון בדף.",
  linksLastOcc: "זה המופע האחרון בדף.",
  linksAllMarked: "כל המופעים בדף הזה סומנו להחלפה.",
  linksSummaryTitle: "סיכום תיקון הקישורים",
  linksSkippedList: "דפים שדולגו:",
  linksFailedList: "דפים שנכשלו:",
  linksSummary: function (to, from) {
    return "עדכון קישור אל [[" + to + "]] (השם הקודם: " + from + ")";
  },
  redirectFixesTitle: function (count) {
    return "הפניות אל השם הישן (" + count + ")";
  },
  redirectFixesMore: "יש הפניות נוספות שלא הוצגו.",
  btnCompareWikipedia: "השוואה לוויקיפדיה",
  btnRetargetTo: function (title) {
    return "עדכון אל " + title;
  },
  checkingShort: "בודק…",
  retargetRowDone: "עודכנה.",
  wpStateRedirect: function (title) {
    return "בוויקיפדיה: הפניה אל " + title;
  },
  wpStateArticle: "בוויקיפדיה: ערך",
  wpStateMissing: "בוויקיפדיה: לא קיים",
  wpStateUnchecked: "בוויקיפדיה: לא נבדק",

  // עדכון יעד של דף הפניה
  btnRetargetRedirect: "עדכון יעד ההפניה",
  retargetStarting: "מעדכן את יעד ההפניה…",
  retargetDoneTitle: "יעד ההפניה עודכן",
  retargetDoneBody: "הפעולה הושלמה. התוכן המוצג בעמוד טרם רוענן.",
  retargetFailed: "עדכון יעד ההפניה נכשל.",
  retargetNoLine: "לא זוהתה שורת הפניה בדף, ולכן לא בוצע שינוי.",
  retargetChanged: "ההפניה כבר מובילה למקום אחר, ולכן לא בוצע שינוי.",
  retargetConfirm: function (from, to) {
    return "יעד ההפניה ישתנה מ־" + from + " אל " + to + ". להמשיך?";
  },
  retargetSummary: function (to) {
    return "עדכון יעד ההפניה אל [[" + to + "]]";
  },

  // דף שהוא הפניה במכלול
  lrDifferentTitle: "ההפניה במכלול שונה מוויקיפדיה",
  lrBrokenTitle: "ההפניה במכלול אינה מובילה לערך",
  lrLocalLine: function (title) {
    return "במכלול: הפניה אל " + title;
  },
  lrLocalMissing: "(הדף אינו קיים)",
  lrLocalIsRedirect: "(הדף הוא בעצמו הפניה)",
  lrWikiLine: function (state) {
    return "בוויקיפדיה: " + state;
  },
  lrWikiRedirect: function (title) {
    return "הפניה אל " + title;
  },
  lrWikiRenamed: function (title) {
    return "הערך הועבר אל " + title;
  },
  lrWikiArticle: "ערך בשם הזה",
  lrWikiDisambig: "דף פירושונים",
  lrWikiDeleted: "הדף נמחק",
  lrWikiOtherNamespace: "הדף הועבר למרחב אחר",
  lrWikiUnknown: "אין מצב ברור",
  lrProposedLead: "יעד מוצע:",
  lrReasonChain: "זה היעד הסופי של שרשרת ההפניות במכלול.",
  lrReasonMoved: function (from) {
    return "הדף " + from + " הועבר במכלול אל היעד הזה.";
  },
  lrReasonWikipedia: "לפי ויקיפדיה.",
  lrNoDestination: "לא נמצא יעד: הדף לא הועבר במכלול, ובוויקיפדיה אין יעד שקיים כאן.",

  // דף שאינו קיים במכלול (טיוטה, לאישור לפני נעילה)
  missingTitle: "נראה שהערך קיים במכלול בשם אחר",
  missingRowText: "— בוויקיפדיה זו הפניה אל השם הזה.",
  missingFooter: "בדף הערך שנמצא הכלי מציג את הפעולה המתאימה.",
  btnTagMonitors: "תיוג מנטרים",
  tagSaving: "שומר את התיוג…",
  tagDone: "התיוג נשמר.",
  tagDoneLink: "לדף הבקשות",
  tagFailed: "שמירת התיוג נכשלה:",
};
