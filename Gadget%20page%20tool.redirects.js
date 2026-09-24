(function () {
  "use strict";

  // הפניות מוויקיפדיה: יכולת עצמאית בטעינה עצלה. שלושה חלקים:
  //   זיהוי - ההפניות בוויקיפדיה אל הערך, ומצב כל אחת במכלול. משמש את
  //     הפקד שליד מחוון הגודל ואת הבדיקה בדף שאינו קיים. שתי שאילתות.
  //   חלונית - טבלת ההפניות החסרות, ייבוא בודד או מסומנים, ורשימת ערכים
  //     נפרדים. כל שליפה נוספת קורית רק בפתיחת החלונית.
  //   כתיבה - ייבוא הפניה, ותיוג מנטרים בדף שיחה.
  // הכלי משקף ולא מכריע: כל ממצא מוצג כעובדה, וכתיבה קורית רק בלחיצה.
  window.HMK_PAGE_TOOL_REDIRECTS_FACTORY = function (runtime) {
    var wpQuery = runtime.wpQuery;
    var localQuery = runtime.localQuery;
    var firstPage = runtime.firstPage;
    var structureError = runtime.structureError;
    var normalizeTitle = runtime.normalizeTitle;
    var parseRedirectLine = runtime.parseRedirectLine;
    var loadCapabilities = runtime.loadCapabilities;
    var placePanel = runtime.placePanel;
    var api = new mw.Api();

    var BATCH = 50;
    var POOL = 5;
    var IMPORT_TAG = "ייבוא-הפניות";
    var REVIEW_MODULE = "ext.gadget.alert-script";
    // הפניות שנמחקו בעבר מוצגות, וניתנות לייבוא, רק לחברי הקבוצה הזו.
    var DELETED_GROUP = "aspaklaryaEditor";
    // תיוג מנטרים: היעד, הכותרת והמלל כמו בגאדג'ט ההפניות שרץ באתר.
    var TAG_PAGE = "המכלול:בקשות לעדכון שמות ערכים";
    // מפוצל בכוונה: בשמירת דף סקריפט מדיה־ויקי מחליף גם בו חתימה והצבה.
    var TAG_TEXT = "{{מצב|חדש}}\n{{ס:הלוק}" + "} ~~" + "~~";
    var WP_INDEX = "https://he.wikipedia.org/w/index.php";

    // ================================================================
    // מלל - טיוטה, לאישור לפני נעילה
    // ================================================================
    var STR = {
      panelTitle: "הפניות מוויקיפדיה",
      close: "סגירה",
      retry: "נסה שוב",
      loading: "טוען את ההפניות…",
      loadFailed: "טעינת ההפניות נכשלה.",
      colTitle: "הפניה",
      colContent: "תוכן הדף",
      selectAll: "סימון הכול",
      clearAll: "ביטול הסימון",
      importSelected: function (n) {
        return "ייבוא מסומנים (" + n + ")";
      },
      importOne: "ייבוא",
      importing: "מייבא…",
      imported: "יובאה",
      alreadyExists: "כבר נוצרה במכלול",
      importFailed: "הייבוא נכשל:",
      ackUnavailable: "אישור העיון לא נטען, ולכן לא נשמר דבר",
      notRedirect: "התוכן אינו הפניה, ולכן לא נשמר",
      summary: function (ok, failed) {
        return "יובאו " + ok + (failed ? ", נכשלו " + failed : "") + ".";
      },
      targetChanged: function (title) {
        return "היעד בוויקיפדיה: " + title;
      },
      edited: "נערך",
      deletedBefore: function (reason) {
        return "נמחקה במכלול בעבר" + (reason ? ": " + reason : "");
      },
      deletionLog: "יומן המחיקות",
      createProtected: "מוגנת מפני יצירה במכלול",
      contentUnchecked: "תוכן ההפניה לא נשלף",
      logUnchecked: "יומן המחיקות במכלול לא נבדק",
      permissionsUnchecked: "ההרשאות לא נבדקו, ולכן אין אפשרות ייבוא.",
      noneLeft: "אין הפניות חסרות.",
      more: "יש בוויקיפדיה הפניות נוספות שלא נבדקו.",
      separateTitle: "קיימים במכלול כערך נפרד",
      separateRow: "— בוויקיפדיה זו הפניה אל הערך הזה.",
    };

    // ================================================================
    // עיצוב - נטען עם הקובץ, לפני בניית החלונית
    // ================================================================
    mw.util.addCSS(
      [
        ".hmk-redirects-panel{direction:rtl;clear:both;margin:0 0 1rem;border:1px solid #c8ccd1;",
        "border-radius:6px;background:#fff;font-size:.875rem;line-height:1.5;color:#202122}",
        ".hmk-redirects-head{display:flex;align-items:center;justify-content:space-between;gap:1rem;",
        "padding:.45rem .7rem;border-bottom:1px solid #eaecf0;background:#f8f9fa;",
        "border-radius:6px 6px 0 0;font-weight:600}",
        ".hmk-redirects-close{border:0;background:transparent;padding:.1rem .3rem;color:#54595d;",
        "cursor:pointer;font:inherit;font-size:1.1rem;line-height:1}",
        ".hmk-redirects-close:hover{color:#202122}",
        ".hmk-redirects-body{padding:.55rem .7rem;display:flex;flex-direction:column;gap:.45rem}",
        ".hmk-redirects-line{margin:0}",
        ".hmk-redirects-muted{color:#54595d}",
        ".hmk-redirects-warn{color:#8a5a00}",
        ".hmk-redirects-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem}",
        ".hmk-redirects-btn{border:1px solid #c8ccd1;border-radius:5px;background:#fff;",
        "padding:.2rem .55rem;color:#36c;cursor:pointer;font:inherit;font-size:.8125rem}",
        ".hmk-redirects-btn:hover{background:#f8f9fa}",
        ".hmk-redirects-btn[disabled]{color:#72777d;cursor:default;background:#fff}",
        ".hmk-redirects-retry{border:0;background:transparent;padding:0;margin-inline-start:.4rem;",
        "color:#36c;cursor:pointer;font:inherit;text-decoration:underline}",
        ".hmk-redirects-wrap{overflow-x:auto}",
        ".hmk-redirects-table{width:100%;border-collapse:collapse}",
        ".hmk-redirects-table th,.hmk-redirects-table td{border-bottom:1px solid #eaecf0;",
        "padding:.3rem .4rem;vertical-align:top;text-align:start}",
        ".hmk-redirects-table th{font-weight:600;color:#54595d;font-size:.8125rem}",
        ".hmk-redirects-check{width:1.6rem}",
        ".hmk-redirects-deleted td{background:#f1f3f4}",
        ".hmk-redirects-text{white-space:pre-wrap;word-break:break-word;font-family:monospace,monospace;",
        "font-size:.8125rem;border-radius:3px;padding:.1rem .2rem}",
        ".hmk-redirects-text[tabindex]{cursor:text}",
        ".hmk-redirects-text[tabindex]:hover{background:#eaf3ff}",
        ".hmk-redirects-edit{width:100%;box-sizing:border-box;font-family:monospace,monospace;font-size:.8125rem}",
        ".hmk-redirects-note{color:#54595d;font-size:.8125rem}",
        ".hmk-redirects-edited{display:inline-block;margin-top:.1rem;font-size:.75rem;color:#8a5a00}",
        ".hmk-redirects-status{display:block;font-size:.8125rem;color:#54595d}",
        ".hmk-redirects-status-error{color:#a5341f}",
        ".hmk-redirects-status-success{color:#12735d}",
        ".hmk-redirects-separate{margin:0;padding-inline-start:1.2rem}",
        ".hmk-redirects-close:focus-visible,.hmk-redirects-btn:focus-visible,.hmk-redirects-retry:focus-visible,",
        ".hmk-redirects-text:focus-visible{outline:2px solid #36c;outline-offset:1px}",
        "html.skin-theme-clientpref-night .hmk-redirects-panel{border-color:#3c4043;background:#202122;color:#e3e3e3}",
        "html.skin-theme-clientpref-night .hmk-redirects-head{border-bottom-color:#3c4043;background:#27282c}",
        "html.skin-theme-clientpref-night .hmk-redirects-close,",
        "html.skin-theme-clientpref-night .hmk-redirects-muted,",
        "html.skin-theme-clientpref-night .hmk-redirects-note,",
        "html.skin-theme-clientpref-night .hmk-redirects-table th{color:#b7b7b7}",
        "html.skin-theme-clientpref-night .hmk-redirects-table th,",
        "html.skin-theme-clientpref-night .hmk-redirects-table td{border-bottom-color:#3c4043}",
        "html.skin-theme-clientpref-night .hmk-redirects-deleted td{background:#2a2b2e}",
        "html.skin-theme-clientpref-night .hmk-redirects-text[tabindex]:hover{background:#27282c}",
        "html.skin-theme-clientpref-night .hmk-redirects-warn,",
        "html.skin-theme-clientpref-night .hmk-redirects-edited{color:#f0c36d}",
        "html.skin-theme-clientpref-night .hmk-redirects-btn{border-color:#3c4043;background:#1f2023;color:#8ab4f8}",
        "html.skin-theme-clientpref-night .hmk-redirects-retry{color:#8ab4f8}",
      ].join("")
    );

    // ================================================================
    // עזרים
    // ================================================================
    function sameTitle(a, b) {
      return normalizeTitle(a) === normalizeTitle(b);
    }

    function chunks(list, size) {
      var out = [];
      for (var i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
      return out;
    }

    // בזה אחר זה, לפי הסדר.
    function inSequence(items, fn) {
      return items.reduce(function (chain, item) {
        return chain.then(function () {
          return fn(item);
        });
      }, Promise.resolve());
    }

    // בקבוצות קטנות במקביל, כדי לא להציף את השרת בבקשה לכל כותרת בבת אחת.
    function inPool(items, size, fn) {
      return inSequence(chunks(items, size), function (group) {
        return Promise.all(group.map(fn));
      });
    }

    // הדף בתשובת query לכל כותרת שנשאלה.
    function pagesByRequestedTitle(data, titles, context) {
      var q = data.query;
      if (!q || !q.pages) throw structureError(context);
      var byTitle = {};
      Object.keys(q.pages).forEach(function (key) {
        byTitle[q.pages[key].title] = q.pages[key];
      });
      var out = {};
      titles.forEach(function (title) {
        if (!byTitle[title]) throw structureError(context);
        out[title] = byTitle[title];
      });
      return out;
    }

    function wikipediaUrl(title) {
      return WP_INDEX + "?title=" + encodeURIComponent(title) + "&redirect=no";
    }

    // ================================================================
    // זיהוי: שאילתה לוויקיפדיה, ושאילתה מקומית לכל 50 כותרות
    // ================================================================
    // מצב כל הפניה במכלול. הפניה מקומית, לכל יעד, אינה מוצגת: המכלול
    // מחליט בעצמו על יעדי הפניות.
    function classifyLocal(titles) {
      var result = { missing: [], protectedTitles: [], separate: [] };
      return inSequence(chunks(titles, BATCH), function (chunk) {
        return localQuery({
          titles: chunk.join("|"),
          prop: "info",
          inprop: "protection",
        }).then(function (data) {
          var pages = pagesByRequestedTitle(data, chunk, "מצב ההפניות במכלול");
          chunk.forEach(function (title) {
            var page = pages[title];
            if ("missing" in page) {
              var createProtected = page.protection.some(function (p) {
                return p.type === "create";
              });
              (createProtected ? result.protectedTitles : result.missing).push(title);
              return;
            }
            if ("redirect" in page) return;
            result.separate.push(title);
          });
        });
      }).then(function () {
        return result;
      });
    }

    // ההפניות בוויקיפדיה אל wpTitle, ממוינות לפי מצבן במכלול. שם הדף
    // המקומי עצמו מוחרג: בוויקיפדיה יכולה להיות הפניה מהצורה המקומית.
    function detect(wpTitle, localTitle) {
      return wpQuery({
        titles: wpTitle,
        prop: "linkshere",
        lhprop: "title",
        lhshow: "redirect",
        lhnamespace: 0,
        lhlimit: "max",
        indexpageids: 1,
      }).then(function (data) {
        if (!data.query || !data.query.pages) throw structureError("הפניות בוויקיפדיה");
        var titles = (firstPage(data).linkshere || [])
          .map(function (link) {
            return link.title;
          })
          .filter(function (title) {
            return !sameTitle(title, localTitle);
          });
        return classifyLocal(titles).then(function (result) {
          result.more = !!data.continue;
          return result;
        });
      });
    }

    // ================================================================
    // שליפות החלונית
    // ================================================================
    // תוכן כל ההפניות, שאילתה אחת לכל 50 כותרות. הפניה שנעלמה בין הזיהוי
    // לפתיחה נשארת בלי תוכן, ומוצגת כ"תוכן ההפניה לא נשלף".
    function fetchContents(titles) {
      var texts = {};
      return inSequence(chunks(titles, BATCH), function (chunk) {
        return wpQuery({
          titles: chunk.join("|"),
          prop: "revisions",
          rvprop: "content",
          rvslots: "main",
        }).then(function (data) {
          var pages = pagesByRequestedTitle(data, chunk, "תוכן ההפניות");
          chunk.forEach(function (title) {
            var page = pages[title];
            if ("missing" in page) return;
            var text = page.revisions && page.revisions[0] && page.revisions[0].slots.main["*"];
            if (typeof text !== "string") throw structureError("תוכן ההפניות");
            texts[title] = { text: text };
          });
        });
      }).then(function () {
        return texts;
      });
    }

    // מחיקה קודמת במכלול. כשל הוא מצב מפורש, לא "לא נמחקה".
    function fetchDeletion(title) {
      return localQuery({
        list: "logevents",
        letype: "delete",
        letitle: title,
        lelimit: 1,
        leprop: "comment",
      })
        .then(function (data) {
          var events = data.query && data.query.logevents;
          if (!Array.isArray(events)) throw structureError("יומן המחיקות במכלול");
          return events.length ? { deleted: true, comment: events[0].comment || "" } : { deleted: false };
        })
        .catch(function (err) {
          if (err && err.silent) throw err;
          return { failed: true };
        });
    }

    function fetchDeletions(titles) {
      var out = {};
      return inPool(titles, POOL, function (title) {
        return fetchDeletion(title).then(function (r) {
          out[title] = r;
        });
      }).then(function () {
        return out;
      });
    }

    // ================================================================
    // כתיבה
    // ================================================================
    // רק יעד הקישור בשורת ההפניה מוחלף; הפסקה והשאר נשמרים.
    function retarget(text, parsed, localTitle) {
      var m = parsed.match;
      var line = m[1] + localTitle + (parsed.fragment ? "#" + parsed.fragment : "") + m[5];
      return text.slice(0, m.index) + line + text.slice(m.index + m[0].length);
    }

    // אישור העיון של האתר: חלון הסבר חד־פעמי, שאינו ממתין למשתמש ואינו
    // נכשל. לכן נקרא פעם אחת לכל פעולת ייבוא; אחרת, בייבוא מסומנים, החלון
    // היה נפתח שוב לכל הפניה לפני שהמשתמש הספיק ללחוץ. כשל אפשרי רק
    // בטעינת הגאדג'ט, ואז לא נשמר דבר.
    function requireReviewAck() {
      return Promise.resolve(mw.loader.using(REVIEW_MODULE)).then(function (require) {
        return require(REVIEW_MODULE).requireReviewAck();
      });
    }

    function saveRedirect(title, text) {
      return Promise.resolve(
        api.postWithToken("csrf", {
          action: "edit",
          format: "json",
          title: title,
          text: text,
          tags: IMPORT_TAG,
          bot: true,
          watchlist: "unwatch",
          createonly: true,
        })
      ).then(function (data) {
        if (data.edit.result !== "Success") throw new Error("import-not-saved");
        return data;
      });
    }

    // תיוג מנטרים: פסקה חדשה בדף הבקשות, בכותרת שם הערך שנמצא. דף הבקשות
    // לעולם אינו לוח דיונים מובנה, ולכן אין בדיקת סוג תוכן. שגיאה בשמירה
    // נשארת שגיאה.
    function tagMonitors(articleTitle) {
      var params = {
        action: "edit",
        format: "json",
        title: TAG_PAGE,
        section: "new",
        sectiontitle: "[[" + articleTitle + "]]",
        text: TAG_TEXT,
      };
      return Promise.resolve(api.postWithToken("csrf", params)).then(function (res) {
        if (!(res && res.edit && res.edit.result === "Success")) throw new Error("tag-not-saved");
        return { page: TAG_PAGE };
      });
    }

    // ================================================================
    // חלונית
    // ================================================================
    // שגיאה כאן היא קוד מהממשק (מחרוזת) או שגיאת "לא נשמר".
    function importErrorText(err) {
      if (err === "articleexists") return STR.alreadyExists;
      return STR.importFailed + " " + (err.message || String(err));
    }

    function open(options) {
      var $toggle = options.$toggle;
      var localTitle = normalizeTitle(options.localTitle);
      var detection = options.detection;
      var onCountChange = options.onCountChange;
      var inGroup = mw.config.get("wgUserGroups").indexOf(DELETED_GROUP) !== -1;
      var rows = [];
      var canImport = false;
      var locked = false;

      var $close = $("<button>", {
        type: "button",
        class: "hmk-redirects-close",
        text: "×",
        title: STR.close,
        "aria-label": STR.close,
      });
      var $body = $("<div>", { class: "hmk-redirects-body" });
      var $panel = $("<section>", {
        id: "hmk-redirects-panel",
        class: "hmk-redirects-panel",
        dir: "rtl",
      }).append(
        $("<div>", { class: "hmk-redirects-head" })
          .append($("<span>", { text: STR.panelTitle }))
          .append($close),
        $body
      );

      var $selectAll = $("<button>", { type: "button", class: "hmk-redirects-btn hmk-redirects-select-all" });
      var $importSelected = $("<button>", { type: "button", class: "hmk-redirects-btn hmk-redirects-import-selected" });
      var $summary = $("<p>", { class: "hmk-redirects-line hmk-redirects-summary" }).hide();

      function setVisible(visible) {
        visible ? $panel.show() : $panel.hide();
        $toggle.attr("aria-expanded", visible ? "true" : "false");
      }

      function isSelectable(row) {
        return canImport && row.kind === "missing" && row.text !== null && !row.logFailed && !row.done;
      }

      function checkedRows() {
        return rows.filter(function (row) {
          return isSelectable(row) && row.$check && row.$check.prop("checked");
        });
      }

      function reportCount() {
        var left = rows.filter(function (row) {
          return row.kind === "missing" && !row.done;
        }).length;
        onCountChange(left, detection.separate.length);
      }

      // מצב כל הפקדים לפי הנעילה והסימון. "סימון הכול" אינו כולל שורות
      // אפורות; "ביטול הסימון" מבטל הכול.
      function refreshControls() {
        rows.forEach(function (row) {
          var selectable = isSelectable(row);
          if (row.$check) row.$check.prop("disabled", locked || !selectable);
          if (row.$import) row.$import.prop("disabled", locked || row.busy);
          if (row.$text) {
            if (selectable && !locked) row.$text.attr("tabindex", "0");
            else row.$text.removeAttr("tabindex");
          }
        });
        var plain = rows.filter(function (row) {
          return isSelectable(row) && !row.deleted;
        });
        var allPlainChecked =
          plain.length > 0 &&
          plain.every(function (row) {
            return row.$check.prop("checked");
          });
        $selectAll
          .text(allPlainChecked ? STR.clearAll : STR.selectAll)
          .prop("disabled", locked || !plain.length);
        var n = checkedRows().length;
        $importSelected.text(STR.importSelected(n)).prop("disabled", locked || n === 0);
      }

      function setRowStatus(row, text, tone) {
        row.$status
          .attr("class", "hmk-redirects-status" + (tone ? " hmk-redirects-status-" + tone : ""))
          .text(text || "");
      }

      function refreshEdited(row) {
        row.$edited.toggle(row.text !== row.prepared);
      }

      // עריכה בלחיצה: תיבת טקסט במקום התוכן. מקש היציאה מחזיר את התוכן
      // שנשלף; יציאה מהתיבה שומרת את מה שנכתב, עד הייבוא.
      function startEdit(row) {
        if (locked || row.editing || !isSelectable(row)) return;
        row.editing = true;
        var cancelled = false;
        var $area = $("<textarea>", {
          class: "hmk-redirects-edit",
          dir: "rtl",
          rows: Math.max(2, row.text.split("\n").length + 1),
        }).val(row.text);
        function finish() {
          if (!row.editing) return;
          row.editing = false;
          row.text = cancelled ? row.prepared : String($area.val());
          $area.remove();
          row.$text.text(row.text).show();
          refreshEdited(row);
        }
        $area.on("keydown", function (event) {
          if (event.key === "Escape") {
            cancelled = true;
            event.preventDefault();
            finish();
          }
        });
        $area.on("blur", finish);
        row.$text.hide().after($area);
        $area.trigger("focus");
      }

      function importRow(row) {
        if (!parseRedirectLine(row.text)) {
          setRowStatus(row, STR.notRedirect, "error");
          return Promise.resolve(false);
        }
        row.busy = true;
        refreshControls();
        setRowStatus(row, STR.importing);
        return saveRedirect(row.title, row.text)
          .then(function () {
            row.busy = false;
            row.done = true;
            if (row.$check) row.$check.prop("checked", false);
            if (row.$import) row.$import.remove();
            row.$import = null;
            row.$status
              .attr("class", "hmk-redirects-status hmk-redirects-status-success")
              .empty()
              .append(document.createTextNode(STR.imported + " · "))
              .append(
                $("<a>", {
                  href: mw.util.getUrl(row.title, { redirect: "no" }),
                  text: row.title,
                })
              );
            reportCount();
            return true;
          })
          .catch(function (err) {
            row.busy = false;
            setRowStatus(row, importErrorText(err), "error");
            return false;
          });
      }

      // ייבוא בזה אחר זה. שורה שנכשלה נשארת מסומנת, ולכן לחיצה חוזרת
      // מנסה רק אותה.
      function importRows(list, withSummary) {
        locked = true;
        $summary.hide();
        refreshControls();
        var ok = 0;
        var failed = 0;
        return requireReviewAck()
          .then(
            function () {
              return inSequence(list, function (row) {
                return importRow(row).then(function (success) {
                  if (success) ok++;
                  else failed++;
                });
              });
            },
            function () {
              list.forEach(function (row) {
                setRowStatus(row, STR.ackUnavailable, "error");
              });
              failed = list.length;
            }
          )
          .then(function () {
            locked = false;
            refreshControls();
            if (withSummary) $summary.text(STR.summary(ok, failed)).show();
          });
      }

      function titleCell(row) {
        var $cell = $("<td>").append(
          $("<a>", {
            href: wikipediaUrl(row.title),
            target: "_blank",
            rel: "noopener",
            text: row.title,
          })
        );
        if (row.deleted) {
          $cell.append(
            $("<div>", { class: "hmk-redirects-note" })
              .append(document.createTextNode(STR.deletedBefore(row.deletion.comment) + " · "))
              .append(
                $("<a>", {
                  href: mw.util.getUrl("Special:Log", { type: "delete", page: row.title }),
                  text: STR.deletionLog,
                })
              )
          );
        }
        return $cell;
      }

      function contentCell(row) {
        var $cell = $("<td>");
        if (row.text !== null) {
          row.$text = $("<div>", { class: "hmk-redirects-text", dir: "rtl", text: row.text });
          row.$edited = $("<span>", { class: "hmk-redirects-edited", text: STR.edited }).hide();
          row.$text.on("click", function () {
            startEdit(row);
          });
          row.$text.on("keydown", function (event) {
            if (event.key === "Enter") {
              event.preventDefault();
              startEdit(row);
            }
          });
          $cell.append(row.$text);
          if (row.targetChanged) {
            $cell.append($("<div>", { class: "hmk-redirects-note", text: STR.targetChanged(row.wpTarget) }));
          }
          $cell.append(row.$edited);
        }
        if (row.note) $cell.append($("<div>", { class: "hmk-redirects-note", text: row.note }));
        return $cell;
      }

      function buildRow(row) {
        var $tr = $("<tr>", { class: row.deleted ? "hmk-redirects-deleted" : null });
        var $checkCell = $("<td>", { class: "hmk-redirects-check" });
        var $actionCell = $("<td>");
        row.$status = $("<span>", { class: "hmk-redirects-status" });
        if (isSelectable(row)) {
          row.$check = $("<input>", { type: "checkbox", "aria-label": row.title }).on("change", refreshControls);
          $checkCell.append(row.$check);
          row.$import = $("<button>", { type: "button", class: "hmk-redirects-btn hmk-redirects-import", text: STR.importOne });
          row.$import.on("click", function () {
            if (locked || row.busy) return;
            importRows([row], false);
          });
          $actionCell.append(row.$import);
        }
        $actionCell.append(row.$status);
        return $tr.append($checkCell, titleCell(row), contentCell(row), $actionCell);
      }

      function makeRow(title, content, deletion) {
        var row = {
          title: title,
          kind: "missing",
          deleted: !!deletion.deleted,
          deletion: deletion,
          logFailed: !!deletion.failed,
          prepared: null,
          text: null,
          note: null,
          done: false,
          busy: false,
          editing: false,
        };
        if (typeof content.text !== "string") row.note = STR.contentUnchecked;
        else {
          var parsed = parseRedirectLine(content.text);
          row.prepared = retarget(content.text, parsed, localTitle);
          row.text = row.prepared;
          row.wpTarget = parsed.target;
          row.targetChanged = !sameTitle(parsed.target, localTitle);
        }
        if (row.logFailed && !row.note) row.note = STR.logUnchecked;
        return row;
      }

      function render(capsInfo, texts, deletions) {
        canImport = !capsInfo.failed && capsInfo.caps.createRedirect;
        rows = [];
        detection.missing.forEach(function (title) {
          var deletion = deletions[title];
          // הפניה שנמחקה בעבר: לקבוצה ברקע אפור, לאחרים לא מוצגת כלל.
          if (deletion.deleted && !inGroup) return;
          rows.push(makeRow(title, texts[title] || {}, deletion));
        });
        detection.protectedTitles.forEach(function (title) {
          rows.push({ title: title, kind: "protected", text: null, note: STR.createProtected, deletion: {} });
        });

        $body.empty();
        if (capsInfo.failed) {
          $body.append($("<p>", { class: "hmk-redirects-line hmk-redirects-warn", text: STR.permissionsUnchecked }));
        }
        if (rows.length) {
          if (canImport && rows.some(isSelectable)) {
            $body.append($("<div>", { class: "hmk-redirects-toolbar" }).append($selectAll, $importSelected));
          }
          var $tbody = $("<tbody>");
          rows.forEach(function (row) {
            $tbody.append(buildRow(row));
          });
          $body.append(
            $("<div>", { class: "hmk-redirects-wrap" }).append(
              $("<table>", { class: "hmk-redirects-table" }).append(
                $("<thead>").append(
                  $("<tr>").append(
                    $("<th>", { class: "hmk-redirects-check" }),
                    $("<th>", { text: STR.colTitle }),
                    $("<th>", { text: STR.colContent }),
                    $("<th>")
                  )
                ),
                $tbody
              )
            ),
            $summary
          );
        } else if (detection.missing.length || detection.protectedTitles.length) {
          $body.append($("<p>", { class: "hmk-redirects-line hmk-redirects-muted", text: STR.noneLeft }));
        }
        if (detection.more) {
          $body.append($("<p>", { class: "hmk-redirects-line hmk-redirects-muted", text: STR.more }));
        }
        if (detection.separate.length) {
          var $list = $("<ul>", { class: "hmk-redirects-separate" });
          detection.separate.forEach(function (title) {
            $list.append(
              $("<li>")
                .append($("<a>", { href: mw.util.getUrl(title), text: title }))
                .append(document.createTextNode(" " + STR.separateRow))
            );
          });
          $body.append($("<p>", { class: "hmk-redirects-line", text: STR.separateTitle }), $list);
        }
        refreshControls();
        reportCount();
      }

      function load() {
        $body
          .empty()
          .append($("<p>", { class: "hmk-redirects-line hmk-redirects-muted", text: STR.loading }));
        Promise.all([
          loadCapabilities(),
          fetchContents(detection.missing),
          fetchDeletions(detection.missing),
        ]).then(
          function (res) {
            render(res[0], res[1], res[2]);
          },
          function (err) {
            if (err && err.silent) return;
            console.error(err);
            var $line = $("<p>", { class: "hmk-redirects-line hmk-redirects-muted", text: STR.loadFailed });
            $line.append($("<button>", { type: "button", class: "hmk-redirects-retry", text: STR.retry }).on("click", load));
            $body.empty().append($line);
          }
        );
      }

      $selectAll.on("click", function () {
        if (locked) return;
        var plain = rows.filter(function (row) {
          return isSelectable(row) && !row.deleted;
        });
        var all =
          plain.length > 0 &&
          plain.every(function (row) {
            return row.$check.prop("checked");
          });
        rows.forEach(function (row) {
          if (!row.$check || !isSelectable(row)) return;
          if (all) row.$check.prop("checked", false);
          else if (!row.deleted) row.$check.prop("checked", true);
        });
        refreshControls();
      });

      $importSelected.on("click", function () {
        if (locked) return;
        importRows(checkedRows(), true);
      });

      $close.on("click", function () {
        setVisible(false);
        $toggle.trigger("focus");
      });

      placePanel($panel);
      setVisible(true);
      load();

      return {
        toggle: function () {
          setVisible(!$panel.is(":visible"));
        },
      };
    }

    return { detect: detect, open: open, tagMonitors: tagMonitors, STR: STR };
  };
})();
