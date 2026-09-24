// משתמש:בוט גאון הירדן/Gadget page tool.links.js
// חלון תיקון קישורים אחרי העברה בלי הפניה. נטען עצל, רק בלחיצה על
// "תיקון קישורים" בכרטיס ההצלחה.
// הרעיון בהשראת "הוספת בזק של קישורים" של ערן; הקוד נכתב מאפס.
(function () {
  "use strict";

  window.HMK_PAGE_TOOL_LINKS_FACTORY = function (runtime, deps) {
    var STR = runtime.STR;
    var localQuery = runtime.localQuery;
    var firstPage = runtime.firstPage;
    var structureError = runtime.structureError;
    var parseRedirectLine = runtime.parseRedirectLine;
    var actionErrorMessage = deps.actionErrorMessage;
    var wikipediaUrl = deps.wikipediaUrl;
    var toWikipediaTitle = deps.toWikipediaTitle;
    var extractTemplateFields = deps.extractTemplateFields;
    var api = new mw.Api();

    injectStyles();

    // ================================================================
    // 1. זיהוי והחלפה - פונקציות טהורות, בלי ממשק
    // ================================================================
    function cleanTitle(title) {
      return String(title || "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
    }

    // האות הראשונה בכותרת אינה תלוית רישיות במדיה־ויקי.
    function sameTitle(a, b) {
      a = cleanTitle(a);
      b = cleanTitle(b);
      if (!a || !b) return false;
      return a.charAt(0).toUpperCase() + a.slice(1) === b.charAt(0).toUpperCase() + b.slice(1);
    }

    function withoutDisambiguator(title) {
      return cleanTitle(title).replace(/\s*\([^()]*\)$/, "").trim();
    }

    // "תיקון הקישור" רק כשהשם החדש הוא הישן בתוספת שם מבחין בסוגריים;
    // אחרת הסוגריים היו מופיעים בתוך המשפט. בכל שינוי אחר גם הטקסט מתוקן.
    function defaultMode(from, to) {
      var base = withoutDisambiguator(to);
      return base !== cleanTitle(to) && sameTitle(base, from) ? "link" : "text";
    }

    // אזורים שבהם סוגריים מרובעים אינם קישור: הערות, לא־ויקי וקוד.
    // הביטוי נבנה מחדש בכל קריאה, כדי שלא יישאר מיקום מסריקה קודמת.
    function protectedRanges(text) {
      var open = /<!--|<(nowiki|pre|syntaxhighlight|source|math)\b([^>]*)>/gi;
      var ranges = [];
      var m;
      while ((m = open.exec(text))) {
        var start = m.index;
        var end;
        if (m[0] === "<!--") {
          end = text.indexOf("-->", start + 4);
          end = end === -1 ? text.length : end + 3;
        } else if (/\/\s*$/.test(m[2] || "")) {
          continue; // תגית שסוגרת את עצמה
        } else {
          var close = new RegExp("</" + m[1] + "\\s*>", "gi");
          close.lastIndex = open.lastIndex;
          var c = close.exec(text);
          end = c ? c.index + c[0].length : text.length;
        }
        ranges.push([start, end]);
        open.lastIndex = end;
      }
      return ranges;
    }

    // כל הקישורים אל השם הישן, עם מיקום התחלה וסוף. המפתח של מופע הוא
    // הטקסט המדויק שלו והמספר הסידורי שלו בין קישורים זהים, כדי שהחלטה
    // תשרוד עריכה ידנית במקום אחר בדף.
    function findOccurrences(text, from) {
      var ranges = protectedRanges(text);
      var link = /\[\[([^\[\]\n]*?)\]\]/g;
      var out = [];
      var seen = {};
      var r = 0;
      var m;
      while ((m = link.exec(text))) {
        while (r < ranges.length && ranges[r][1] <= m.index) r++;
        if (r < ranges.length && ranges[r][0] <= m.index) continue;
        var inner = m[1];
        var bar = inner.indexOf("|");
        var targetPart = bar === -1 ? inner : inner.slice(0, bar);
        var shown = bar === -1 ? null : inner.slice(bar + 1);
        var tm = /^\s*(:?)\s*([^#]*)(#.*)?$/.exec(targetPart);
        if (!tm || !sameTitle(tm[2], from)) continue;
        var raw = m[0];
        seen[raw] = (seen[raw] || 0) + 1;
        out.push({
          start: m.index,
          end: m.index + raw.length,
          raw: raw,
          key: raw + "#" + seen[raw],
          colon: tm[1],
          title: cleanTitle(tm[2]),
          fragment: tm[3] || "",
          shown: shown,
          bare: shown === null,
        });
      }
      return out;
    }

    // קישור עם טקסט משלו: רק היעד משתנה, בשני האופנים. קישור חשוף:
    // "link" שומר את הטקסט הישן לקורא, "text" הופך לקישור חשוף אל השם החדש.
    function replacementFor(occ, to, mode) {
      var head = "[[" + occ.colon + to;
      if (!occ.bare) {
        if (!occ.fragment && cleanTitle(occ.shown) === cleanTitle(to)) return head + "]]";
        return head + occ.fragment + "|" + occ.shown + "]]";
      }
      if (mode === "text") return head + occ.fragment + "]]";
      return head + occ.fragment + "|" + occ.title + occ.fragment + "]]";
    }

    // ההחלפה לפי מיקומים, מהסוף להתחלה, ולא בחיפוש והחלפה של מחרוזת.
    function applyReplacements(text, occs, isReplaced, modeOf, to) {
      var out = text;
      for (var i = occs.length - 1; i >= 0; i--) {
        var occ = occs[i];
        if (!isReplaced(occ)) continue;
        out = out.slice(0, occ.start) + replacementFor(occ, to, modeOf(occ)) + out.slice(occ.end);
      }
      return out;
    }

    // ================================================================
    // 2. החלון
    // ================================================================
    // session: { from, to, titles, more, mode?, statuses? } - נשמר אצל
    // הכרטיס, כדי ש"המשך תיקון" ימשיך מהדף הראשון שלא טופל.
    function open(session) {
      if (!session.mode) session.mode = defaultMode(session.from, session.to);
      if (!session.statuses) session.statuses = {};
      return new Promise(function (resolve) {
        createWindow(session, resolve);
      });
    }

    function summarize(session) {
      var s = { total: session.titles.length, fixed: 0, skipped: 0, failed: 0 };
      session.titles.forEach(function (title) {
        var st = session.statuses[title];
        if (st === "fixed") s.fixed++;
        else if (st === "skipped") s.skipped++;
        else if (st === "failed") s.failed++;
      });
      s.handled = s.fixed + s.skipped + s.failed;
      s.allDone = s.handled === s.total;
      return s;
    }

    function createWindow(session, resolve) {
      var returnFocus = document.activeElement;
      var page = null;
      var occs = [];
      var cur = 0;
      var decisions = {};
      var occModes = {};
      var busy = false;
      var index = firstUnhandled(-1);
      var inputTimer = null;

      function firstUnhandled(after) {
        for (var i = after + 1; i < session.titles.length; i++) {
          if (!session.statuses[session.titles[i]]) return i;
        }
        return -1;
      }

      function btn(text, cls, handler) {
        return $("<button>", { type: "button", class: "hmk-btn" + (cls ? " " + cls : ""), text: text })
          .on("click", handler);
      }

      // ---- מבנה ----
      var $overlay = $("<div>", { class: "hmk-lf-overlay" });
      var $dialog = $("<div>", {
        class: "hmk-lf",
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": "hmk-lf-title",
        dir: "rtl",
        tabindex: "-1",
      });
      var $title = $("<h2>", { id: "hmk-lf-title", class: "hmk-lf-title", text: STR.linksWindowTitle(session.to) });
      var $pageCounter = $("<span>", { class: "hmk-lf-muted" });
      var $pageLink = $("<a>", { target: "_blank", rel: "noopener" });
      var $wpLink = $("<a>", { target: "_blank", rel: "noopener", class: "hmk-lf-muted" });
      var $head = $("<div>", { class: "hmk-lf-head" }).append($title, $pageCounter, $pageLink, $wpLink);

      var $modeLink = btn(STR.linksModeLink, "", function () { setDefaultMode("link"); });
      var $modeText = btn(STR.linksModeText, "", function () { setDefaultMode("text"); });
      var $modeRow = $("<div>", { class: "hmk-lf-row" }).append(
        $("<strong>", { text: STR.linksDefaultLabel }),
        $("<span>", { class: "hmk-lf-seg" }).append($modeLink, $modeText),
        $("<span>", { class: "hmk-lf-muted hmk-lf-small", text: STR.linksDefaultHint })
      );

      var $occCounter = $("<strong>", { class: "hmk-lf-counter" });
      var $prev = btn(STR.btnPrevOcc, "", function () { move(-1); });
      var $next = btn(STR.btnNextOcc, "", function () { move(1); });
      var $replace = btn(STR.btnReplaceOcc, "", toggleReplace);
      var $skip = btn(STR.btnSkipOcc, "", skipOcc);
      var $replaceAll = btn(STR.btnReplaceAll, "", replaceAll);
      var $occRow = $("<div>", { class: "hmk-lf-row" }).append($occCounter, $prev, $next, $replace, $skip, $replaceAll);

      var $occLink = btn(STR.linksModeLink, "", function () { setOccMode("link"); });
      var $occText = btn(STR.linksModeText, "", function () { setOccMode("text"); });
      var $occSeg = $("<span>", { class: "hmk-lf-occseg" }).append(
        $("<span>", { class: "hmk-lf-muted hmk-lf-small", text: STR.linksOccModeLabel }),
        $("<span>", { class: "hmk-lf-seg" }).append($occLink, $occText)
      );
      var $occNote = $("<span>", { class: "hmk-lf-muted hmk-lf-small" });
      var $occModeRow = $("<div>", { class: "hmk-lf-row hmk-lf-occmode" }).append($occSeg, $occNote);

      var $source = $("<textarea>", { class: "hmk-lf-source", dir: "rtl", spellcheck: "false" });
      var $notice = $("<div>", { class: "hmk-lf-notice", text: STR.linksNoLinkInText });
      var $resultText = $("<div>");
      var $result = $("<div>", { class: "hmk-lf-result" }).append($notice, $resultText);
      var $panes = $("<div>", { class: "hmk-lf-panes" }).append(
        $("<div>", { class: "hmk-lf-pane" }).append(
          $("<div>", { class: "hmk-lf-label", text: STR.linksSourceLabel }),
          $source
        ),
        $("<div>", { class: "hmk-lf-pane hmk-lf-pane-result" }).append(
          $("<div>", { class: "hmk-lf-label", text: STR.linksResultLabel }),
          $result
        )
      );
      var $legend = $("<div>", { class: "hmk-lf-row hmk-lf-small" }).append(
        $("<span>", { class: "hmk-lf-occ hmk-lf-occ-pending", text: STR.linksLegendPending }),
        $("<span>", { class: "hmk-lf-occ hmk-lf-occ-replace", text: STR.linksLegendReplace }),
        $("<span>", { class: "hmk-lf-occ hmk-lf-occ-skip", text: STR.linksLegendSkip })
      );

      var $statusText = $("<span>");
      var $statusAction = btn("", "hmk-btn-quiet", function () {});
      var $status = $("<div>", { class: "hmk-lf-status", role: "status", "aria-live": "polite" }).append(
        $statusText,
        $statusAction
      );

      var $save = btn(STR.btnSaveNext, "hmk-btn-primary", save);
      var $skipPage = btn(STR.btnSkipPage, "", skipPage);
      var $close = btn(STR.btnCloseWindow, "", requestClose);
      var $foot = $("<div>", { class: "hmk-lf-foot" }).append($save, $skipPage, $close);

      var $work = $("<div>", { class: "hmk-lf-work" }).append($modeRow, $occRow, $occModeRow, $panes, $legend);
      $dialog.append($head, $work, $status, $foot);
      $overlay.append($dialog).appendTo(document.body);

      var bodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      $dialog.on("keydown", onKeydown);
      window.addEventListener("beforeunload", onBeforeUnload);
      $source.on("input", function () {
        clearTimeout(inputTimer);
        inputTimer = setTimeout(function () {
          inputTimer = null;
          renderPage();
        }, 300);
      });

      if (index === -1) {
        showSummary();
      } else {
        loadPage();
        $dialog.trigger("focus");
      }

      // ---- מצב ----
      function isDirty() {
        return !!(page && !page.missing && page.original !== null && resultText() !== page.original);
      }

      function stateOf(occ) {
        return decisions[occ.key] || "pending";
      }

      function modeOf(occ) {
        return occModes[occ.key] || session.mode;
      }

      function resultText() {
        var text = $source.val();
        return applyReplacements(
          text,
          page && page.original !== null ? findOccurrences(text, session.from) : [],
          function (occ) { return stateOf(occ) === "replace"; },
          modeOf,
          session.to
        );
      }

      function setStatus(text, tone, action) {
        $status.removeClass("hmk-lf-status-error hmk-lf-status-success");
        if (tone) $status.addClass("hmk-lf-status-" + tone);
        $statusText.text(text || "");
        if (action) {
          $statusAction.text(action.label).off("click").on("click", action.run).show();
        } else {
          $statusAction.off("click").text("").hide();
        }
      }

      // הקלדה שעוד לא עובדה נסרקת לפני כל פעולה, כדי שהפעולה תחול על
      // הטקסט שהעורך רואה.
      function flushInput() {
        if (!inputTimer) return;
        clearTimeout(inputTimer);
        inputTimer = null;
        renderPage();
      }

      function setBusy(value) {
        busy = value;
        renderControls();
      }

      // ---- טעינת דף ----
      function loadPage(keep, message) {
        var title = session.titles[index];
        if (!keep) {
          decisions = {};
          occModes = {};
        }
        cur = 0;
        // סימון כשל שמירה שורד טעינה מחדש של אותו דף (אחרי התנגשות).
        var hadSaveFailure = !!(keep && page && page.title === title && page.saveFailed);
        page = {
          title: title,
          actualTitle: title,
          original: null,
          missing: false,
          redirectTo: null,
          isRedirect: false,
          saveFailed: hadSaveFailure,
        };
        occs = [];
        $source.val("");
        renderHeader();
        setBusy(true);
        setStatus(STR.linksLoading);
        // בלי מעקב אחרי הפניות: הרשימה היא של דפים שקישרו לשם הישן ברגע
        // האיסוף. דף שהפך מאז להפניה אינו הדף שברשימה, ולכן לא נערך.
        localQuery({
          titles: title,
          prop: "info|revisions",
          rvprop: "ids|timestamp|content",
          rvlimit: 1,
          curtimestamp: 1,
          indexpageids: 1,
        })
          .then(function (data) {
            var p = firstPage(data);
            if (!p) throw structureError(STR.linksPageStructure);
            page.actualTitle = p.title;
            if ("missing" in p) {
              page.missing = true;
              setStatus(STR.linksPageMissing, "error");
            } else if ("redirect" in p) {
              var redirectRev = p.revisions && p.revisions[0];
              if (!redirectRev || !("*" in redirectRev)) throw structureError(STR.linksPageStructure);
              page.isRedirect = true;
              page.redirectTo = cleanTitle(parseRedirectLine(redirectRev["*"]).target);
              var targetUrl = mw.util.getUrl(page.redirectTo);
              setStatus(STR.linksPageIsRedirectTo(page.redirectTo), null, {
                label: STR.btnOpenRedirectTarget,
                run: function () { window.open(targetUrl, "_blank", "noopener"); },
              });
            } else {
              var rev = p.revisions && p.revisions[0];
              if (!rev || !("*" in rev) || !rev.timestamp) throw structureError(STR.linksPageStructure);
              page.original = rev["*"];
              page.timestamp = rev.timestamp;
              page.start = data.curtimestamp;
              page.wikipedia = wikipediaTitleFor(page.actualTitle, page.original);
              $source.val(page.original);
              setStatus(message || "", message ? "success" : null);
            }
            busy = false;
            renderHeader();
            renderPage();
          })
          .catch(function (err) {
            if (err && err.silent) return;
            busy = false;
            renderPage();
            setStatus(actionErrorMessage(STR.linksLoadPageFailed, err), "error", {
              label: STR.linksBtnRetry,
              run: function () { loadPage(true); },
            });
          });
      }

      // שם הדף בוויקיפדיה: משדה הדף בתבנית "מיון ויקיפדיה" של הדף עצמו.
      // בלי שדה כזה - המרת השם היוריסטית, והקישור מסומן כמשוער.
      function wikipediaTitleFor(title, wikitext) {
        var pageField = extractTemplateFields(wikitext)["דף"];
        var field = pageField ? cleanTitle(pageField) : null;
        return field ? { title: field, guessed: false } : { title: toWikipediaTitle(title), guessed: true };
      }

      // ---- ציור ----
      function renderHeader() {
        $pageCounter.text(STR.linksPageCounter(index + 1, session.titles.length));
        $pageLink
          .text(page.actualTitle)
          .attr("href", mw.util.getUrl(page.actualTitle, page.isRedirect ? { redirect: "no" } : undefined));
        if (page.wikipedia) {
          $wpLink
            .text(page.wikipedia.guessed ? STR.linksWikipediaGuessed : STR.linksWikipedia)
            .attr("href", wikipediaUrl(page.wikipedia.title))
            .show();
        } else {
          $wpLink.hide();
        }
      }

      function renderPage() {
        var text = $source.val();
        occs = page && page.original !== null ? findOccurrences(text, session.from) : [];
        if (cur >= occs.length) cur = Math.max(0, occs.length - 1);
        $resultText.empty();
        var pos = 0;
        occs.forEach(function (occ, i) {
          $resultText.append(document.createTextNode(text.slice(pos, occ.start)));
          var state = stateOf(occ);
          var $occ = $("<span>", {
            class: "hmk-lf-occ hmk-lf-occ-" + state + (i === cur ? " hmk-lf-occ-current" : ""),
            text: state === "replace" ? replacementFor(occ, session.to, modeOf(occ)) : occ.raw,
          }).on("click", function () {
            cur = i;
            setStatus("");
            renderPage();
            scrollToCurrent();
          });
          $resultText.append($occ);
          pos = occ.end;
        });
        $resultText.append(document.createTextNode(text.slice(pos)));
        $notice.toggle(!!(page && page.original !== null && !occs.length));
        renderControls();
      }

      function renderControls() {
        var loaded = !!(page && page.original !== null);
        var occ = occs[cur];
        $occCounter.text(occs.length ? STR.linksOccCounter(cur + 1, occs.length) : STR.linksNoOcc);
        $replace.text(occ && stateOf(occ) === "replace" ? STR.btnUnreplaceOcc : STR.btnReplaceOcc);
        [$prev, $next, $replace, $skip, $replaceAll].forEach(function ($b) {
          $b.prop("disabled", busy || !occs.length);
        });
        $modeLink.attr("aria-pressed", String(session.mode === "link")).prop("disabled", busy);
        $modeText.attr("aria-pressed", String(session.mode === "text")).prop("disabled", busy);
        var bare = !!(occ && occ.bare);
        $occSeg.css("visibility", bare ? "visible" : "hidden");
        if (bare) {
          $occLink.attr("aria-pressed", String(modeOf(occ) === "link")).prop("disabled", busy);
          $occText.attr("aria-pressed", String(modeOf(occ) === "text")).prop("disabled", busy);
        }
        $occNote.text(occ && !bare ? STR.linksOccPiped : occ && occModes[occ.key] ? STR.linksOccOverrides : "");
        $source.prop("readonly", busy || !loaded);
        $save.prop("disabled", busy || !loaded || !isDirty());
        $skipPage.prop("disabled", busy);
        $close.prop("disabled", busy);
      }

      // תיבת העריכה נגללת למופע בלי לקבל מיקוד, כדי שהמיקוד יישאר על
      // הכפתור שנלחץ. המיקום נמדד בעותק נסתר של הטקסט באותו עיצוב.
      function scrollToCurrent() {
        var occ = occs[cur];
        if (!occ) return;
        var ta = $source[0];
        var cs = window.getComputedStyle(ta);
        var mirror = document.createElement("div");
        [
          "fontSize", "fontFamily", "lineHeight", "letterSpacing", "direction",
          "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
          "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth", "boxSizing",
        ].forEach(function (p) { mirror.style[p] = cs[p]; });
        mirror.style.width = ta.clientWidth + "px";
        mirror.style.position = "absolute";
        mirror.style.visibility = "hidden";
        mirror.style.top = "0";
        mirror.style.whiteSpace = "pre-wrap";
        mirror.style.overflowWrap = "break-word";
        mirror.style.borderStyle = "solid";
        mirror.textContent = ta.value.slice(0, occ.start);
        var marker = document.createElement("span");
        marker.textContent = "|";
        mirror.appendChild(marker);
        document.body.appendChild(mirror);
        var top = marker.offsetTop;
        document.body.removeChild(mirror);
        ta.scrollTop = Math.max(0, top - ta.clientHeight / 3);

        var $current = $result.find(".hmk-lf-occ-current");
        if ($current.length) {
          var box = $result[0];
          var offset = $current[0].offsetTop;
          if (offset < box.scrollTop || offset > box.scrollTop + box.clientHeight - 20) {
            box.scrollTop = Math.max(0, offset - box.clientHeight / 3);
          }
        }
      }

      // ---- פעולות על מופעים ----
      function move(step) {
        flushInput();
        if (!occs.length) return;
        var target = cur + step;
        if (target < 0) { setStatus(STR.linksFirstOcc); return; }
        if (target >= occs.length) { setStatus(STR.linksLastOcc); return; }
        cur = target;
        setStatus("");
        renderPage();
        scrollToCurrent();
      }

      // אחרי החלפה או דילוג: קדימה בלבד, בלי קפיצה אחורה.
      function advance() {
        for (var i = cur + 1; i < occs.length; i++) {
          if (stateOf(occs[i]) === "pending") {
            cur = i;
            setStatus("");
            return;
          }
        }
        var earlier = occs.slice(0, cur).some(function (occ) { return stateOf(occ) === "pending"; });
        setStatus(STR.linksNoPendingAfter + (earlier ? " " + STR.linksPendingEarlier : ""));
      }

      function toggleReplace() {
        flushInput();
        var occ = occs[cur];
        if (!occ || busy) return;
        if (stateOf(occ) === "replace") {
          decisions[occ.key] = "pending";
          setStatus("");
        } else {
          decisions[occ.key] = "replace";
          advance();
        }
        renderPage();
        scrollToCurrent();
      }

      function skipOcc() {
        flushInput();
        var occ = occs[cur];
        if (!occ || busy) return;
        decisions[occ.key] = "skip";
        advance();
        renderPage();
        scrollToCurrent();
      }

      function replaceAll() {
        flushInput();
        if (!occs.length || busy) return;
        occs.forEach(function (occ) { decisions[occ.key] = "replace"; });
        renderPage();
        setStatus(STR.linksAllMarked);
      }

      function setDefaultMode(mode) {
        if (busy) return;
        session.mode = mode;
        renderPage();
      }

      function setOccMode(mode) {
        var occ = occs[cur];
        if (!occ || !occ.bare || busy) return;
        occModes[occ.key] = mode;
        renderPage();
      }

      // ---- שמירה ----
      function save() {
        flushInput();
        if (busy || !isDirty()) return;
        var pending = findOccurrences($source.val(), session.from).filter(function (occ) {
          return stateOf(occ) === "pending";
        }).length;
        if (pending && !window.confirm(STR.linksPendingConfirm(pending))) return;
        var text = resultText();
        setBusy(true);
        setStatus(STR.linksSaving);
        api
          .postWithToken("csrf", {
            action: "edit",
            format: "json",
            title: page.actualTitle,
            text: text,
            summary: STR.linksSummary(session.to, session.from),
            minor: 1,
            bot: 1,
            nocreate: 1,
            basetimestamp: page.timestamp,
            starttimestamp: page.start,
          })
          .then(
            function (data) {
              var edit = data && data.edit;
              if (!edit || edit.result !== "Success") {
                busy = false;
                renderControls();
                saveFailed("unknown", data);
                return;
              }
              session.statuses[page.title] = "fixed";
              page.original = text;
              busy = false;
              goNext("nochange" in edit ? STR.linksNoChange : STR.linksSavedNext);
            },
            function (code, result) {
              busy = false;
              renderControls();
              saveFailed(code, result);
            }
          );
      }

      function saveFailed(code, result) {
        var info = result && result.error && result.error.info;
        // כל כשל, כולל התנגשות ורשת: דילוג אחר כך נספר כנכשל.
        page.saveFailed = true;
        if (code === "editconflict") {
          setStatus(STR.linksConflict, "error", { label: STR.btnReload, run: reloadAfterConflict });
          return;
        }
        if (code === "missingtitle" || code === "pagedeleted") {
          setStatus(STR.linksPageMissing, "error");
          return;
        }
        if (code === "http") {
          setStatus(STR.linksNetworkFailed, "error", { label: STR.linksBtnRetry, run: save });
          return;
        }
        setStatus(actionErrorMessage(STR.linksSaveFailed, { message: info || code }), "error", {
          label: STR.linksBtnRetry,
          run: save,
        });
      }

      // ההחלטות על המופעים נשמרות לפי המפתח; שינויים ידניים אובדים.
      function reloadAfterConflict() {
        if ($source.val() !== page.original && !window.confirm(STR.linksReloadConfirm)) return;
        loadPage(true);
      }

      // ---- מעבר בין דפים ----
      function skipPage() {
        flushInput();
        if (busy) return;
        if (isDirty() && !window.confirm(STR.linksLeaveConfirm)) return;
        session.statuses[page.title] = page.saveFailed ? "failed" : "skipped";
        goNext("");
      }

      function goNext(message) {
        var nextIndex = firstUnhandled(index);
        if (nextIndex === -1) {
          showSummary();
          return;
        }
        index = nextIndex;
        loadPage(false, message);
      }

      function showSummary() {
        page = null;
        var s = summarize(session);
        $work.empty();
        $head.find("a").hide();
        $pageCounter.text("");
        $save.hide();
        $skipPage.hide();
        setStatus("");
        $work.append(
          $("<h3>", { class: "hmk-lf-summary-title", text: STR.linksSummaryTitle }),
          $("<p>", { text: STR.linkFixesSummary(s) })
        );
        appendTitleList(STR.linksSkippedList, "skipped");
        appendTitleList(STR.linksFailedList, "failed");
        if (session.more) {
          $work.append($("<p>", { class: "hmk-lf-muted", text: STR.linkFixesMore(session.titles.length) }));
        }
        $close.trigger("focus");
      }

      function appendTitleList(label, status) {
        var titles = session.titles.filter(function (t) { return session.statuses[t] === status; });
        if (!titles.length) return;
        var $list = $("<ul>");
        titles.forEach(function (t) {
          $list.append($("<li>").append($("<a>", { href: mw.util.getUrl(t), target: "_blank", rel: "noopener", text: t })));
        });
        $work.append($("<p>", { text: label }), $list);
      }

      // ---- סגירה, מקלדת ועזיבת דף ----
      function requestClose() {
        if (busy) return;
        flushInput();
        if (isDirty() && !window.confirm(STR.linksLeaveConfirm)) return;
        clearTimeout(inputTimer);
        window.removeEventListener("beforeunload", onBeforeUnload);
        document.body.style.overflow = bodyOverflow;
        $overlay.remove();
        if (returnFocus && typeof returnFocus.focus === "function" && document.contains(returnFocus)) {
          returnFocus.focus();
        }
        resolve(summarize(session));
      }

      function onBeforeUnload(event) {
        if (!isDirty()) return;
        event.preventDefault();
        event.returnValue = "";
      }

      // מקש היציאה סוגר; המיקוד נשאר בתוך החלון כל עוד הוא פתוח.
      function onKeydown(event) {
        if (event.key === "Escape") {
          event.preventDefault();
          requestClose();
          return;
        }
        if (event.key !== "Tab") return;
        var focusable = $dialog.find("button:visible:not(:disabled), textarea:visible, a:visible").filter(function () {
          return $(this).css("visibility") !== "hidden" && !$(this).closest("[style*='visibility: hidden']").length;
        });
        if (!focusable.length) return;
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    // ================================================================
    // 3. עיצוב - מוזרק מהמודול, כדי שלא ייטען לכל משתמש בכל דף
    // ================================================================
    function injectStyles() {
      if (document.getElementById("hmk-lf-styles")) return;
      var css = [
        ".hmk-lf-overlay{position:fixed;inset:0;z-index:1100;background:rgba(0,0,0,.45);display:flex;",
        "align-items:center;justify-content:center;padding:2vh 2vw;box-sizing:border-box}",
        ".hmk-lf{direction:rtl;width:min(1400px,96vw);height:92vh;display:flex;flex-direction:column;gap:.5rem;",
        "box-sizing:border-box;padding:.75rem 1rem;background:#fff;color:#202122;border:1px solid #c8ccd1;",
        "border-radius:8px;font-size:.875rem;line-height:1.5}",
        ".hmk-lf-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:.3rem 1rem;",
        "border-bottom:1px solid #eaecf0;padding-bottom:.5rem}",
        ".hmk-lf-title{font-size:1.05rem;font-weight:600;margin:0;padding:0;border:0;font-family:inherit}",
        ".hmk-lf-muted{color:#54595d}.hmk-lf-small{font-size:.8125rem}",
        ".hmk-lf-work{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;gap:.45rem;overflow:auto}",
        ".hmk-lf-row{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem}",
        ".hmk-lf-counter{min-width:7em}",
        ".hmk-lf-seg{display:inline-flex;border:1px solid #a2a9b1;border-radius:6px;overflow:hidden}",
        ".hmk-lf-seg .hmk-btn{border:0;border-radius:0}",
        ".hmk-lf-seg .hmk-btn[aria-pressed='true']{background:#eaf3ff;color:#3366cc}",
        ".hmk-lf-occseg{display:inline-flex;align-items:center;gap:.4rem}",
        ".hmk-lf-occmode{min-height:2rem}",
        ".hmk-lf-panes{flex:1 1 auto;min-height:12rem;display:grid;",
        "grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:.6rem}",
        ".hmk-lf-pane{display:flex;flex-direction:column;min-height:0;border:1px solid #c8ccd1;",
        "border-radius:6px;padding:.4rem}",
        ".hmk-lf-label{font-size:.8125rem;color:#54595d;margin:0 0 .25rem}",
        ".hmk-lf-source{flex:1 1 auto;min-height:0;width:100%;box-sizing:border-box;resize:none;",
        "font:inherit;font-size:.8125rem;line-height:1.6;direction:rtl}",
        ".hmk-lf-result{flex:1 1 auto;min-height:0;overflow:auto;position:relative;white-space:pre-wrap;",
        "overflow-wrap:break-word;font-size:.8125rem;line-height:1.6}",
        ".hmk-lf-occ{border-radius:3px;padding:0 1px;cursor:pointer}",
        ".hmk-lf-occ-pending{background:#fef6e7;color:#6b4b00}",
        ".hmk-lf-occ-replace{background:#e6f4ea;color:#14532d}",
        ".hmk-lf-occ-skip{background:#f1f3f4;color:#72777d;text-decoration:line-through}",
        ".hmk-lf-occ-current{outline:2px solid #3366cc}",
        ".hmk-lf-notice{white-space:normal;background:#fef6e7;border:1px solid #f0d8a8;border-radius:4px;",
        "padding:.3rem .5rem;margin-bottom:.4rem}",
        ".hmk-lf-status{min-height:1.6em;font-size:.8125rem;color:#54595d;display:flex;align-items:center;gap:.4rem}",
        ".hmk-lf-status-error{color:#d33}.hmk-lf-status-success{color:#14866d}",
        ".hmk-lf-foot{display:flex;gap:.5rem;border-top:1px solid #eaecf0;padding-top:.5rem}",
        ".hmk-lf-summary-title{font-size:1rem;margin:.25rem 0}",
        "@media (max-width:720px){.hmk-lf{width:100vw;height:96vh}",
        ".hmk-lf-panes{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr) minmax(0,1fr)}",
        ".hmk-lf-pane-result{order:-1}}",
        "html.skin-theme-clientpref-night .hmk-lf{background:#1f2023;color:#e3e3e3;border-color:#3c4043}",
        "html.skin-theme-clientpref-night .hmk-lf-head,html.skin-theme-clientpref-night .hmk-lf-foot{border-color:#3c4043}",
        "html.skin-theme-clientpref-night .hmk-lf-pane{border-color:#3c4043}",
        "html.skin-theme-clientpref-night .hmk-lf-muted,html.skin-theme-clientpref-night .hmk-lf-label,",
        "html.skin-theme-clientpref-night .hmk-lf-status{color:#b7b7b7}",
        "html.skin-theme-clientpref-night .hmk-lf-source{background:#1f2023;color:#e3e3e3;border-color:#3c4043}",
        "html.skin-theme-clientpref-night .hmk-lf-occ-pending{background:rgba(250,199,117,.18);color:#fac775}",
        "html.skin-theme-clientpref-night .hmk-lf-occ-replace{background:rgba(93,202,165,.18);color:#9fe1cb}",
        "html.skin-theme-clientpref-night .hmk-lf-occ-skip{background:rgba(255,255,255,.06);color:#9aa0a6}",
        "html.skin-theme-clientpref-night .hmk-lf-occ-current{outline-color:#8ab4f8}",
        "html.skin-theme-clientpref-night .hmk-lf-notice{background:rgba(250,199,117,.12);border-color:rgba(250,199,117,.35)}",
        "html.skin-theme-clientpref-night .hmk-lf-seg{border-color:#5f6368}",
        "html.skin-theme-clientpref-night .hmk-lf-seg .hmk-btn[aria-pressed='true']{background:rgba(138,180,248,.18);color:#8ab4f8}",
      ].join("");
      var style = document.createElement("style");
      style.id = "hmk-lf-styles";
      style.textContent = css;
      document.head.appendChild(style);
    }

    return {
      open: open,
      // לבדיקות: הפונקציות הטהורות, בלי ממשק
      findOccurrences: findOccurrences,
      replacementFor: replacementFor,
      applyReplacements: applyReplacements,
      defaultMode: defaultMode,
      summarize: summarize,
    };
  };
})();
