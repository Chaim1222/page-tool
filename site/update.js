(function () {
  "use strict";

  // "מאז הייבוא": יכולת עצמאית שנטענת רק בלחיצה על הפקד שליד מחוון הגודל.
  // שלושה חלקים בלתי תלויים, וכשל באחד אינו מבטל את האחרים:
  //   1. מועד הייבוא או העדכון התואם לגרסת התבנית - מהיסטוריית המכלול.
  //   2. השינויים בוויקיפדיה מאז גרסת הייבוא - ספירת עריכות ושינוי גודל.
  //   3. טבלת ההבדלים - רק בלחיצה נוספת.
  // "לא נבדק" (כשל בשאילתה) נשאר נפרד מ"אין מידע" (השאילתה הצליחה ולא נמצא).
  window.HMK_PAGE_TOOL_UPDATE_FACTORY = function (runtime) {
    var localQuery = runtime.localQuery;
    var netGet = runtime.netGet;
    var directWikipediaSource = !!runtime.directWikipediaSource;
    var firstPage = runtime.firstPage;
    var structureError = runtime.structureError;

    // ================================================================
    // מלל - טיוטה, לאישור לפני נעילה
    // ================================================================
    var STR = {
      panelTitle: "מאז הייבוא",
      retry: "נסה שוב",

      localLoading: "בודק בהיסטוריית המכלול…",
      localUpdated: "עודכן",
      localImported: "יובא",
      localNotUpdatedSince: "לא עודכן מאז",
      localBy: function (user) {
        return "ע\"י " + user;
      },
      localNoMatchingUpdate: "לא נמצא בהיסטוריית הגרסאות עדכון לגרסה הנוכחית.",
      localNone: "לא נמצא בהיסטוריית הגרסאות אירוע ייבוא או עדכון.",
      localUnchecked: "מועד הייבוא: לא נבדק",
      revisionMismatch: "העדכון האחרון מציין גרסה שונה ממספר הגרסה בתבנית המיון.",

      wikiLoading: "בודק את השינויים בוויקיפדיה…",
      wikiLabel: "בוויקיפדיה מאז גרסת הייבוא:",
      wikiUnchecked: "השינויים בוויקיפדיה: לא נבדקו",
      wikiNotInHistory: "גרסת הייבוא אינה נמצאת בהיסטוריית הדף בוויקיפדיה.",

      showDiff: "הצג הבדלים",
      hideDiff: "הסתר הבדלים",
      diffLoading: "טוען הבדלים…",
      diffFailed: "הבדלים: לא נבדקו",
      diffEmpty: "אין הבדלים בתוכן.",

      edits: function (n) {
        if (n === 0) return "ללא עריכות";
        if (n === 1) return "עריכה אחת";
        if (n === 2) return "שתי עריכות";
        return n.toLocaleString() + " עריכות";
      },
      bytesZero: "ללא שינוי בגודל",
      bytesUnit: "בתים",

      ago: function (timestamp) {
        var seconds = Math.max(
          0,
          Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000)
        );
        function unit(n, one, two, many) {
          if (n === 1) return "לפני " + one;
          if (n === 2) return "לפני " + two;
          return "לפני " + n.toLocaleString() + " " + many;
        }
        if (seconds < 60) return "עכשיו";
        if (seconds < 3600) {
          return unit(Math.floor(seconds / 60), "דקה", "שתי דקות", "דקות");
        }
        if (seconds < 86400) {
          return unit(Math.floor(seconds / 3600), "שעה", "שעתיים", "שעות");
        }
        if (seconds < 2592000) {
          return unit(Math.floor(seconds / 86400), "יום", "יומיים", "ימים");
        }
        if (seconds < 31536000) {
          return unit(Math.floor(seconds / 2592000), "חודש", "חודשיים", "חודשים");
        }
        return unit(Math.floor(seconds / 31536000), "שנה", "שנתיים", "שנים");
      },
    };
    // ================================================================
    // עיצוב - נטען עם הקובץ, לפני בניית החלונית, ולכן אין הבזק
    // ================================================================
    mw.util.addCSS(
      [
        ".hmk-update-body{padding:.55rem .7rem;display:flex;flex-direction:column;gap:.3rem}",
        ".hmk-update-line{margin:0}",
        ".hmk-update-muted{color:#54595d}",
        ".hmk-update-warn{color:#8a5a00}",
        ".hmk-update-num{unicode-bidi:isolate;font-variant-numeric:tabular-nums}",
        ".hmk-update-retry{border:0;background:transparent;padding:0;margin-inline-start:.4rem;",
        "color:#36c;cursor:pointer;font:inherit;text-decoration:underline}",
        ".hmk-update-actions{margin-top:.2rem}",
        ".hmk-update-action{border:1px solid #c8ccd1;border-radius:5px;background:#fff;",
        "padding:.25rem .6rem;color:#36c;cursor:pointer;font:inherit;font-size:.8125rem}",
        ".hmk-update-action:hover{background:#f8f9fa}",
        ".hmk-update-action[disabled]{color:#72777d;cursor:default}",
        ".hmk-update-retry:focus-visible,",
        ".hmk-update-action:focus-visible{outline:2px solid #36c;outline-offset:1px}",
        ".hmk-update-diff{overflow:auto;max-height:60vh;margin-top:.4rem}",
        ".hmk-update-diff table.diff{width:100%;margin:0}",
        "html.skin-theme-clientpref-night .hmk-update-muted{color:#b7b7b7}",
        "html.skin-theme-clientpref-night .hmk-update-warn{color:#f0c36d}",
        "html.skin-theme-clientpref-night .hmk-update-retry{color:#8ab4f8}",
        "html.skin-theme-clientpref-night .hmk-update-action{border-color:#3c4043;background:#1f2023;color:#8ab4f8}",
      ].join("")
    );

    // ================================================================
    // שליפות - כולן דרך שכבת הרשת של הליבה
    // ================================================================

    // במקור ברירת המחדל נשמר הפיצול שעבד בסקריפט הישן:
    // היסטוריית גרסאות דרך נתיב הייבוא המקומי; compare דרך שרת הייבוא.
    // במצב direct שתי הבקשות הולכות ישירות ל-API של ויקיפדיה.
    // שתי הכתובות מרוכזות כאן כדי ששינוי שרת עתידי לא יתחבא בלוגיקה.
    var WIKIPEDIA_API = "https://he.wikipedia.org/w/api.php";
    var IMPORT_REVISIONS_ENDPOINT = "/import/get_wik1i.php";
    var IMPORT_COMPARE_ENDPOINT = "https://import.hamichlol.org.il/";

    function wikipediaRevisionsQuery(params) {
      var base = { action: "query", format: "json", utf8: 1 };
      if (directWikipediaSource) base.origin = "*";
      return netGet(
        directWikipediaSource ? WIKIPEDIA_API : IMPORT_REVISIONS_ENDPOINT,
        Object.assign(base, params)
      );
    }

    function wikipediaCompareQuery(params) {
      return netGet(
        directWikipediaSource ? WIKIPEDIA_API : IMPORT_COMPARE_ENDPOINT,
        Object.assign({ action: "compare", format: "json", utf8: 1, origin: "*" }, params)
      );
    }

    function canRetry(err) {
      return !!(err && err.transient);
    }

    // מציגים למשתמש הודעה פנימית רק אם היא נוצרה בשכבת הרשת של הליבה.
    function failureText(prefix, err) {
      var message =
        err && err.netError === true && typeof err.message === "string"
          ? err.message.trim()
          : "";
      return prefix + " (" + (message || "שגיאה בבדיקה") + ")";
    }

    function importedRevisionMissing(err) {
      return !!(
        err &&
        (err.notInHistory ||
          (err.kind === "api" &&
            (err.code === "nosuchrevid" || err.code === "badid_rvendid")))
      );
    }

    // נוסחי התקצירים כפי שהם באתר (הועתקו מהסקריפט הישן).
    var UPDATE_SUMMARY = /עי?דכון מוו?יקיפדיה גי?רסה (\d+)/;
    var IMPORT_SUMMARY = /(יבוא מוו?יקיפדיה העברית|גרסה אחת של הדף)/;

    // דפדוף בשאילתת גרסאות: ממזגים את אובייקט ההמשך כולו.
    function withContinue(params, cont) {
      return cont ? Object.assign({}, params, cont) : params;
    }

    function revisionsOf(data, context) {
      var page = firstPage(data);
      if (!page || "missing" in page || !Array.isArray(page.revisions)) {
        throw structureError(context);
      }
      return page.revisions;
    }

    // מחפשים עדכון ממוספר שתואם בדיוק לשדה גרסה. במקביל שומרים את
    // העדכון הממוספר האחרון לצורך התרעת mismatch. תקציר ייבוא משמש
    // fallback רק אם אין בהיסטוריה אף עדכון ממוספר.
    function fetchLocalEvent(title, importedRevision) {
      var base = {
        titles: title,
        prop: "revisions",
        rvprop: "ids|timestamp|user|comment",
        rvlimit: "max",
        rvdir: "older",
        indexpageids: 1,
      };
      var latestNumbered = null;
      var firstImport = null;

      function eventFromRevision(kind, rev, summaryRevision) {
        if (!rev.timestamp || isNaN(new Date(rev.timestamp).getTime())) {
          throw structureError("היסטוריית המכלול");
        }
        return {
          kind: kind,
          timestamp: rev.timestamp,
          user: typeof rev.user === "string" && rev.user ? rev.user : null,
          summaryRevision: summaryRevision || null,
        };
      }

      function next(cont) {
        return localQuery(withContinue(base, cont)).then(function (data) {
          var revisions = revisionsOf(data, "היסטוריית המכלול");
          for (var i = 0; i < revisions.length; i++) {
            var rev = revisions[i];
            if (typeof rev.comment !== "string") continue;
            var update = rev.comment.match(UPDATE_SUMMARY);
            if (update) {
              var numbered = eventFromRevision("update", rev, update[1]);
              if (!latestNumbered) latestNumbered = numbered;
              if (String(update[1]) === String(importedRevision)) {
                numbered.latestSummaryRevision = latestNumbered.summaryRevision;
                return numbered;
              }
              continue;
            }
            if (!firstImport && IMPORT_SUMMARY.test(rev.comment)) {
              firstImport = eventFromRevision("import", rev, null);
            }
          }
          if (data.continue) return next(data.continue);
          if (latestNumbered) {
            return {
              kind: "unmatched-update",
              latestSummaryRevision: latestNumbered.summaryRevision,
            };
          }
          if (firstImport) return firstImport;
          return { kind: "none" };
        });
      }
      return next(null);
    }

    // הגרסאות בוויקיפדיה מהנוכחית ועד גרסת הייבוא (כולל). נדרשים רק
    // מזהים וגודל. גרסת ייבוא שאינה בהיסטוריה של הדף היא ממצא קבוע,
    // לא תקלה רגעית, ולכן היא מסומנת בנפרד.
    function fetchWikipediaChanges(title, importedRevision) {
      var base = {
        titles: title,
        prop: "revisions",
        rvprop: "ids|size",
        rvlimit: 500,
        rvdir: "older",
        rvendid: importedRevision,
        indexpageids: 1,
      };
      var count = 0;
      var newest = null;
      var oldest = null;
      function next(cont) {
        return wikipediaRevisionsQuery(withContinue(base, cont)).then(function (data) {
          revisionsOf(data, "גרסאות ויקיפדיה").forEach(function (rev) {
            if (!newest) newest = rev;
            oldest = rev;
            count += 1;
          });
          if (data.continue) return next(data.continue);
          if (!oldest || String(oldest.revid) !== String(importedRevision)) {
            var err = new Error("imported-revision-not-in-history");
            err.notInHistory = true;
            throw err;
          }
          if (typeof newest.size !== "number" || typeof oldest.size !== "number") {
            throw structureError("גודל גרסאות");
          }
          return {
            edits: count - 1,
            sizeDiff: newest.size - oldest.size,
            currentRevision: String(newest.revid),
          };
        });
      }
      return next(null);
    }

    function fetchDiff(fromRevision, toRevision) {
      return Promise.all([
        mw.loader.using("mediawiki.diff.styles"),
        wikipediaCompareQuery({
          fromrev: fromRevision,
          torev: toRevision,
          prop: "diff",
        }),
      ]).then(function (results) {
        var compare = results[1].compare;
        if (!compare || typeof compare["*"] !== "string") throw structureError("הבדלים");
        return compare["*"];
      });
    }

    // ================================================================
    // תצוגה
    // ================================================================
    function num(text) {
      return $("<span>", { class: "hmk-update-num", dir: "ltr", text: text });
    }

    function signedBytes(n) {
      if (n === 0) return $("<span>", { text: STR.bytesZero });
      // אותו סימון כמו במחוון הגודל: פלוס מפורש, ומינוס רגיל.
      return $("<span>")
        .append(num((n > 0 ? "+" : "") + n.toLocaleString()))
        .append(document.createTextNode(" " + STR.bytesUnit));
    }

    function retryButton(onClick) {
      return $("<button>", { type: "button", class: "hmk-update-retry", text: STR.retry })
        .on("click", onClick);
    }

    // מבנה הטבלה כמו בדף הבדלים רגיל. בלי מאפיין כיוון: הטבלה יורשת
    // את כיוון הדף, כמו בוויקיפדיה העברית.
    function buildDiffTable(diffHtml) {
      return $("<table>", {
        class: "diff diff-type-table diff-contentalign-right diff-editfont-monospace",
      })
        .append(
          $("<colgroup>")
            .append($("<col>", { class: "diff-marker" }))
            .append($("<col>", { class: "diff-content" }))
            .append($("<col>", { class: "diff-marker" }))
            .append($("<col>", { class: "diff-content" }))
        )
        .append($("<tbody>").html(diffHtml));
    }

    function open(options) {
      var importedRevision = String(options.importedRevision);
      var knownCurrent = String(options.currentRevision);
      var wikiResult = null;
      // כמו בסקריפט המקורי: נתוני העדכון זמינים לכולם, diff רק לשתי הקבוצות יחד.
      var userGroups = mw.config.get("wgUserGroups") || [];
      var canShowDiff =
        userGroups.indexOf("wikiupdate") !== -1 &&
        userGroups.indexOf("aspaklaryaEditor") !== -1;

      var $local = $("<p>", { class: "hmk-update-line" });
      var $note = $("<p>", { class: "hmk-update-line hmk-update-warn" }).hide();
      var $wiki = $("<p>", { class: "hmk-update-line" });
      var $diffButton = $("<button>", {
        type: "button",
        class: "hmk-update-action",
        text: STR.showDiff,
      });
      var $diffStatus = $("<span>", { class: "hmk-update-muted" });
      var $diff = $("<div>", { class: "hmk-update-diff" }).hide();
      var $body = $("<div>", { class: "hmk-update-body" }).append(
        $local,
        $note,
        $wiki,
        canShowDiff
          ? $("<div>", { class: "hmk-update-actions" }).append($diffButton, " ", $diffStatus)
          : null,
        canShowDiff ? $diff : null
      );

      // ---- חלק 1: היסטוריית המכלול ----
      function loadLocal() {
        $local.attr("class", "hmk-update-line hmk-update-muted").text(STR.localLoading);
        $note.hide();
        fetchLocalEvent(options.localTitle, importedRevision).then(
          function (event) {
            $local.attr("class", "hmk-update-line").empty();
            if (event.kind === "none") {
              $local.addClass("hmk-update-muted").text(STR.localNone);
              return;
            }
            if (event.kind === "unmatched-update") {
              $local.addClass("hmk-update-muted").text(STR.localNoMatchingUpdate);
              $note.text(STR.revisionMismatch).show();
              return;
            }
            var parts = [
              event.kind === "update" ? STR.localUpdated : STR.localImported,
              STR.ago(event.timestamp),
            ];
            if (event.user) parts.push(STR.localBy(event.user));
            var text = parts.join(" ");
            if (event.kind === "import") text += " · " + STR.localNotUpdatedSince;
            $local.text(text);
            if (
              event.kind === "update" &&
              event.latestSummaryRevision &&
              event.latestSummaryRevision !== importedRevision
            ) {
              $note.text(STR.revisionMismatch).show();
            }
          },
          function (err) {
            console.error(err);
            $local
              .attr("class", "hmk-update-line hmk-update-muted")
              .text(failureText(STR.localUnchecked, err));
            if (canRetry(err)) $local.append(retryButton(loadLocal));
          }
        );
      }

      // ---- חלק 2: השינויים בוויקיפדיה ----
      function loadWikipedia() {
        $wiki.attr("class", "hmk-update-line hmk-update-muted").text(STR.wikiLoading);
        fetchWikipediaChanges(options.wikiTitle, importedRevision).then(
          function (result) {
            wikiResult = result;
            $wiki
              .attr("class", "hmk-update-line")
              .empty()
              .append(document.createTextNode(STR.wikiLabel + " " + STR.edits(result.edits) + " · "))
              .append(signedBytes(result.sizeDiff));
          },
          function (err) {
            console.error(err);
            // גרסה שאינה בהיסטוריה של הדף, או שאינה קיימת כלל, היא ממצא
            // קבוע. ניסיון חוזר לא ישנה אותו, ולכן אין כפתור.
            if (importedRevisionMissing(err)) {
              $wiki.attr("class", "hmk-update-line hmk-update-warn").text(STR.wikiNotInHistory);
              return;
            }
            $wiki
              .attr("class", "hmk-update-line hmk-update-muted")
              .text(failureText(STR.wikiUnchecked, err));
            if (canRetry(err)) $wiki.append(retryButton(loadWikipedia));
          }
        );
      }

      // ---- חלק 3: טבלת ההבדלים ----
      // היעד הוא הגרסה הנוכחית שנספרה, כדי שהטבלה והספירה יתארו אותו
      // טווח. אם הספירה נכשלה, הטבלה עדיין זמינה מול הגרסה שהכלי ראה.
      var diffLoaded = false;
      var diffLoading = false;
      var diffPermanentFailure = false;
      if (canShowDiff) $diffButton.on("click", function () {
        if (diffLoading || diffPermanentFailure) return;
        if (diffLoaded) {
          var show = !$diff.is(":visible");
          show ? $diff.show() : $diff.hide();
          $diffButton.text(show ? STR.hideDiff : STR.showDiff);
          return;
        }
        diffLoading = true;
        $diffButton.prop("disabled", true).text(STR.diffLoading);
        $diffStatus.text("");
        var toRevision = wikiResult ? wikiResult.currentRevision : knownCurrent;
        fetchDiff(importedRevision, toRevision)
          .then(
            function (diffHtml) {
              diffLoaded = true;
              $diff.empty();
              if (!diffHtml.trim()) {
                $diff.append($("<p>", { class: "hmk-update-line hmk-update-muted", text: STR.diffEmpty }));
              } else {
                $diff.append(buildDiffTable(diffHtml));
              }
              $diff.show();
              $diffButton.text(STR.hideDiff);
            },
            function (err) {
              console.error(err);
              $diffStatus.text(failureText(STR.diffFailed, err));
              if (canRetry(err)) {
                $diffButton.text(STR.retry);
              } else {
                diffPermanentFailure = true;
                $diffButton.text(STR.showDiff).hide();
              }
            }
          )
          .then(function () {
            diffLoading = false;
            $diffButton.prop("disabled", false);
          });
      });

      var panel = runtime.openPanel("update", STR.panelTitle, options.$toggle, $body);
      loadLocal();
      loadWikipedia();
      return panel;
    }

    return { open: open };
  };
})();
