(function () {
  "use strict";

  window.HMK_PAGE_TOOL_CARD_FACTORY = function (runtime) {
    var STR = runtime.STR;
    var MAX_CHAIN_DEPTH = runtime.MAX_CHAIN_DEPTH;
    var normalizeTitle = runtime.normalizeTitle;
    var filterAndSortLog = runtime.filterAndSortLog;
    var fetchLocalPageData = runtime.fetchLocalPageData;
    var wpQuery = runtime.wpQuery;
    var localQuery = runtime.localQuery;
    var firstPage = runtime.firstPage;
    var netGet = runtime.netGet;
    var structureError = runtime.structureError;
    var toolContainer = runtime.toolContainer;
    var clearTool = runtime.clearTool;
    var replaceWikipediaSortPageField = runtime.replaceWikipediaSortPageField;
    var userCapabilities = runtime.userCapabilities;
    var userCapabilitiesLoadFailed = runtime.userCapabilitiesLoadFailed;
    var toWikipediaTitle = runtime.toWikipediaTitle;
    var toLocalTitle = runtime.toLocalTitle;
    var api = new mw.Api();
    var currentPageName = mw.config.get("wgPageName").replace(/_/g, " ");
    var actionReason = "השוואה לוויקיפדיה העברית";

    // ההפניות אל הדף, כפי שנאספו בצ'ק־ליסט לפני פעולה. כרטיס ההצלחה
    // משתמש בהן כדי להציע לעדכן אותן אל השם החדש.
    var redirectsToFix = null;
    // הדפים שמקשרים ישירות אל הדף, מאותו צ'ק־ליסט. אחרי העברה בלי הפניה
    // כרטיס ההצלחה מציע לתקן בהם את הקישורים, בחלון התיקון.
    var directLinksToFix = null;
    // השם בוויקיפדיה לכל יעד מקומי שהוצע. שדה דף בתבנית שומר תמיד את
    // שם ויקיפדיה, גם כשהדף במכלול נקרא לפי כללי השמות המקומיים.
    var wikipediaTitleForTarget = {};

    // כל הכפתורים נגזרים מיכולות המשתמש, לא משמות קבוצות.
    function can(capability) {
      return !!userCapabilities[capability];
    }

    // תיקון קישורים ישירים זמין רק לחברי הקבוצה "bot". זו הגבלת ממשק, לא
    // הרשאה: השמירה עצמה עוברת בהרשאות העריכה הרגילות של המשתמש.
    function isBotUser() {
      return (mw.config.get("wgUserGroups") || []).indexOf("bot") !== -1;
    }

    function canMove(suppressRedirect) {
      return suppressRedirect
        ? can("moveWithoutRedirect")
        : can("moveWithRedirect");
    }

    var sameTitle = runtime.sameTitle;

    function withoutFragment(title) {
      return String(title || "").split("#")[0];
    }

    // ---- הפניות במכלול ----

    // מפענח שורת ההפניה יושב בליבה, כי גם מודול ההפניות מוויקיפדיה
    // צריך אותו, בערך קיים שבו שכבת הכרטיס לא נטענת.
    var parseRedirectLine = runtime.parseRedirectLine;

    // עדכון יעד של דף הפניה, דרך עוזר העריכה שכותב על בסיס הגרסה הנוכחית.
    // options.fragment: לא מוגדר = שמירת הפסקה הקיימת. options.expectTarget:
    // אם ההפניה כבר מובילה למקום אחר, לא כותבים כלום.
    function retargetRedirect(title, newTarget, options) {
      return api.edit(title, function (revision) {
        var content = revision.content;
        var parsed = parseRedirectLine(content);
        var err;
        if (!parsed) {
          err = new Error(STR.retargetNoLine);
          err.code = "redirect-line-not-found";
          throw err;
        }
        if (options.expectTarget && !sameTitle(parsed.target, options.expectTarget)) {
          err = new Error(STR.retargetChanged);
          err.code = "redirect-changed";
          throw err;
        }
        var fragment = options.fragment === undefined ? parsed.fragment : options.fragment;
        var m = parsed.match;
        var line = m[1] + newTarget + (fragment ? "#" + fragment : "") + m[5];
        return {
          text: content.slice(0, m.index) + line + content.slice(m.index + m[0].length),
          summary: STR.retargetSummary(newTarget),
          minor: true,
          bot: true,
        };
      });
    }

    // שרשרת ההפניה במכלול, כפי שהשרת פותר אותה.
    function resolveLocalChain(title) {
      return localQuery({ titles: title, redirects: 1, prop: "info", indexpageids: 1 }).then(
        function (data) {
          var page = firstPage(data);
          if (!page) throw structureError("יעד ההפניה במכלול");
          var hops = (data.query && data.query.redirects) || [];
          return {
            hops: hops,
            finalTitle: page.title,
            finalMissing: "missing" in page,
            // דף סופי שהוא עדיין הפניה: לולאה או שרשרת שלא נפתרה.
            finalIsRedirect: "redirect" in page,
          };
        }
      );
    }

    function chainEndsInArticle(chain) {
      return !chain.finalMissing && !chain.finalIsRedirect;
    }

    // השם הסופי במכלול אם הוא מוביל לערך קיים, אחרת null.
    function resolveLocalArticle(title) {
      return resolveLocalChain(title).then(function (chain) {
        return chainEndsInArticle(chain) ? chain.finalTitle : null;
      });
    }

    // לאן הועבר במכלול דף שאינו קיים עוד, לפי יומן ההעברות. ממשיכים אחרי
    // העברות רצופות, עד מגבלת עומק.
    function followLocalMoves(title, depth) {
      depth = depth || 0;
      if (depth >= MAX_CHAIN_DEPTH) return Promise.resolve(null);
      return localQuery({
        list: "logevents",
        letype: "move",
        letitle: title,
        lelimit: 1,
        leprop: "title|details|timestamp",
      }).then(function (data) {
        var events = data.query && data.query.logevents;
        if (!Array.isArray(events)) throw structureError("יומן ההעברות במכלול");
        var ev = events[0];
        var movedTo = ev && ev.params && ev.params.target_title;
        if (!movedTo) return null;
        return resolveLocalChain(movedTo).then(function (chain) {
          if (chainEndsInArticle(chain)) return chain.finalTitle;
          if (chain.finalMissing) return followLocalMoves(chain.finalTitle, depth + 1);
          return null;
        });
      });
    }


    // עזרי תצוגה ובדיקות-משנה: נטענים רק כאשר באמת נדרש כרטיס.

    // מצב חזותי של קישור מקומי נדרש גם לפני טעינת התצוגה המקדימה,
    // ולכן נשאר בשכבת הכרטיס. כל שאר מנגנון הריחוף נטען רק לפי דרישה.
    function applyLocalLinkStatus($link, title, status, linkDestination) {
      linkDestination = linkDestination || title;
      $link.removeClass("new mw-redirect hmk-link-unchecked");
      if (status === "unchecked") {
        $link.addClass("hmk-link-unchecked");
        return;
      }
      if (status !== "missing" && status !== "redirect" && status !== "article") {
        return;
      }
      if (status === "missing") {
        $link
          .addClass("new")
          .attr("href", mw.util.getUrl(title, { action: "edit", redlink: 1 }));
        return;
      }
      if (status === "redirect") $link.addClass("mw-redirect");
      $link.attr("href", localPageUrl(linkDestination));
    }


    // מודול עזר שנטען רק בשימוש הראשון; כשל טעינה ינוסה שוב בפעם הבאה.
    function lazyFeature(suffix, globalName, deps) {
      return runtime.cached(function () {
        return runtime.loadScript(suffix, globalName).then(function () {
          return window[globalName](runtime, deps);
        });
      });
    }

    var loadPreviewFeature = lazyFeature(".preview.js", "HMK_PAGE_TOOL_PREVIEW_FACTORY", {
      applyLocalLinkStatus: applyLocalLinkStatus,
    });

    function bindLocalPreview($link, title, linkDestination) {
      linkDestination = linkDestination || title;
      $link.addClass("hmk-preview-link");
      var active = false;
      var bound = false;

      function activate() {
        active = true;
        if (bound) return;
        loadPreviewFeature()
          .then(function (preview) {
            if (bound) return;
            bound = true;
            $link.off(".hmkPreviewLoader");
            preview.bindLocalPreview($link, title, active, linkDestination);
          })
          .catch(function () {
            // תצוגה מקדימה היא יכולת עזר בלבד; כשל טעינה אינו פוגע בקישור.
          });
      }

      function deactivate() {
        active = false;
      }

      $link.on("mouseenter.hmkPreviewLoader focusin.hmkPreviewLoader", activate);
      $link.on("mouseleave.hmkPreviewLoader focusout.hmkPreviewLoader", deactivate);
      return $link;
    }

    var loadDetailsFeature = lazyFeature(".details.js", "HMK_PAGE_TOOL_DETAILS_FACTORY", {
      can: can,
      fetchMechalolBacklinks: fetchMechalolBacklinks,
      sourceFailureText: sourceFailureText,
      wikipediaUrl: wikipediaUrl,
      redirectDestination: redirectDestination,
    });

    var loadLinksFeature = lazyFeature(".links.js", "HMK_PAGE_TOOL_LINKS_FACTORY", {
      actionErrorMessage: actionErrorMessage,
      wikipediaUrl: wikipediaUrl,
      toWikipediaTitle: toWikipediaTitle,
      extractTemplateFields: runtime.extractTemplateFields,
    });

    // מצב הפניה בוויקיפדיה: כשל הוא מצב שלישי מפורש, לא "לא".
    function wpRedirectTarget(title) {
      return wpQuery({
        titles: title,
        redirects: 1,
        prop: "info",
        indexpageids: 1,
      })
        .then(function (data) {
          var page = firstPage(data);
          var redirs = data.query && data.query.redirects;
          var isRedirect = !!(redirs && redirs.length);
          if (!page) throw structureError("מצב הפניה");
          var missing = "missing" in page;
          return {
            exists: isRedirect ? true : !missing,
            redirect: isRedirect,
            target: isRedirect ? redirs[0].to : null,
            failed: false,
          };
        })
        .catch(function (err) {
          if (err && err.silent) throw err;
          return { exists: null, redirect: null, target: null, failed: true };
        });
    }

    // דפים מקשרים, בשלוש שאילתות נפרדות ומקבילות: קישורים ממרחב הערכים,
    // קישורים ממרחב התבניות, והפניות במרחב הערכים. לכל קבוצה מכסה משלה
    // וסימן "יש עוד" משלה, כך שתבניות לא גוזלות מקום מהערכים שנכנסים לחלון
    // התיקון, וסימן "יש עוד" אמיתי לכל קבוצה. בכשל count=null, כך שאפס
    // אמיתי נשאר מובחן מ"לא נבדק"; כשל באחת השאילתות הופך את כל הבדיקה
    // ל"לא נבדק".
    function fetchBacklinksGroup(title, filterRedirects, namespaces) {
      return localQuery({
        list: "backlinks",
        bltitle: title,
        blnamespace: namespaces,
        blfilterredir: filterRedirects,
        bllimit: "max",
      }).then(function (data) {
        if (!data.query || !Array.isArray(data.query.backlinks)) {
          throw structureError("דפים מקשרים");
        }
        return {
          links: data.query.backlinks.map(function (link) {
            return { title: link.title };
          }),
          more: !!data.continue,
        };
      });
    }

    // תבניות שמקשרות לדף מוצגות כעובדה: הכלי לא מנחש אילו ערכים מקבלים
    // את הקישור מהן. גם תבנית שרק מכלילה תבנית מקשרת תופיע כאן.
    function fetchMechalolBacklinks(title) {
      return Promise.all([
        fetchBacklinksGroup(title, "nonredirects", 0),
        fetchBacklinksGroup(title, "nonredirects", 10),
        fetchBacklinksGroup(title, "redirects", 0),
      ])
        .then(function (groups) {
          var directGroup = groups[0];
          var templateGroup = groups[1];
          var redirects = groups[2];
          var titlesOf = function (group) {
            return group.links.map(function (l) { return l.title; });
          };
          var direct = titlesOf(directGroup);
          var templates = titlesOf(templateGroup);
          var items = templates
            .map(function (t) { return { title: t, redirect: false, template: true }; })
            .concat(direct.map(function (t) { return { title: t, redirect: false }; }))
            .concat(redirects.links.map(function (l) { return { title: l.title, redirect: true }; }));
          return {
            count: items.length,
            directCount: direct.length,
            templateCount: templates.length,
            redirectCount: redirects.links.length,
            directMore: directGroup.more,
            templateMore: templateGroup.more,
            redirectMore: redirects.more,
            more: directGroup.more || templateGroup.more || redirects.more,
            items: items,
            failed: false,
          };
        })
        .catch(function (err) {
          if (err && err.silent) throw err;
          return {
            count: null,
            directCount: null,
            templateCount: null,
            redirectCount: null,
            directMore: false,
            templateMore: false,
            redirectMore: false,
            more: false,
            items: [],
            failed: true,
          };
        });
    }

    // שליפת יומן לתצוגה: אם רק אחד מסוגי-האירועים נכשל, מחזירים את מה
    // שכן נבדק ומסמנים שהיומן חלקי. כך מערך ריק אינו מתחזה ליומן מלא.
    function fetchMoveDeleteLog(title, sinceTs) {
      function byType(type) {
        return runtime.fetchLog(title, type, sinceTs)
          .then(function (events) {
            return { events: events, failed: false, type: type };
          })
          .catch(function (err) {
            if (err && err.silent) throw err;
            return { events: [], failed: true, type: type };
          });
      }

      return Promise.all([byType("move"), byType("delete")]).then(function (r) {
        var failedTypes = r.filter(function (x) { return x.failed; }).map(function (x) { return x.type; });
        return {
          events: filterAndSortLog(r[0].events.concat(r[1].events), sinceTs),
          partial: failedTypes.length > 0,
          failedTypes: failedTypes,
        };
      });
    }

    // שחזור רצף העברות לצורכי תצוגה בלבד. השחזור נשען על היומן עצמו
    // ולא על מצב הכותרת כיום, כדי שהפניה שנוצרה מאוחר יותר לא תסתיר
    // את אירוע ההעברה ההיסטורי ואת השאלה אם נוצרה בו הפניה.
    function fetchMoveChainForDisplay(title, finalTarget, sinceTs, depth, seen) {
      var normalized = normalizeTitle(title);
      if (depth > MAX_CHAIN_DEPTH || seen.has(normalized)) {
        return Promise.resolve({ events: [], partial: false });
      }
      seen.add(normalized);

      return fetchMoveDeleteLog(title, sinceTs).then(function (data) {
        var moveEvent = null;
        for (var i = 0; i < data.events.length; i++) {
          var ev = data.events[i];
          if (
            ev.type === "move" &&
            ev.params &&
            ev.params.target_title
          ) {
            moveEvent = ev;
            break;
          }
        }

        if (!moveEvent) return data;
        var nextTitle = moveEvent.params.target_title;
        if (
          finalTarget &&
          sameTitle(nextTitle, finalTarget)
        ) {
          return data;
        }

        return fetchMoveChainForDisplay(
          nextTitle,
          finalTarget,
          sinceTs,
          depth + 1,
          seen
        ).then(function (next) {
          return {
            events: filterAndSortLog(data.events.concat(next.events), sinceTs),
            partial: data.partial || next.partial,
          };
        });
      });
    }

    // המרת אירוע-יומן (בין אם נצבר במעקב ובין אם נשלף) לשורת-רצף אחידה
    function normalizeLogEvent(ev) {
      var target =
        ev.params && ev.params.target_title ? ev.params.target_title : null;
      var suppressRedirect =
        ev.type === "move" &&
        ev.params &&
        Object.prototype.hasOwnProperty.call(ev.params, "suppressredirect");
      return {
        type: ev.type,
        user: ev.user || null,
        timestamp: ev.timestamp,
        comment: ev.comment || "",
        target: ev.type === "move" ? target : null,
        suppressRedirect: suppressRedirect,
      };
    }

    // השוואת זהות בין הדף הנוכחי לדף-היעד לפי פריט= (ויקינתונים) - יציב לשמות
    function describeIdentity(currentFields, targetFields) {
      var a = currentFields && currentFields["פריט"];
      var b = targetFields && targetFields["פריט"];
      if (!a || !b) {
        return { verdict: "unknown", text: STR.identityUnknown };
      }
      if (a.trim() === b.trim()) {
        return { verdict: "same", text: STR.identitySame(a.trim()) };
      }
      return {
        verdict: "different",
        text: STR.identityDifferent(b.trim(), a.trim()),
      };
    }


    var ICONS = {
      notice:
        "M10 0a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15H9V9h2v6zm0-8H9V5h2v2z",
      warning:
        "M11.53 2.3A1.85 1.85 0 0 0 10 1.21 1.85 1.85 0 0 0 8.47 2.3L.36 16.36C-.48 17.81.21 19 1.88 19h16.24c1.67 0 2.36-1.19 1.52-2.64zM11 16H9v-2h2v2zm0-4H9V7h2v5z",
      error:
        "M10 0a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm5 13.59L13.59 15 10 11.41 6.41 15 5 13.59 8.59 10 5 6.41 6.41 5 10 8.59 13.59 5 15 6.41 11.41 10 15 13.59z",
      success:
        "M10 0a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm5.6 5.9-7.1 9.2L4 11.5l1.2-1.5 3 2.4 5.9-7.6 1.5 1.5z",
    };

    function iconSvg(type) {
      return (
        '<svg class="hmk-icon" viewBox="0 0 20 20" aria-hidden="true">' +
        '<path d="' +
        (ICONS[type] || ICONS.notice) +
        '"/></svg>'
      );
    }

    function makeAction(label, style, onClick, href) {
      return {
        label: label,
        style: style || "",
        onClick: onClick || null,
        href: href || null,
      };
    }

    /**
     * opts: { type, title, html, actions:[{label, style, onClick|href}] }
     */
    function actionControl(action, rendered) {
      var cls = "hmk-btn" + (action.style ? " hmk-btn-" + action.style : "");
      var $control = action.href
        ? $("<a>", { class: cls, text: action.label, href: action.href })
        : $("<button>", { class: cls, type: "button", text: action.label });
      if (action.onClick) {
        $control.on("click", function (event) {
          action.onClick(event, rendered);
        });
      }
      return $control;
    }

    function showCard(opts) {
      var type = opts.type;
      var $card = $("<div>", { class: "hmk-card hmk-card-" + type, dir: "rtl" });
      $card.append(iconSvg(type));

      var $body = $("<div>", { class: "hmk-body" });
      if (opts.title) {
        $body.append($("<div>", { class: "hmk-title", text: opts.title }));
      }
      var $text = $("<div>", { class: "hmk-text" });
      if (opts.html) $text.html(opts.html);
      $body.append($text);

      var $status = $("<div>", {
        class: "hmk-action-status",
        role: "status",
        "aria-live": "polite",
      }).hide();
      $body.append($status);

      var rendered = {
        card: $card,
        text: $text,
        body: $body,
        actions: null,
        status: $status,
        panel: null,
        busy: false,
      };

      addActions(rendered, opts.actions);
      $card.append($body);
      toolContainer().empty().append($card);
      return rendered;
    }

    function setActionStatus(rendered, text, tone) {
      rendered.status
        .attr(
          "class",
          "hmk-action-status" + (tone ? " hmk-action-status-" + tone : "")
        )
        .text(text || "")
        .toggle(!!text);
    }

    function setActionBusy(rendered, busy) {
      rendered.busy = !!busy;
      if (rendered.actions) {
        rendered.actions.find("button").prop("disabled", rendered.busy);
      }
      if (rendered.panel) {
        rendered.panel.find(".hmk-seg-btn").prop("disabled", rendered.busy);
      }
    }

    function actionErrorMessage(prefix, error) {
      var detail = error && error.message ? error.message : String(error || "");
      return detail ? prefix + " " + detail : prefix;
    }

    function clearActionState(rendered) {
      setActionBusy(rendered, false);
      setActionStatus(rendered, "", null);
    }

    function failAction(rendered, prefix, error) {
      setActionBusy(rendered, false);
      setActionStatus(rendered, actionErrorMessage(prefix, error), "error");
    }

    function reportMoveFailure(rendered, to, targetDeleted, error) {
      if (targetDeleted) {
        showFinalTargetCard(
          "warning",
          STR.moveAfterDeleteFailedTitle,
          error
            ? actionErrorMessage(STR.moveAfterDeleteFailedBody, error)
            : STR.moveAfterDeleteFailedBody,
          STR.deletedTargetLabel,
          to
        );
        return;
      }
      failAction(rendered, STR.moveFailedTitle + ":", error);
    }

    function showFinalTargetCard(type, title, body, targetPrefix, target) {
      var rendered = showCard({ type: type, title: title, html: "" });
      rendered.text.text(body || "");
      if (target) {
        var $link = bindLocalPreview(
          $("<a>", { href: mw.util.getUrl(target), text: target }),
          target
        );
        var $line = $("<div>", { class: "hmk-final-target" })
          .append(document.createTextNode(targetPrefix + " "))
          .append($link);
        rendered.body.append($line);
      }
      return rendered;
    }

    function wikipediaRedirectStateText(wp) {
      if (!wp || wp.failed) return STR.wpStateUnchecked;
      if (wp.redirect) return STR.wpStateRedirect(wp.target);
      return wp.exists ? STR.wpStateArticle : STR.wpStateMissing;
    }

    // אחרי העברה או הפיכה להפניה: ההפניות אל השם הישן, ולכל אחת השוואה
    // לוויקיפדיה בלחיצה ועדכון אל השם החדש. הרשימה נאספה כבר לפני הפעולה.
    function appendRedirectFixes(rendered, fromTitle, newTitle) {
      var list = redirectsToFix;
      if (!list || !sameTitle(list.from, fromTitle)) return;
      newTitle = withoutFragment(newTitle);
      var titles = list.titles.filter(function (title) {
        return !sameTitle(title, newTitle) && !sameTitle(title, fromTitle);
      });
      if (!titles.length) return;
      var $box = $("<div>", { class: "hmk-redirect-fixes" }).append(
        $("<div>", { class: "hmk-redirect-fixes-title", text: STR.redirectFixesTitle(titles.length) })
      );
      titles.forEach(function (title) {
        var $status = $("<span>", { class: "hmk-redirect-fix-status" });
        var $compare = $("<button>", {
          type: "button",
          class: "hmk-btn hmk-btn-quiet",
          text: STR.btnCompareWikipedia,
        });
        var $fix = $("<button>", { type: "button", class: "hmk-btn hmk-btn-quiet", text: STR.btnRetargetTo(newTitle) });
        $compare.on("click", function () {
          $compare.prop("disabled", true);
          $status.text(STR.checkingShort);
          wpRedirectTarget(toWikipediaTitle(title)).then(
            function (wp) {
              $compare.remove();
              $status.text(wikipediaRedirectStateText(wp));
            },
            function () {
              $compare.prop("disabled", false);
              $status.text("");
            }
          );
        });
        $fix.on("click", function () {
          $fix.prop("disabled", true);
          $status.text(STR.retargetStarting);
          retargetRedirect(title, newTitle, { expectTarget: fromTitle }).then(
            function () {
              $fix.remove();
              $status.text(STR.retargetRowDone);
            },
            function (err) {
              $fix.prop("disabled", false);
              $status.text(actionErrorMessage(STR.retargetFailed, err));
            }
          );
        });
        $box.append(
          $("<div>", { class: "hmk-redirect-fix" })
            .append($("<a>", { href: mw.util.getUrl(title, { redirect: "no" }), text: title }))
            .append($compare)
            .append($fix)
            .append($status)
        );
      });
      if (list.more) {
        $box.append($("<div>", { class: "hmk-redirect-fixes-more", text: STR.redirectFixesMore }));
      }
      rendered.body.append($box);
    }

    // קישורים ישירים אל השם הישן, אחרי העברה שבוצעה בפועל בלי הפניה.
    // דף שקישר לעצמו בשם הישן נמצא עכשיו בשם החדש. החלון עצמו נטען עצל.
    function appendLinkFixes(rendered, fromTitle, newTitle, noRedirect) {
      var list = directLinksToFix;
      if (!noRedirect || !isBotUser()) return;
      if (!list || !sameTitle(list.from, fromTitle)) return;
      newTitle = withoutFragment(newTitle);
      var titles = [];
      list.titles.forEach(function (title) {
        var t = sameTitle(title, fromTitle) ? newTitle : title;
        if (!titles.some(function (x) { return sameTitle(x, t); })) titles.push(t);
      });
      var templates = list.templates;
      if (!titles.length && !templates.length) return;
      var $box = $("<div>", { class: "hmk-redirect-fixes hmk-link-fixes" });
      // תבניות לא נפתחות בחלון: מעדכנים אותן בדף התבנית עצמו.
      if (templates.length) {
        var $templates = $("<div>", { class: "hmk-link-fixes-templates" }).append(
          $("<span>", { text: STR.linkFixesTemplates + " " })
        );
        templates.forEach(function (t, i) {
          if (i) $templates.append(document.createTextNode(" · "));
          $templates.append($("<a>", { href: mw.util.getUrl(t), target: "_blank", rel: "noopener", text: t }));
        });
        $box.append($templates);
        if (list.templatesMore) {
          $box.append($("<div>", { class: "hmk-redirect-fixes-more", text: STR.linkFixesTemplatesMore }));
        }
      }
      if (!titles.length) {
        rendered.body.append($box);
        return;
      }
      var session = { from: fromTitle, to: newTitle, titles: titles, more: list.more };
      var $status = $("<span>", { class: "hmk-redirect-fix-status" });
      var $open = $("<button>", {
        type: "button",
        class: "hmk-btn hmk-btn-quiet",
        text: STR.btnFixLinks(titles.length),
      });
      $open.on("click", function () {
        $open.prop("disabled", true);
        $status.text(STR.checkingShort);
        loadLinksFeature()
          .then(function (feature) {
            $status.text("");
            return feature.open(session);
          })
          .then(function (summary) {
            $status.text(STR.linkFixesSummary(summary));
            if (summary.allDone) {
              $open.remove();
            } else {
              $open.text(STR.btnContinueLinkFix).prop("disabled", false);
            }
          })
          .catch(function () {
            $status.text(STR.linksLoadFailed);
            $open.prop("disabled", false);
          });
      });
      $box
        .prepend($("<div>", { class: "hmk-redirect-fixes-title", text: STR.directLinkFixesTitle(titles.length) }))
        .append($("<div>", { class: "hmk-redirect-fix" }).append($open).append($status));
      if (list.more) {
        $box.append($("<div>", { class: "hmk-redirect-fixes-more", text: STR.linkFixesMore(titles.length) }));
      }
      rendered.body.append($box);
    }

    // איסוף מידע לפאנל. כל בדיקת-משנה שנכשלה נשמרת כ"לא נבדק" ולא
    // מורידה את הכרטיס הראשי. רצף יומן חלקי מסומן במפורש.
    function gatherInfoLog(ctx) {
      var rows = [];

      var logRelevant =
        (ctx.result.moveLog && ctx.result.moveLog.length) ||
        ctx.result.status === "renamed" ||
        ctx.result.status === "deleted" ||
        ctx.result.status === "moved_to_other_namespace";
      if (runtime.getLocalCreationFailed() && logRelevant) {
        rows.push({
          order: 7,
          label: STR.factLogRange,
          value: STR.notChecked,
          tone: "warn",
          wide: true,
        });
      }

      var logPromise;
      if (ctx.result.moveLog && ctx.result.moveLog.length) {
        logPromise = Promise.resolve({
          events: filterAndSortLog(ctx.result.moveLog, ctx.sinceTs).map(normalizeLogEvent),
          partial: false,
        });
      } else if (ctx.result.status === "renamed" && ctx.result.from) {
        // זהו שחזור לצורכי תצוגה בלבד; כשל בו אינו משנה הכרעה שכבר התקבלה.
        logPromise = fetchMoveChainForDisplay(
          ctx.result.from,
          ctx.result.title,
          ctx.sinceTs,
          0,
          new Set()
        )
          .then(function (logData) {
            return {
              events: logData.events.map(normalizeLogEvent),
              partial: logData.partial,
            };
          });
      } else if (
        ctx.result.status === "deleted" ||
        ctx.result.status === "moved_to_other_namespace"
      ) {
        logPromise = fetchMoveDeleteLog(ctx.result.title, ctx.sinceTs).then(function (logData) {
          return {
            events: logData.events.map(normalizeLogEvent),
            partial: logData.partial,
          };
        });
      } else if (
        ctx.result.status === "unknown" &&
        ctx.result.olderLogEvidence &&
        ctx.result.olderLogEvidence.length
      ) {
        logPromise = Promise.resolve({
          events: ctx.result.olderLogEvidence.map(normalizeLogEvent),
          partial: false,
        });
      } else {
        logPromise = Promise.resolve({ events: [], partial: false });
      }

      return logPromise.then(function (logData) {
        if (logData.partial) {
          rows.push({
            order: 8,
            label: STR.factLogStatus,
            value: STR.notChecked,
            tone: "warn",
            wide: true,
          });
        }
        rows.sort(function (a, b) { return a.order - b.order; });
        return { rows: rows, log: logData.events };
      });
    }

    // צ'ק-ליסט לפני פעולה. כל בדיקת-משנה יכולה להחזיר "לא נבדק" בלי
    // להפיל את הכרטיס; כל מצב שאינו בטוח חוסם פעולה אוטומטית.
    // wpOldTitle ו־wpTarget הם השמות בוויקיפדיה. השם המקומי של הדף יכול
    // להיות שונה מהם, ולכן שאלת ההפניה נשאלת על שם ויקיפדיה ולא על שמו.
    // merged: בוויקיפדיה הכותרת הפכה להפניה, כלומר הערך מוזג לערך אחר.
    function computeMoveChecklist(oldname, target, wpOldTitle, wpTarget, merged) {
      return Promise.all([
        wpRedirectTarget(wpOldTitle),
        fetchLocalPageData(target, true),
        fetchMechalolBacklinks(oldname),
      ]).then(function (res) {
        var wpOld = res[0];
        var targetData = res[1];
        var backlinks = res[2];
        var targetStatus = targetData.status;
        // יעד שהוא הפניה במכלול. אל הדף הנוכחי: ההעברה דורסת אותה, והיעד
        // פנוי בפועל. אל דף אחר: השרת יחסום את ההעברה, ולכן בדיקה ידנית.
        var targetRedirect =
          targetStatus === "redirect" ? parseRedirectLine(targetData.wikitext) : null;
        var targetRedirectsHere = !!targetRedirect && sameTitle(targetRedirect.target, oldname);
        var targetRedirectsElsewhere = targetStatus === "redirect" && !targetRedirectsHere;
        var redirectToTarget =
          !wpOld.failed && wpOld.redirect === true &&
          sameTitle(wpOld.target, wpTarget);
        var suppress = wpOld.failed ? false : !redirectToTarget;
        var targetIdentity =
          targetStatus === "article" ? describeIdentity(runtime.getOwnFields(), targetData.fields) : null;
        var targetIsCurrentPage = sameTitle(oldname, target);
        var targetSameIdentity = !!targetIdentity && targetIdentity.verdict === "same";
        var action, label, reason;

        if (targetIsCurrentPage) {
          action = "none"; label = STR.noActionNeeded; reason = STR.targetCurrentReason;
        } else if (targetStatus === "unchecked") {
          action = "manual_review"; label = STR.manualReview; reason = STR.targetStatusUnknownReason;
        } else if (merged) {
          // ערך שמוזג אינו מועבר: אם הערך המאחד קיים במכלול, הדף הופך
          // להפניה אליו; אחרת בדיקה ידנית.
          if (targetStatus === "article") {
            action = "make_redirect"; label = STR.btnMakeRedirect; reason = STR.mergedTargetReason;
          } else {
            action = "manual_review"; label = STR.manualReview; reason = STR.mergedMissingReason;
          }
        } else if (targetRedirectsElsewhere) {
          action = "manual_review"; label = STR.manualReview;
          reason = STR.targetRedirectElsewhereReason(targetRedirect ? targetRedirect.target : null);
        } else if (targetStatus === "article" && targetSameIdentity) {
          action = "make_redirect"; label = STR.btnMakeRedirect; reason = STR.targetSameReason;
        } else if (targetStatus === "article" && targetIdentity.verdict === "different") {
          action = "manual_review"; label = STR.manualReview; reason = STR.targetDifferentReason;
        } else if (targetStatus === "article") {
          action = "manual_review"; label = STR.manualReview; reason = STR.targetUnknownReason;
        } else if (wpOld.failed) {
          action = "move_with_redirect"; label = STR.btnMoveWithRedirect; reason = STR.unknownSafeRedirect;
        } else if (suppress) {
          action = "move_no_redirect"; label = STR.btnMoveNoRedirect; reason = STR.moveNoRedirectReason;
        } else {
          action = "move_with_redirect"; label = STR.btnMoveWithRedirect; reason = STR.moveWithRedirectReason;
        }

        return {
          wpOldExists: wpOld.exists,
          wpOldRedirect: wpOld.redirect,
          wpOldTarget: wpOld.target,
          wpOldFailed: !!wpOld.failed,
          redirectToTarget: wpOld.failed ? null : redirectToTarget,
          target: targetStatus,
          targetRedirectsHere: targetRedirectsHere,
          targetRedirectsElsewhere: targetRedirectsElsewhere,
          targetIdentity: targetIdentity,
          targetSameIdentity: targetSameIdentity,
          targetIsCurrentPage: targetIsCurrentPage,
          merged: !!merged,
          backlinksRoot: oldname,
          backlinksCount: backlinks.count,
          backlinksDirectCount: backlinks.directCount,
          backlinksRedirectCount: backlinks.redirectCount,
          backlinksTemplateCount: backlinks.templateCount,
          backlinksTemplateMore: backlinks.templateMore,
          backlinksItems: backlinks.items,
          backlinksDirectMore: backlinks.directMore,
          backlinksRedirectMore: backlinks.redirectMore,
          backlinksMore: backlinks.more,
          backlinksFailed: !!backlinks.failed,
          suppress: suppress,
          action: action,
          recommendation: label,
          decisionReason: reason,
        };
      });
    }


    // ---- מנגנון פעולות יחיד ----
    // גם פעולות ראשוניות וגם פעולות שמתווספות אחרי בדיקות-משנה עוברות כאן.
    function ensureActions(rendered) {
      if (!rendered.actions) {
        rendered.actions = $("<div>", { class: "hmk-actions" });
        rendered.body.append(rendered.actions);
      }
      return rendered.actions;
    }

    function addAction(rendered, action) {
      ensureActions(rendered).append(actionControl(action, rendered));
    }

    function addActions(rendered, actions) {
      (actions || []).forEach(function (action) {
        addAction(rendered, action);
      });
    }

    var WP_BASE = "https://he.wikipedia.org/wiki/";
    function pageUrl(title, wikipedia) {
      var raw = String(title || "").trim().replace(/^:/, "");
      var hash = raw.indexOf("#");
      var page = hash === -1 ? raw : raw.slice(0, hash);
      var fragment = hash === -1 ? "" : raw.slice(hash + 1);
      var url = wikipedia
        ? WP_BASE + encodeURIComponent(page.replace(/ /g, "_"))
        : mw.util.getUrl(page);
      if (fragment) url += "#" + encodeURIComponent(fragment.replace(/ /g, "_"));
      return url;
    }

    function wikipediaUrl(title) {
      return pageUrl(title, true);
    }

    function redirectDestination(title, fragment) {
      return title + (fragment ? "#" + fragment : "");
    }

    function localPageUrl(title) {
      return pageUrl(title, false);
    }

    // סיבות המחיקה מגיעות מיומן ויקיפדיה. לפני שהמפענח המקומי מעבד אותן,
    // קישורים פנימיים מומרים לקישורים מפורשים לוויקיפדיה כדי שלא ייפתחו במכלול.
    function wikipediaLinksForLocalParse(text) {
      return String(text || "").replace(
        /\[\[([^\[\]|]+)(?:\|([^\[\]]*))?\]\]/g,
        function (full, target, label) {
          var cleanTarget = target.trim();
          var cleanLabel =
            label !== undefined && label !== ""
              ? label.trim()
              : cleanTarget.replace(/^:/, "").replace(/#.*$/, "");
          return "[" + wikipediaUrl(cleanTarget) + " " + cleanLabel + "]";
        }
      );
    }

    function sourceFailureLabel(failure) {
      return STR[failure.sourceKey];
    }

    function sourceFailureText(failure) {
      var base = STR[failure.messageKey] || sourceFailureLabel(failure);
      return base + (failure.errorMessage ? " " + failure.errorMessage : "");
    }


    function infoLogFor(result) {
      return gatherInfoLog({
        result: result,
        sinceTs: runtime.getLocalCreationTs(),
      });
    }

    // ---- פאנל פרטים: נטען לפי דרישה ----


    function attachDetailsPanel(rendered, result, options) {
      options = options || {};

      // ידית פתיחה מינימלית על שפת הכרטיס: משולש החוצה כשהפאנל סגור,
      // ומשולש פנימה כשהוא פתוח. ללא טקסט או מסגרת.
      var $arrow = $("<button>", {
        class: "hmk-arrow",
        type: "button",
        title: STR.btnDetails,
        "aria-label": STR.btnDetails,
        "aria-expanded": "false",
      });
      var $panel = $("<div>", { class: "hmk-panel", dir: "rtl" }).hide();
      rendered.panel = $panel;
      rendered.card.append($arrow);
      toolContainer().append($panel);

      var built = false;
      $arrow.on("click", function () {
        var willOpen = !$panel.is(":visible");
        $panel.toggle();
        $arrow.toggleClass("hmk-arrow-open", willOpen);
        $arrow.attr("aria-expanded", willOpen ? "true" : "false");
        if (!willOpen || built) return;
        built = true;
        $panel.empty();

        var $body = $("<div>").append(
          $("<div>", { class: "hmk-check-loading" })
            .append($("<span>", { class: "hmk-spinner" }))
            .append($("<span>", { text: STR.loadingFacts }))
        );
        $panel.append($body);

        var infoPromise = infoLogFor(result);
        var detailsPromise = options.checklist
          ? Promise.all([options.checklist, infoPromise]).then(function (res) {
              return { checklist: res[0], info: res[1] };
            })
          : infoPromise.then(function (info) {
              return { checklist: null, info: info };
            });

        Promise.all([loadDetailsFeature(), detailsPromise])
          .then(function (loaded) {
            loaded[0].buildDetailsBody(
              $body,
              result,
              loaded[1].info,
              loaded[1].checklist,
              {
                onRedirectOverride: options.onRedirectOverride,
                rendered: rendered,
              }
            );
          })
          .catch(function (error) {
            built = false;
            console.error(error);
            $body.text(STR.detailsLoadFailed);
          });
      });
    }

    // ==================================================================
    // 3. תצוגה - ענף אחד לכל קטגוריית תוצאה (סעיף 4 במסמך)
    // ==================================================================
    // הסקריפט החיצוני "מידע דף מחוק" - מוחזר במצבי מחיקה / לא-נמצא, פעם אחת
    var deletedInfoLoaded = false;
    function loadDeletedPageInfo() {
      if (deletedInfoLoaded) return;
      deletedInfoLoaded = true;
      try {
        importScript("משתמש:בוט גאון הירדן/מידע דף מחוק.js");
      } catch (e) {}
    }

    // אזהרה קצרה וגלויה בתוך הכרטיס למידע שמשפיע על אמינות ההכרעה.
    // היא אינה מחליפה את פאנל הפרטים, אלא מונעת מצב שבו המשתמש פועל בלי
    // לראות שההכרעה נשענה על מקור חלופי או שאימות היעד לא הושלם.
    function cardWarnRow(text) {
      return $("<div>", { class: "hmk-cardwarn" })
        .append($("<span>", { class: "hmk-cardwarn-mark", text: "⚠" }))
        .append($("<span>", { text: text }));
    }

    function appendCardWarning(rendered, text) {
      cardWarnRow(text).insertBefore(rendered.actions || rendered.status);
    }

    function appendResultWarnings(rendered, result, skip, showPermissionWarning) {
      skip = skip || {};
      if (result.revidDeletedNotice && !skip.revidDeletedNotice) {
        appendCardWarning(rendered, STR.revidDeletedNotice);
      }
      if (
        result.sourceFailures &&
        result.sourceFailures.length &&
        !skip.sourceFailures
      ) {
        appendCardWarning(
          rendered,
          result.sourceFailures.map(sourceFailureText).join(" ")
        );
      }
      if (
        result.status === "already_synced" &&
        result.baselineTargetFailure &&
        !skip.baselineTargetFailure
      ) {
        appendCardWarning(rendered, STR.alreadyHandledTargetUnchecked);
      }
      if (
        showPermissionWarning &&
        userCapabilitiesLoadFailed &&
        !skip.userCapabilitiesLoadFailed
      ) {
        appendCardWarning(rendered, STR.permissionsLoadFailed);
      }
    }

    // מנוע כרטיס-תוצאה יחיד: בניית הכרטיס, אזהרות ופאנל הפרטים עוברים
    // באותו מסלול. מצבים מיוחדים יכולים לכבות אזהרות/פרטים ולהוסיף תוכן בעצמם.
    function showResultCard(result, opts) {
      if (opts.before) opts.before(result);
      var rendered = showCard({
        type: opts.type,
        title: opts.title,
        html: opts.html || "",
        actions: opts.actions,
      });
      if (opts.warnings !== false) {
        appendResultWarnings(
          rendered,
          result,
          opts.warningSkip,
          !!opts.permissionSensitive
        );
      }
      if (opts.details !== false) attachDetailsPanel(rendered, result);
      if (opts.after) opts.after(result, rendered);
      return rendered;
    }

    // ==================================================================
    // בונה-כרטיסים נתונה-מונחה: המצבים ה"פשוטים" מתוארים כנתונים במפה אחת,
    // ומנוע יחיד (renderSimpleState) מרכיב מהם את הכרטיס. המצבים המיוחדים
    // (found, וכרטיס-הפעולה של renamed/redirect) נשארים פונקציות ייעודיות.
    // ערך שדה יכול להיות קבוע או פונקציה של result - כדי לתמוך בנתון דינמי
    // ==================================================================
    var CARD_STATES = {
      disambiguation: {
        type: "notice",
        title: STR.disambigTitle,
        body: STR.disambigBody,
      },
      already_synced: {
        type: "success",
        title: STR.alreadyHandledTitle,
        body: STR.alreadyHandledBody,
      },
      deleted: {
        type: "error",
        title: STR.deletedTitle,
        body: STR.deletedLoading,
        permissionSensitive: true,
        actions: function () {
          return deleteActions("הדף נמחק בוויקיפדיה העברית");
        },
        before: loadDeletedPageInfo,
        after: fillDeleteReason,
      },
      moved_to_other_namespace: {
        type: "warning",
        permissionSensitive: true,
        title: function (result) {
          return STR.movedNsTitle(result.target.split(":")[0]);
        },
        body: STR.movedNsBody,
        actions: function (result) {
          return deleteActions(
            "הערך הועבר בוויקיפדיה למרחב " + result.target.split(":")[0]
          );
        },
      },
      chain_too_long: {
        type: "warning",
        title: STR.chainTooLongTitle,
        body: function () {
          return STR.chainTooLongBody(MAX_CHAIN_DEPTH);
        },
        actions: function () {
          return [retryAction()];
        },
      },
      cycle_detected: {
        type: "warning",
        title: STR.cycleTitle,
        body: STR.cycleBody,
        actions: function () {
          return [retryAction()];
        },
      },
      unknown: {
        type: "neutral",
        title: STR.unknownTitle,
        body: function (result) {
          return result.olderLogEvidence && result.olderLogEvidence.length
            ? STR.unknownBodyWithOldEvidence
            : STR.unknownBody;
        },
        actions: function () {
          return [retryAction()];
        },
        after: function () {
          loadDeletedPageInfo();
        },
      },
    };

    // פותר ערך-שדה שהוא קבוע או פונקציה של result
    function specVal(v, result) {
      return typeof v === "function" ? v(result) : v;
    }

    function renderSimpleState(result) {
      var spec = CARD_STATES[result.status];
      showResultCard(result, {
        type: spec.type,
        title: specVal(spec.title, result),
        html: specVal(spec.body, result) || "",
        actions: spec.actions ? spec.actions(result) : undefined,
        permissionSensitive: !!spec.permissionSensitive,
        before: spec.before,
        after: spec.after,
      });
    }

    // עיבוד סיבת המחיקה הוא תצוגתי בלבד. בכשל מציגים את הטקסט הגולמי
    // ומציינים שהעיבוד לא נבדק; ההכרעה עצמה אינה משתנה.
    function fillDeleteReason(result, rendered) {
      var commentF = result.reason || "";
      if (!commentF) {
        rendered.text.text(STR.deletedNoReason);
        return;
      }
      netGet("/w/api.php", {
        action: "parse",
        format: "json",
        title: "עמוד ראשי",
        text: wikipediaLinksForLocalParse(commentF),
        utf8: 1,
      })
        .then(function (parsed) {
          if (!parsed.parse || !parsed.parse.text || !("*" in parsed.parse.text)) {
            throw structureError("עיבוד סיבת המחיקה");
          }
          var html = parsed.parse.text["*"];
          var comment =
            html.indexOf("התוכן היה") != -1 ? html.split("התוכן היה")[0] : html;
          rendered.text.html(STR.deleteReasonPrefix + comment);
        })
        .catch(function (err) {
          if (err && err.silent) return;
          rendered.text.text(
            STR.deleteReasonPrefix + commentF + " — " + STR.deleteReasonFormatFailed
          );
        });
    }

    function standaloneWarningSpec(result) {
      if (result.revidDeletedNotice) {
        return {
          title: STR.revidGoneTitle,
          html: STR.revidDeletedNotice,
          terminal: true,
          warningSkip: { revidDeletedNotice: true },
        };
      }
      if (result.sourceFailures && result.sourceFailures.length) {
        return {
          title: STR.fallbackTitle,
          html: result.sourceFailures.map(sourceFailureText).join(" "),
          terminal: false,
          warningSkip: { sourceFailures: true },
        };
      }
      return null;
    }

    function showStandaloneWarning(result) {
      var spec = standaloneWarningSpec(result);
      if (!spec) return null;
      showResultCard(result, {
        type: "warning",
        title: spec.title,
        html: spec.html,
        warningSkip: spec.warningSkip,
      });
      return spec;
    }

    function renderMatchedWarningState(result) {
      clearTool();
      showStandaloneWarning(result);
    }

    function renderResult(result) {
      if (result.localStateMatched) renderMatchedWarningState(result);
      else if (result.status === "found") renderFoundState(result);
      else if (result.status === "renamed" || result.status === "redirect") {
        renderMoveState(result);
      }
      else renderSimpleState(result);

    }

    function retryAction() {
      return makeAction(STR.btnRetry, "quiet", function () {
        clearTool();
        runtime.runPageCheck();
      });
    }

    function deleteAndMoveAction(to, oldname, suppressRedirect, redirectTo) {
      return makeAction(STR.btnDeleteAndMove(to), "danger", function (event, rendered) {
        setActionBusy(rendered, true);
        setActionStatus(rendered, STR.deleteForMoveStarting, "progress");
        api
          .postWithToken("csrf", {
            action: "delete",
            format: "json",
            title: to,
            reason: STR.deleteForMoveReason(oldname),
          })
          .then(function () {
            setActionStatus(rendered, STR.deletedWaitMove, "progress");
            movePage(
              to,
              {
                targetDeleted: true,
                keepStatus: true,
                forcedNoRedirect: !!suppressRedirect,
                redirectTo: redirectTo,
              },
              rendered
            );
          })
          .catch(function (error) {
            failAction(rendered, STR.deleteForMoveFailed, error);
          });
      });
    }

    function requestMove(to, oldname, reason, rendered) {
      return requestToOperators(
        6,
        "\n*{{העברה|" + oldname + "|" + to + "|" + reason + "}}" + " ~~" + "~~",
        "/* בקשות העברת דף / העברת קובץ */ [[" + oldname + "]] >> [[" + to + "]]",
        rendered
      );
    }

    function requestMoveAction(to, oldname, reason) {
      return makeAction(STR.btnRequestMove, "primary", function (event, rendered) {
        requestMove(to, oldname, reason, rendered);
      });
    }

    function makeRedirectAction(to, style) {
      return makeAction(STR.btnMakeRedirect, style, function (event, rendered) {
        updateRed(to, rendered);
      });
    }

    function canDeleteTarget(targetStatus) {
      return targetStatus === "redirect" ? can("deleteRedirect") : can("deletePage");
    }

    function occupiedTargetAction(
      to,
      oldname,
      reason,
      targetStatus,
      suppressRedirect,
      redirectTo
    ) {
      if (canDeleteTarget(targetStatus) && canMove(!!suppressRedirect)) {
        return deleteAndMoveAction(to, oldname, suppressRedirect, redirectTo);
      }
      return requestMoveAction(to, oldname, reason);
    }

    function occupiedReviewActions(
      to,
      oldname,
      reason,
      targetStatus,
      suppressRedirect,
      redirectTo
    ) {
      return [
        makeRedirectAction(redirectTo, "quiet"),
        occupiedTargetAction(
          to,
          oldname,
          reason,
          targetStatus,
          suppressRedirect,
          redirectTo
        ),
      ];
    }

    function addManualReviewActions(
      rendered,
      checklistData,
      to,
      oldname,
      reason,
      redirectTo
    ) {
      if (checklistData.target === "unchecked") {
        addAction(rendered, retryAction());
        return;
      }
      if (checklistData.merged) return;

      // יעד שהוא הפניה לדף אחר: המכלול החליט עליה בעצמו, ולכן אין מחיקה
      // והעברה. נשארת בקשת העברה ממפעילים.
      if (checklistData.targetRedirectsElsewhere) {
        addAction(rendered, requestMoveAction(to, oldname, reason));
        return;
      }

      if (checklistData.target !== "article") return;

      // בבדיקה ידנית של יעד שהוא ערך קיים, גם פריט שונה אינו חוסם
      // בחירה מודעת להפוך את הדף הנוכחי להפניה. הכלי משקף את ההבדל,
      // אך משאיר את ההכרעה למשתמש.
      addActions(
        rendered,
        occupiedReviewActions(
          to,
          oldname,
          reason,
          checklistData.target,
          checklistData.suppress,
          redirectTo
        )
      );
    }

    // קישור מקומי ליעד. המצב החזותי נקבע מהבדיקה שכבר מתבצעת בצ'ק-ליסט;
    // התצוגה המקדימה נטענת בנפרד רק כאשר המשתמש מרחף מעל הקישור או ממקד אותו.
    function renderTargetLink($text, prefixText, targetTitle, linkDestination) {
      var $link = bindLocalPreview(
        $("<a>", {
          href: localPageUrl(linkDestination),
          text: linkDestination,
        }),
        targetTitle,
        linkDestination
      );
      $text
        .empty()
        .append(document.createTextNode(prefixText + " "))
        .append($("<span>", { class: "hmk-target" }).append($link));
      return $link;
    }

    // מצב "renamed" - שינוי-שם בוויקיפדיה: כרטיסיית פעולה. ההעברה פועלת לפי
    // ההמלצה, ובורר בתוך הפרטים מאפשר לעקוף ידנית את עניין ההפניה.
    // סיכום הדפים המקשרים מוצג בכרטיס, והעץ המלא בפירוט ההמלצה.
    function renderMoveCard(
      result,
      target,
      cardTitle,
      targetPrefix,
      redirectTo,
      names
    ) {
      var oldname = currentPageName;
      var wpTarget = names.wpTarget;
      wikipediaTitleForTarget[normalizeTitle(target)] = wpTarget;
      var checklist = null;
      var redirectOverride = null; // null=לפי ההמלצה; true=בלי; false=עם

      function currentSuppress() {
        if (redirectOverride !== null) return redirectOverride;
        return checklist ? checklist.suppress : undefined;
      }
      function moveLabel() {
        if (!checklist) return STR.btnMove;
        if (checklist.action === "make_redirect") return STR.btnMakeRedirect;
        if (checklist.action === "none") return STR.noActionNeeded;
        if (checklist.action === "manual_review") return STR.manualReview;
        var s = currentSuppress();
        if (!canMove(!!s)) return STR.btnRequestMove;
        return s ? STR.btnMoveNoRedirect : STR.btnMoveWithRedirect;
      }

      var checklistPromise = computeMoveChecklist(
        oldname, target, names.wpOldTitle, wpTarget, result.status === "redirect"
      );

      var rendered = showResultCard(result, {
        type: "notice",
        title: cardTitle,
        html: "",
        details: false,
        permissionSensitive: true,
        actions: [
          makeAction(STR.btnMove, "primary", function (event, sourceCard) {
            // גם אם המשתמש לחץ לפני שהצ'ק-ליסט הסתיים, מחכים להכרעה כדי
            // לא לנסות להעביר לתוך דף שכבר זוהה כאותו ערך.
            setActionBusy(sourceCard, true);
            setActionStatus(sourceCard, STR.loadingFacts, "progress");
            checklistPromise
              .then(function (d) {
                if (d.action === "none" || d.action === "manual_review") {
                  clearActionState(sourceCard);
                  return;
                }
                if (d.action === "make_redirect") {
                  updateRed(redirectTo, sourceCard);
                  return;
                }
                var s = currentSuppress();
                if (!canMove(!!s)) {
                  requestMove(target, oldname, actionReason, sourceCard);
                  return;
                }
                movePage(
                  target,
                  { forcedNoRedirect: s, redirectTo: redirectTo },
                  sourceCard
                );
              })
              .catch(function () {
                failAction(sourceCard, STR.factsFailed);
              });
          }),
        ],
      });
      var $targetLink = renderTargetLink(
        rendered.text,
        targetPrefix,
        target,
        redirectTo
      );

      var $moveBtn = rendered.actions.find(".hmk-btn-primary");
      // שורת הקישורים הישירים תלויה בבחירה בבורר: רק בהעברה בלי הפניה
      // הקישורים נשברים. כשהיא לא רלוונטית היא מנותקת מהכרטיס ולא מוסתרת.
      var $directLinksWarn = null;
      var $backlinksRow = null;
      // שורת ההפניות משנה ניסוח לפי הבחירה: בהעברה בלי הפניה הן נשברות
      // ומתוקנות מכרטיס ההצלחה; בהעברה עם הפניה או בהפיכה להפניה הן
      // הופכות להפניות כפולות, שכלים אוטומטיים מטפלים בהן.
      var $redirectsWarn = null;
      var redirectsWarnCount = null;
      function movingWithoutRedirect() {
        var moving =
          !!checklist &&
          (checklist.action === "move_no_redirect" || checklist.action === "move_with_redirect");
        return moving && currentSuppress() === true;
      }
      function redirectsWarnMode() {
        if (movingWithoutRedirect()) return "fix";
        if (
          checklist &&
          (checklist.action === "move_with_redirect" ||
            checklist.action === "move_no_redirect" ||
            checklist.action === "make_redirect")
        ) {
          return "double";
        }
        return "plain";
      }
      function refreshDirectLinksWarn() {
        if ($redirectsWarn && redirectsWarnCount) {
          $redirectsWarn
            .children("span")
            .last()
            .text(STR.redirectsWillBreak(redirectsWarnCount.count, redirectsWarnCount.more, redirectsWarnMode()));
        }
        if (!$directLinksWarn || !$backlinksRow) return;
        if (movingWithoutRedirect()) {
          if (!$directLinksWarn.parent().length) $directLinksWarn.insertAfter($backlinksRow);
        } else {
          $directLinksWarn.detach();
        }
      }
      function refreshMoveBtn() {
        $moveBtn.text(moveLabel());
        refreshDirectLinksWarn();
      }

      if (!sameTitle(target, wpTarget)) {
        $("<div>", { class: "hmk-note" })
          .append($("<span>", { text: STR.localizedTargetNote(wpTarget) }))
          .insertBefore(rendered.actions);
      }

      if (result.targetIsDisambig) {
        $("<div>", { class: "hmk-note" })
          .append($("<span>", { class: "hmk-note-mark", text: "⚠" }))
          .append($("<span>", { text: STR.targetIsDisambig }))
          .insertBefore(rendered.actions);
      }

      checklistPromise.then(function (d) {
        checklist = d;
        applyLocalLinkStatus($targetLink, target, d.target, redirectTo);
        refreshMoveBtn();
        if (d.action === "none" || d.action === "manual_review") {
          $moveBtn.remove();
        }
        if (d.action === "manual_review") {
          addManualReviewActions(
            rendered,
            d,
            target,
            oldname,
            actionReason,
            redirectTo
          );
        }
        var decisionLead = d.merged
          ? STR.decisionLeadMerged
          : d.action === "move_with_redirect"
            ? STR.decisionLeadMoveWithRedirect
            : d.action === "move_no_redirect"
            ? STR.decisionLeadMoveNoRedirect
            : d.action === "make_redirect"
            ? STR.decisionLeadMakeRedirect
            : d.action === "none"
            ? STR.decisionLeadNone
            : STR.decisionLeadManual;
        var decisionText =
          d.action === "manual_review"
            ? d.decisionReason
            : d.recommendation + ".";
        $("<div>", { class: "hmk-carddecision" })
          .append($("<strong>", { text: decisionLead + " — " }))
          .append(document.createTextNode(decisionText))
          .insertBefore(rendered.actions);
        // מה יישבר בפעולה: גלוי בכרטיס עצמו, בלי לפתוח פרטים.
        // כשל בבדיקה מוצג במפורש, כדי שהיעדר השורה לא יתפרש כאפס.
        if (d.action !== "none" && (d.backlinksFailed || d.backlinksCount > 0)) {
          $backlinksRow = cardWarnRow(
            STR.backlinksLabel +
              ": " +
              (d.backlinksFailed
                ? STR.notChecked
                : STR.backlinksSummary(
                    d.backlinksDirectCount,
                    d.backlinksRedirectCount,
                    d.backlinksDirectMore,
                    d.backlinksRedirectMore,
                    d.backlinksTemplateCount,
                    d.backlinksTemplateMore
                  ))
          ).insertBefore(rendered.actions);
        }
        // קישורים ישירים אל השם הישן: בהעברה בלי הפניה הם הופכים לאדומים.
        // מוצגת מיד אחרי שורת הסיכום, ומתעדכנת עם הבורר.
        if (!d.backlinksFailed && (d.backlinksDirectCount > 0 || d.backlinksTemplateCount > 0)) {
          $directLinksWarn = cardWarnRow(
            STR.directLinksWillBreak(
              d.backlinksDirectCount,
              d.backlinksDirectMore,
              isBotUser(),
              d.backlinksTemplateCount,
              d.backlinksTemplateMore
            )
          );
          refreshDirectLinksWarn();
        }
        // הפניות אל הדף לא יובילו לערך אחרי העברה או הפיכה להפניה: בלי
        // הפניה הן נשברות, ועם הפניה הן הופכות להפניות כפולות.
        // הפניה שהיא יעד ההעברה עצמו נדרסת בהעברה, ולכן אינה נשברת.
        var redirectItems = d.backlinksItems.filter(function (item) {
          return item.redirect;
        });
        var fixableTitles = redirectItems
          .filter(function (item) { return !sameTitle(item.title, target); })
          .map(function (item) { return item.title; });
        var breakingCount =
          d.backlinksRedirectCount - (redirectItems.length - fixableTitles.length);
        if (d.action !== "none" && breakingCount > 0) {
          redirectsWarnCount = { count: breakingCount, more: d.backlinksRedirectMore };
          $redirectsWarn = cardWarnRow(
            STR.redirectsWillBreak(breakingCount, d.backlinksRedirectMore, redirectsWarnMode())
          ).insertBefore(rendered.actions);
        }
        redirectsToFix = {
          from: oldname,
          titles: fixableTitles,
          more: !!d.backlinksRedirectMore,
        };
        directLinksToFix = d.backlinksFailed
          ? null
          : {
              from: oldname,
              titles: d.backlinksItems
                .filter(function (item) { return !item.redirect && !item.template; })
                .map(function (item) { return item.title; }),
              templates: d.backlinksItems
                .filter(function (item) { return item.template; })
                .map(function (item) { return item.title; }),
              templatesMore: !!d.backlinksTemplateMore,
              more: !!d.backlinksDirectMore,
            };
        // אם היעד הוא אותו ערך, "הפיכה להפניה" כבר הפכה לפעולה הראשית.
        // אחרת משאירים אותה כאפשרות משנית כשהיעד קיים במכלול כערך מלא.
        if (
          d.target === "article" &&
          d.action !== "make_redirect" &&
          d.action !== "manual_review" &&
          d.action !== "none"
        ) {
          addAction(rendered, makeRedirectAction(redirectTo, "quiet"));
        }
      });

      attachDetailsPanel(rendered, result, {
        checklist: checklistPromise,
        onRedirectOverride: function (s) {
          redirectOverride = s;
          refreshMoveBtn();
        },
      });
    }

    function renderMoveState(result) {
      var isRedirect = result.status === "redirect";
      var wpTarget = isRedirect ? result.target : result.title;
      var target = toLocalTitle(wpTarget, currentPageName);
      renderMoveCard(
        result,
        target,
        isRedirect ? STR.redirectTitle : STR.renamedTitle,
        isRedirect ? STR.redirectToLabel : STR.newNameLabel,
        isRedirect ? redirectDestination(target, result.targetFragment) : target,
        {
          wpTarget: wpTarget,
          wpOldTitle: isRedirect ? result.title : result.from,
        }
      );
    }

    // מצב found: במצב רגיל נשאר מחוון-הגודל. אם מקור זיהוי קודם נכשל,
    // מציגים כרטיס שקוף למשתמש עם מסלול ההכרעה החלופי.
    function renderFoundState(result) {
      clearTool();
      runtime.addEnglishLink(result);
      var warning = showStandaloneWarning(result);
      if (!warning || !warning.terminal) runtime.showFoundSize(result);
    }

    // ==================================================================
    // 4. ביצוע העברה - articleexists נשאר ידני, redirectexists אוטומטי
    // ==================================================================
    // שליחת בקשה לדף הבקשות ממפעילים (מזהה 18228). מצב השמירה מוצג
    // בתוך הכרטיס שממנו נשלחה הבקשה, בלי הודעה קופצת.
    function requestToOperators(section, appendtext, summary, rendered) {
      setActionBusy(rendered, true);
      setActionStatus(rendered, STR.requestSaving, "progress");
      return api
        .postWithToken("edit", {
          action: "edit",
          format: "json",
          pageid: "18228",
          section: section,
          appendtext: appendtext,
          summary: summary,
        })
        .then(function (data) {
          if (!data.edit) throw new Error("request-not-saved");
          setActionStatus(rendered, STR.requestSaved, "success");
          return data;
        })
        .catch(function (error) {
          failAction(rendered, STR.requestFailed, error);
        });
    }

    function settled(promise) {
      return promise.then(
        function (value) { return { ok: true, value: value }; },
        function (error) { return { ok: false, error: error }; }
      );
    }

    function talkTitleForArticle(title) {
      return mw.config.get("wgFormattedNamespaces")[1] + ":" + title;
    }

    function findStructuredDiscussionArchiveFailure(moveData, oldname) {
      var subpages = moveData && Array.isArray(moveData.subpages)
        ? moveData.subpages
        : [];
      var oldTalk = talkTitleForArticle(oldname).replace(/_/g, " ");

      for (var i = 0; i < subpages.length; i++) {
        var subpage = subpages[i] || {};
        var from = String(subpage.from || "").replace(/_/g, " ");
        if (from.indexOf(oldTalk + "/") !== 0) continue;
        var errors = Array.isArray(subpage.errors) ? subpage.errors : [];
        var isStructuredDiscussion = errors.some(function (error) {
          return (
            error &&
            (error.code === "flow-error-protected-readonly" ||
              error.message === "flow-error-protected-readonly")
          );
        });
        if (isStructuredDiscussion) return { from: from, oldTalk: oldTalk };
      }
      return null;
    }

    function replaceArchiveBoxLink(wikitext, archiveTitle, oldTalkTitle) {
      if (archiveTitle.indexOf(oldTalkTitle + "/") !== 0) return null;
      var relativeTarget = archiveTitle.slice(oldTalkTitle.length);
      var escapedTarget = relativeTarget.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      var pattern = new RegExp(
        "(\\{\\{\\s*תיבת\\s+ארכיון\\s*\\|\\s*)\\*?\\s*" +
          "\\[\\[\\s*" + escapedTarget +
          "\\s*(?:\\|([^\\]]*))?\\]\\](\\s*\\}\\})"
      );
      var match = pattern.exec(wikitext);
      if (!match) return null;
      var label = match[2] && match[2].trim() ? match[2].trim() : "ארכיון";
      return wikitext.replace(
        pattern,
        "$1*[[" + archiveTitle + "|" + label + "]]$3"
      );
    }

    // קיצור-דרך: מטפלים רק בכשל המוכר של דף-משנה של דיונים מבניים,
    // ורק כאשר תיבת הארכיון עדיין מכילה קישור יחסי לאותו דף. מבנה מורכב יותר
    // נשאר לבדיקה ידנית במקום לבצע שינוי עיוור.
    function updateStructuredDiscussionArchive(moveData, oldname) {
      var failure = findStructuredDiscussionArchiveFailure(moveData, oldname);
      if (!failure) return Promise.resolve({ needed: false });

      var newTalkTitle = talkTitleForArticle(moveData.to);
      return api
        .edit(newTalkTitle, function (revision) {
          var updated = replaceArchiveBoxLink(
            revision.content,
            failure.from,
            failure.oldTalk
          );
          if (updated === null) {
            var err = new Error("archive-link-not-found");
            err.code = "archive-link-not-found";
            throw err;
          }
          return {
            text: updated,
            summary: STR.archiveUpdateSummary,
            minor: true,
            bot: true,
          };
        })
        .then(function () {
          return { needed: true, updated: true, archiveTitle: failure.from };
        });
    }

    function movePage(to, options, rendered) {
      to = to.replace(/_/g, " ");
      var oldname = currentPageName;
      var suppress = !!options.forcedNoRedirect;

      setActionBusy(rendered, true);
      if (!options.keepStatus) {
        setActionStatus(rendered, STR.moveStarting, "progress");
      }

      var moveParams = {
        action: "move",
        format: "json",
        from: oldname,
        to: to,
        reason: actionReason,
        movetalk: 1,
        movesubpages: 1,
      };
      if (suppress) moveParams.noredirect = 1;

      api
        .postWithToken("csrf", moveParams)
        .done(function (data) {
          if (!data.move) {
            failAction(rendered, STR.moveFailedTitle);
            return;
          }

          setActionStatus(rendered, STR.movePostUpdating, "progress");
          Promise.all([
            settled(updateTemplatePageField(data.move["to"])),
            settled(updateStructuredDiscussionArchive(data.move, oldname)),
          ]).then(function (results) {
            var templateResult = results[0];
            var archiveResult = results[1];
            var problems = [];

            if (!templateResult.ok) {
              problems.push(
                templateResult.error &&
                  templateResult.error.code === "template-not-found"
                  ? STR.templateMissing
                  : actionErrorMessage(STR.templateUpdateFailed, templateResult.error)
              );
            }

            if (!archiveResult.ok) {
              problems.push(
                archiveResult.error &&
                  archiveResult.error.code === "archive-link-not-found"
                  ? STR.archiveLinkMissing
                  : actionErrorMessage(STR.archiveUpdateFailed, archiveResult.error)
              );
            }

            var finalCard = showFinalTargetCard(
              problems.length ? "warning" : "success",
              problems.length
                ? STR.moveCompletedWithWarningsTitle
                : STR.moveCompletedTitle,
              problems.length ? problems.join(" ") : STR.moveCompletedBody,
              STR.moveCompletedTarget,
              data.move["to"]
            );
            // בלי הפניה רק אם ביקשנו, וגם השרת לא דיווח שנוצרה הפניה. השדה
            // מופיע (ריק) רק כשנוצרה הפניה.
            var noRedirect = !!suppress && !("redirectcreated" in data.move);
            // עם הפניה, ההפניות אל השם הישן הופכות לכפולות, וכלים אוטומטיים
            // מטפלים בהן. בלי הפניה הן נשברות, ולכן מוצעות לעדכון.
            if (noRedirect) appendRedirectFixes(finalCard, oldname, data.move["to"]);
            appendLinkFixes(finalCard, oldname, data.move["to"], noRedirect);
          });
        })
        .catch(function (error) {
          if (error === "missingtitle") {
            if (options.targetDeleted) {
              reportMoveFailure(rendered, to, true, null);
            } else {
              failAction(rendered, STR.pageMissingBody);
            }
            return;
          }
          if (error === "selfmove") {
            setActionStatus(rendered, STR.alreadyAtTarget, "progress");
            updateTemplatePageField(to)
              .then(function () {
                showFinalTargetCard(
                  "success",
                  STR.templateUpdatedTitle,
                  STR.templateUpdatedSelfMove,
                  null,
                  null
                );
              })
              .catch(function (err) {
                if (err && err.code === "template-not-found") {
                  failAction(rendered, STR.templateMissingNoMove);
                } else {
                  failAction(rendered, STR.templateUpdateFailedNoMove, err);
                }
              });
            return;
          }
          if (error === "redirectexists" && !options.retried) {
            setActionStatus(rendered, STR.retryRedirectExists, "progress");
            movePage(
              to,
              {
                retried: true,
                forcedNoRedirect: suppress,
                targetDeleted: !!options.targetDeleted,
                keepStatus: true,
                redirectTo: options.redirectTo,
              },
              rendered
            );
            return;
          }
          if (error === "articleexists" || error === "redirectexists") {
            handleBlockedMove(
              to,
              oldname,
              actionReason,
              suppress,
              options.redirectTo
            );
            return;
          }
          reportMoveFailure(rendered, to, !!options.targetDeleted, error);
        });
    }

    function handleBlockedMove(
      to,
      oldname,
      reason,
      suppressRedirect,
      redirectTo
    ) {
      fetchLocalPageData(to, true).then(function (targetData) {
        var targetStatus = targetData.status;
        var identity =
          targetStatus === "article"
            ? describeIdentity(runtime.getOwnFields(), targetData.fields)
            : null;

        if (identity && identity.verdict === "same") {
          showCard({
            type: "warning",
            title: STR.targetOccupiedTitle,
            html: STR.targetSameReason + " " + identity.text,
            actions: [makeRedirectAction(redirectTo, "primary")],
          });
          return;
        }

        if (targetStatus === "unchecked") {
          showCard({
            type: "warning",
            title: STR.targetOccupiedTitle,
            html: STR.targetIdentityUncheckedReason,
            actions: [retryAction()],
          });
          return;
        }

        var occupiedActions = occupiedReviewActions(
          to,
          oldname,
          reason,
          targetStatus,
          suppressRedirect,
          redirectTo
        );
        var occupiedText =
          identity && identity.verdict === "unknown"
            ? STR.targetUnknownReason
            : (canDeleteTarget(targetStatus) && canMove(!!suppressRedirect)
                ? STR.targetOccupiedOperator
                : STR.targetOccupiedUser) + (identity ? " " + identity.text : "");
        showCard({
          type: "warning",
          title: STR.targetOccupiedTitle,
          html: occupiedText,
          actions: occupiedActions,
        });
      });
    }

    // ==================================================================
    // 5. פעולות תומכות
    // ==================================================================
    function updateRed(to, rendered) {
      var textpage = "#הפניה[[" + to + "]]";
      if (!confirm("התוכן החדש יהיה: " + textpage)) {
        clearActionState(rendered);
        return;
      }

      setActionBusy(rendered, true);
      setActionStatus(rendered, STR.redirectStarting, "progress");
      api
        .postWithToken("csrf", {
          action: "edit",
          format: "json",
          bot: true,
          nocreate: 1,
          title: currentPageName,
          text: textpage,
        })
        .then(function (data) {
          if (!data.edit) throw new Error("redirect-not-saved");
          // ההפניות אל הדף הופכות להפניות כפולות; כלים אוטומטיים מטפלים בהן.
          showFinalTargetCard(
            "success",
            STR.redirectCompletedTitle,
            STR.redirectCompletedBody,
            STR.redirectCompletedTarget,
            to
          );
        })
        .catch(function (error) {
          failAction(rendered, STR.redirectFailed, error);
        });
    }

    // עריכת שדה דף= דרך עוזר העריכה המובנה של מדיה-ויקי. הקריאה והעדכון
    // נשענים על אותו מפענח של {{מיון ויקיפדיה}} מהקובץ הראשי.
    function updateTemplatePageField(to) {
      var fieldValue = wikipediaTitleForTarget[normalizeTitle(to)] || to;
      return api.edit(to, function (revision) {
        var data = revision.content;
        var updated = replaceWikipediaSortPageField(data, fieldValue);
        if (updated === null) {
          var err = new Error("template-not-found");
          err.code = "template-not-found";
          throw err;
        }
        return {
          text: updated,
          summary: "מיון ויקיפדיה",
          minor: true,
          bot: true,
        };
      });
    }

    // מחזירה מערך פעולות למחיקה, במקום להזריק כפתור נפרד לגוף הדף
    function deleteActions(reason) {
      var page = currentPageName;

      if (can("deletePage")) {
        return [
          makeAction(
            STR.btnDelete,
            "danger",
            null,
            mw.util.getUrl(page, { action: "delete", wpReason: reason })
          ),
        ];
      }

      return [
        makeAction(STR.btnRequestDelete, "danger", function (event, rendered) {
          requestToOperators(
            "1",
            "\n\n*{{בקשת מחיקה|" + page + "|" + reason + "}}" + " ~~" + "~~",
            "/* בקשות מחיקה */ [[" + page + "]]",
            rendered
          );
        }),
      ];
    }

    // ==================================================================
    // דף שהוא הפניה במכלול
    // ==================================================================
    // שאלה אחת קובעת: האם ההפניה מביאה את הקורא לערך.
    // תקינה: אותו יעד כמו בוויקיפדיה = שקט; אחרת שיקוף בלבד, כי המכלול
    // מחליט בעצמו על יעדי הפניות. שבורה (יעד חסר, או יעד שהוא הפניה):
    // מחפשים יעד לפי הסדר שהוחלט, ומציעים רק עדכון יעד. אף פעם לא העברה
    // ולא מחיקה.

    function wikipediaTargetOf(result) {
      if (result.status === "redirect") {
        return { title: result.target, fragment: result.targetFragment || null };
      }
      if (result.status === "renamed") return { title: result.title, fragment: null };
      return null;
    }

    function wikipediaStateLine(result) {
      var status = result.status;
      if (status === "redirect") {
        return STR.lrWikiRedirect(redirectDestination(result.target, result.targetFragment));
      }
      if (status === "renamed") return STR.lrWikiRenamed(result.title);
      if (status === "found") return STR.lrWikiArticle;
      if (status === "disambiguation") return STR.lrWikiDisambig;
      if (status === "deleted") return STR.lrWikiDeleted;
      if (status === "moved_to_other_namespace") return STR.lrWikiOtherNamespace;
      return STR.lrWikiUnknown;
    }

    // הסדר: קודם החלטות המכלול (שרשרת ההפניות, ההעברה שבוצעה), ורק אחר
    // כך ויקיפדיה. כשל באחד השלבים עוצר את החיפוש: אי אפשר להציע יעד של
    // שלב מאוחר בלי לדעת מה השלב הקודם היה מציע.
    function findRedirectDestination(chain, local, wp) {
      if (chain.hops.length > 1 && chainEndsInArticle(chain)) {
        var last = chain.hops[chain.hops.length - 1];
        return Promise.resolve({
          step: "chain",
          title: chain.finalTitle,
          fragment: local.fragment || last.tofragment || null,
        });
      }
      var missingTitle = chain.finalMissing ? chain.finalTitle : null;
      return (missingTitle ? followLocalMoves(missingTitle) : Promise.resolve(null)).then(
        function (movedTo) {
          if (movedTo && !sameTitle(movedTo, currentPageName)) {
            return { step: "moved", title: movedTo, fragment: local.fragment, from: missingTitle };
          }
          if (!wp) return null;
          return resolveLocalArticle(wp.title).then(function (article) {
            if (!article || sameTitle(article, currentPageName)) return null;
            return {
              step: "wikipedia",
              title: article,
              fragment: sameTitle(article, wp.title) ? wp.fragment : null,
            };
          });
        }
      );
    }

    function retargetAction(local, found) {
      var from = redirectDestination(local.title, local.fragment);
      var to = redirectDestination(found.title, found.fragment);
      return makeAction(STR.btnRetargetRedirect, "primary", function (event, rendered) {
        if (!confirm(STR.retargetConfirm(from, to))) return;
        setActionBusy(rendered, true);
        setActionStatus(rendered, STR.retargetStarting, "progress");
        retargetRedirect(currentPageName, found.title, {
          fragment: found.fragment || null,
          expectTarget: local.title,
        }).then(
          function () {
            showFinalTargetCard(
              "success",
              STR.retargetDoneTitle,
              STR.retargetDoneBody,
              STR.redirectCompletedTarget,
              to
            );
          },
          function (err) {
            failAction(rendered, STR.retargetFailed, err);
          }
        );
      });
    }

    function showLocalRedirectCard(o) {
      var localText = redirectDestination(o.local.title, o.local.fragment);
      var actions = [];
      if (o.found) actions.push(retargetAction(o.local, o.found));
      var rendered = showCard({
        type: o.healthy ? "notice" : "warning",
        title: o.healthy ? STR.lrDifferentTitle : STR.lrBrokenTitle,
        html: "",
        actions: actions,
      });
      var localLine = STR.lrLocalLine(localText);
      if (!o.healthy) {
        localLine += " " + (o.chain.hops.length > 1 ? STR.lrLocalIsRedirect : STR.lrLocalMissing);
      }
      rendered.text
        .append($("<div>", { text: localLine }))
        .append($("<div>", { text: STR.lrWikiLine(wikipediaStateLine(o.result)) }));
      if (o.healthy) return;

      var $decision = $("<div>", { class: "hmk-carddecision" });
      if (o.found) {
        var dest = redirectDestination(o.found.title, o.found.fragment);
        var reason =
          o.found.step === "chain"
            ? STR.lrReasonChain
            : o.found.step === "moved"
            ? STR.lrReasonMoved(o.found.from)
            : STR.lrReasonWikipedia;
        $decision
          .append($("<strong>", { text: STR.lrProposedLead + " " }))
          .append(bindLocalPreview($("<a>", { href: mw.util.getUrl(dest), text: dest }), o.found.title, dest))
          .append(document.createTextNode(" — " + reason));
      } else {
        $decision.text(STR.lrNoDestination);
      }
      if (rendered.actions) $decision.insertBefore(rendered.actions);
      else rendered.body.append($decision);
    }

    function renderLocalRedirect(result) {
      var wp = wikipediaTargetOf(result);
      return resolveLocalChain(currentPageName)
        .then(function (chain) {
          var first = chain.hops[0];
          if (!first || !first.to) throw structureError("יעד ההפניה במכלול");
          var local = { title: first.to, fragment: first.tofragment || null };
          var healthy = chain.hops.length === 1 && chainEndsInArticle(chain);
          if (healthy) {
            var same =
              !!wp &&
              sameTitle(toWikipediaTitle(local.title), wp.title) &&
              (result.status !== "redirect" ||
                normalizeTitle(local.fragment) === normalizeTitle(wp.fragment));
            if (same) {
              clearTool();
              runtime.showMatchIndicator();
              return;
            }
            showLocalRedirectCard({ healthy: true, local: local, chain: chain, result: result });
            return;
          }
          return findRedirectDestination(chain, local, wp).then(function (found) {
            showLocalRedirectCard({
              healthy: false,
              local: local,
              chain: chain,
              result: result,
              found: found,
            });
          });
        })
        .catch(function (err) {
          if (err && err.silent) return;
          console.error(err);
          showFailure(err);
        });
    }

    // ==================================================================
    // דף שאינו קיים במכלול
    // ==================================================================
    // הפניות בוויקיפדיה אל השם הזה, שקיימות במכלול כערך. הכרטיס משקף בלבד:
    // בדף הערך שנמצא הכלי עצמו מציג את הפעולה. תיוג מנטרים מוצע למי שיכול
    // לערוך ואינו יכול להעביר בעצמו.
    function renderMissingPage(titles, feature) {
      var rendered = showCard({ type: "notice", title: STR.missingTitle, html: "" });
      var canTag = !can("moveWithRedirect");
      titles.forEach(function (title) {
        var $status = $("<span>", { class: "hmk-redirect-fix-status" });
        var $row = $("<div>", { class: "hmk-redirect-fix hmk-missing-row" })
          .append(bindLocalPreview($("<a>", { href: mw.util.getUrl(title), text: title }), title))
          .append(document.createTextNode(" " + STR.missingRowText));
        if (canTag) {
          var $tag = $("<button>", {
            type: "button",
            class: "hmk-btn hmk-btn-quiet",
            text: STR.btnTagMonitors,
          });
          $tag.on("click", function () {
            $tag.prop("disabled", true);
            $status.text(STR.tagSaving);
            feature.tagMonitors(title).then(
              function (res) {
                $tag.remove();
                $status
                  .empty()
                  .append(document.createTextNode(STR.tagDone + " "))
                  .append($("<a>", { href: mw.util.getUrl(res.page), text: STR.tagDoneLink }));
              },
              function (err) {
                $tag.prop("disabled", false);
                $status.text(actionErrorMessage(STR.tagFailed, err));
              }
            );
          });
          $row.append($tag);
        }
        rendered.text.append($row.append($status));
      });
      rendered.text.append($("<div>", { text: STR.missingFooter }));
      if (userCapabilitiesLoadFailed) appendCardWarning(rendered, STR.permissionsLoadFailed);
      return rendered;
    }

    function showFailure(error) {
      showCard({
        type: "error",
        title: STR.checkFailedTitle,
        html:
          error && error.netError && error.message
            ? error.message
            : STR.checkFailedBody,
        actions: [retryAction()],
      });
    }

    return {
      renderResult: renderResult,
      renderLocalRedirect: renderLocalRedirect,
      renderMissingPage: renderMissingPage,
      showFailure: showFailure,
    };
  };
})();
