mw.loader.using("mediawiki.util").then(function () {
  // ==== שער כניסה - זהה למקור: אילו עמודים בכלל מריצים את הכלי ====
  const isMobileWiew =
    document.getElementsByClassName("minerva-header").length > 0;
  // דף שאינו קיים במכלול: מסלול נפרד ("נראה שהערך קיים בשם אחר"), שרץ גם
  // במסך העריכה - שם נוצרים ערכים כפולים. בכל דף אחר רק בצפייה, כמו תמיד.
  const isMissingPage =
    mw.config.get("wgArticleId") === 0 &&
    mw.config.get("wgNamespaceNumber") === 0;
  const isToolAction =
    mw.config.get("wgAction") === "view" ||
    (isMissingPage && mw.config.get("wgAction") === "edit");
  const isCategoryMatched =
    mw.config.get("wgCategories") &&
    mw.config.get("wgNamespaceNumber") === 0 &&
    mw.config.get("wgPageName") != "עמוד_ראשי" &&
    isToolAction &&
    location.href.indexOf("&diff") == -1 &&
    mw.config.get("wgCategories").indexOf("המכלול: ערכים שנוצרו במכלול") == -1 &&
    mw.config.get("wgCategories").indexOf("המכלול: פירושונים שנוצרו במכלול") == -1 &&
    mw.config.get("wgCategories").indexOf("המכלול: ערכים שתורגמו במכלול") == -1;
  const useDirectWikipediaSource =
    mw.user.options.get("userjs-import-source") === "direct";
  const addres = useDirectWikipediaSource
    ? "https://he.wikipedia.org/w/api.php"
    : "https://import.hamichlol.org.il";

  if (
    (isMobileWiew || isCategoryMatched) &&
    (mw.config.get("wgNamespaceNumber") === 0 ||
      ((mw.config.get("wgUserGroups").includes("technicalbot") ||
        mw.config.get("wgUserGroups").includes("bot")) &&
        mw.config.get("wgNamespaceNumber") !== -1 &&
        mw.config.get("wgNamespaceNumber") !== 2)) &&
    !mw.config.get("wgIsMainPage") &&
    isToolAction &&
    location.href.indexOf("&diff") === -1
  ) {
    const MAX_CHAIN_DEPTH = 5;

    // ==================================================================
    // כללי השמות של המכלול מול ויקיפדיה. כל הבדל שהכללים האלה לא מסבירים
    // אינו מוסכמה, ושם ויקיפדיה גובר עליו.
    // ==================================================================
    // מהשם במכלול לשם בוויקיפדיה (לחיפוש ולהשוואה).
    function toWikipediaTitle(title) {
      return String(title || "")
        .replace(/_/g, " ")
        .trim()
        .replace(/^רבי /, "")
        .replace(/^הרב /, "")
        .replace(/ה"קדוש(ה|ים)?"/g, "הקדוש$1")
        .replace(/אישיות מהתנ"ך/g, "דמות מקראית")
        .replace(/א-ל/g, "אל");
    }

    // מהשם בוויקיפדיה לשם במכלול: מעבירים לשם החדש רק את הכללים שהופיעו
    // בשם המקומי הנוכחי. אם ההמרה חזרה אינה מחזירה בדיוק את שם ויקיפדיה,
    // לא מנחשים ומחזירים את שם ויקיפדיה כמות שהוא.
    function toLocalTitle(wpTitle, localTitle) {
      var wp = String(wpTitle || "").replace(/_/g, " ").trim();
      var local = String(localTitle || "").replace(/_/g, " ").trim();
      if (!wp || !local) return wp;
      var out = wp;
      var prefix = local.match(/^(רבי|הרב) /);
      if (prefix && out.indexOf(prefix[0]) !== 0) out = prefix[0] + out;
      if (local.indexOf('אישיות מהתנ"ך') !== -1) {
        out = out.replace(/דמות מקראית/g, 'אישיות מהתנ"ך');
      }
      local.split(" ").forEach(function (token) {
        if (!/ה"קדוש|א-ל/.test(token)) return;
        var wpToken = toWikipediaTitle(token);
        if (!wpToken || wpToken === token) return;
        out = out
          .split(" ")
          .map(function (part) { return part === wpToken ? token : part; })
          .join(" ");
      });
      return toWikipediaTitle(out) === toWikipediaTitle(wp) ? out : wp;
    }

    var PageName =
      $("#wikiPageName").text() || toWikipediaTitle(mw.config.get("wgPageName"));

    // ==================================================================
    // מחרוזות ליבה בלבד - נדרשות עוד לפני שכרטיס קיים.
    // כל מלל הכרטיסים נטען עצל מדף ההודעות רק אם באמת נדרש כרטיס.
    // ==================================================================
    var STR = {
      loadingState: "בודק מצב הערך בוויקיפדיה…",
      retrying: function (n, max) {
        return "אין תשובה מהשרת, מנסה שוב (" + n + " מתוך " + max + ")…";
      },
      netNoConnection: "אין חיבור לרשת.",
      netTimeout: "השרת לא ענה בזמן.",
      netServerBusy: "השרת עמוס או אינו זמין כעת.",
      netFilter: "הבקשה נחסמה בסינון.",
      netNotFound: "הכתובת המבוקשת לא נמצאה.",
      netParse: "התשובה מהשרת אינה ניתנת לפענוח.",
      netStructure: "התשובה מהשרת התקבלה, אך חסר בה מידע צפוי.",
      netHttpError: function (code) {
        return "השרת החזיר קוד מצב " + code + ".";
      },
      netApiError: function (code) {
        return "השרת החזיר שגיאה: " + code;
      },
      netUnknown: "שגיאה לא מזוהה בפנייה לשרת.",
      sizeWikiPlus: function (n) {
        return "ויקיפדיה: +" + n;
      },
      sizeWikiMinus: function (n) {
        return "ויקיפדיה: " + n;
      },
      sizeWikiEqual: "ויקיפדיה: זהה",
      sizeNotChecked: "השוואת הגודל: לא נבדקה",
      assetLoadFailed: "לא ניתן לטעון את משאבי הכרטיס. רענן את הדף ונסה שוב.",
      detailsLoadFailed: "לא ניתן לטעון את פרטי הכרטיס. סגור ופתח שוב את הפרטים כדי לנסות מחדש.",
      logFloorUnchecked:
        "זמן יצירת הדף במכלול לא נבדק, ולכן לא ניתן להכריע לפי יומן ויקיפדיה.",
      updateTrigger: "מאז הייבוא",
      updateTriggerLoading: "מאז הייבוא…",
      updateTriggerFailed: "מאז הייבוא · הטעינה נכשלה, נסה שוב",
      redirectsTrigger: function (missing, separate) {
        var parts = [];
        if (missing) parts.push("הפניות חסרות (" + missing + ")");
        if (separate) parts.push("ערך נפרד (" + separate + ")");
        return parts.length ? parts.join(" · ") : "הפניות מוויקיפדיה";
      },
    };

    // ==================================================================
    // 0. שכבת עיצוב - מינימליסטי: קו-הדגשה דק, בלי צללים, בלי אנימציית כניסה
    // ==================================================================
    var STYLES = [
      // בסיס זעיר בלבד: רכיבים שיכולים להופיע גם בלי כרטיס.
      ".hmk-tool{display:flex;flex-wrap:wrap;align-items:flex-start;gap:.75rem;",
      "margin:0 0 1rem;font-size:.9375rem;line-height:1.5;",
      "font-family:inherit;-webkit-font-smoothing:antialiased}",
      ".hmk-skeleton{display:flex;align-items:center;gap:.5rem;",
      "padding:.55rem .75rem;color:#5f6368;font-size:.875rem}",
      ".hmk-spinner{width:13px;height:13px;border:2px solid #e3e5e8;border-top-color:#3366cc;",
      "border-radius:50%;animation:hmk-spin .7s linear infinite}",
      "@keyframes hmk-spin{to{transform:rotate(360deg)}}",
      ".hmk-diff{display:inline-flex;align-items:center;gap:.25rem;padding:.1rem .5rem;",
      "border-radius:6px;font-size:.8125rem;font-weight:600;white-space:nowrap}",
      ".hmk-diff-pos{background:rgba(28,156,127,.12);color:#12735d}",
      ".hmk-diff-neg{background:rgba(210,74,58,.12);color:#a5341f}",
      ".hmk-diff-null{background:rgba(154,160,166,.16);color:#5f6368}",
      ".hmk-diff-strong{box-shadow:inset 0 0 0 1px currentColor}",
      ".hmk-diff-alt{opacity:.6;font-weight:400;margin-inline-start:.25rem;font-size:.8125rem}",
      // פקד "מאז הייבוא" בלבד. החלונית עצמה ועיצובה נמצאים בקובץ העדכון,
      // ומוצגים מתחת לכותרת, לא בתוך שורת המחוון.
      ".hmk-size-wrap{display:inline-flex;flex-wrap:wrap;align-items:center;gap:.35rem}",
      ".hmk-update-toggle,.hmk-redirects-toggle{display:inline-flex;align-items:center;gap:.28rem;border:1px solid transparent;",
      "border-radius:5px;background:transparent;padding:.12rem .34rem;color:#54595d;cursor:pointer;",
      "font:inherit;font-size:.78rem;line-height:1.35;white-space:nowrap}",
      ".hmk-update-toggle:hover,.hmk-redirects-toggle:hover{background:#f1f3f4;color:#202122}",
      ".hmk-update-toggle:focus-visible,.hmk-redirects-toggle:focus-visible{outline:2px solid #36c;outline-offset:1px}",
      ".hmk-update-toggle[disabled],.hmk-redirects-toggle[disabled]{color:#72777d;cursor:default;background:transparent}",
      ".hmk-update-chevron{font-size:.7rem;line-height:1;color:#72777d;transition:transform .12s ease}",
      ".hmk-update-toggle[aria-expanded='true'] .hmk-update-chevron,",
      ".hmk-redirects-toggle[aria-expanded='true'] .hmk-update-chevron{transform:rotate(180deg)}",
      "html.skin-theme-clientpref-night .hmk-update-toggle,html.skin-theme-clientpref-night .hmk-redirects-toggle{color:#b7b7b7}",
      "html.skin-theme-clientpref-night .hmk-update-toggle:hover,",
      "html.skin-theme-clientpref-night .hmk-redirects-toggle:hover{background:rgba(255,255,255,.06);color:#e3e3e3}",
    ].join("");


    // משאבי הכרטיס נטענים עצל ורק כאשר תוצאה באמת דורשת כרטיס.
    // הכרטיס עצמו נבנה רק אחרי שגם ה-CSS וגם קובץ ההודעות סיימו להיטען,
    // כדי למנוע הבזק קצר של תוכן לא-מעוצב.
    var CARD_STYLE_PAGE = "משתמש:בוט גאון הירדן/Gadget page tool.css";
    var CARD_MESSAGES_PAGE = "משתמש:בוט גאון הירדן/Gadget page tool.messages.js";
    var CARD_SCRIPT_PAGE = "משתמש:בוט גאון הירדן/Gadget page tool.card.js";
    var CARD_MESSAGES_GLOBAL = "HMK_PAGE_TOOL_MESSAGES";
    var CARD_SCRIPT_GLOBAL = "HMK_PAGE_TOOL_CARD_FACTORY";
    var cardAssetsPromise = null;

    // הרשאות המשתמש: זה המקום היחיד שבו ממפים הרשאות מדיה־ויקי
    // ליכולות שהכרטיס צריך. הרשאות נטענות רק אם באמת נדרש כרטיס.
    // כל משתמש רשום רשאי לערוך, ולכן אין יכולת נפרדת לעריכה או לבקשה.
    var userCapabilitiesPromise = null;
    var userCapabilitiesLoadFailed = false;
    var userCapabilities = {
      moveWithRedirect: false,
      moveWithoutRedirect: false,
      deletePage: false,
      deleteRedirect: false,
      createRedirect: false,
    };

    function loadUserCapabilities() {
      if (userCapabilitiesPromise) return userCapabilitiesPromise;
      userCapabilitiesLoadFailed = false;
      // שאילתה ישירה ולא פונקציית ההרשאות של הליבה: זו מחזירה רשימה ריקה
      // בכשל ושומרת את התוצאה במטמון, ולכן ניסיון חוזר דרכה לא ישלוף שוב.
      // גם משתמש אנונימי מקבל הרשאת קריאה, ולכן רשימה ריקה פירושה כשל.
      userCapabilitiesPromise = ensureCore()
        .then(function (activeCore) {
          return activeCore.localQuery({ meta: "userinfo", uiprop: "rights" });
        })
        .then(function (data) {
          var rights = data.query && data.query.userinfo && data.query.userinfo.rights;
          if (!Array.isArray(rights) || !rights.length) {
            throw core.structureError("הרשאות המשתמש");
          }
          function has(right) {
            return rights.indexOf(right) !== -1;
          }
          userCapabilities = {
            moveWithRedirect: has("move"),
            moveWithoutRedirect: has("move") && has("suppressredirect"),
            deletePage: has("delete"),
            deleteRedirect: has("delete") || has("delete-redirect"),
            createRedirect: has("createpage"),
          };
          return userCapabilities;
        })
        .catch(function () {
          userCapabilitiesLoadFailed = true;
          userCapabilitiesPromise = null;
          return userCapabilities;
        });
      return userCapabilitiesPromise;
    }

    function rawPageUrl(title, ctype) {
      return mw.util.getUrl(title, { action: "raw", ctype: ctype });
    }

    function loadCardStylesheet() {
      return new Promise(function (resolve, reject) {
        var existing = document.getElementById("hmk-card-stylesheet");
        if (existing) {
          if (existing.getAttribute("data-hmk-loaded") === "1") {
            resolve();
            return;
          }
          existing.addEventListener("load", resolve, { once: true });
          existing.addEventListener("error", reject, { once: true });
          return;
        }

        var link = document.createElement("link");
        link.id = "hmk-card-stylesheet";
        link.rel = "stylesheet";
        link.href = rawPageUrl(CARD_STYLE_PAGE, "text/css");
        link.onload = function () {
          link.setAttribute("data-hmk-loaded", "1");
          resolve();
        };
        link.onerror = function () {
          link.remove();
          reject(new Error("card-style-load-failed"));
        };
        document.head.appendChild(link);
      });
    }

    function loadCardMessages() {
      var existing = window[CARD_MESSAGES_GLOBAL];
      if (existing) {
        Object.assign(STR, existing);
        return Promise.resolve();
      }
      return Promise.resolve(
        mw.loader.getScript(rawPageUrl(CARD_MESSAGES_PAGE, "text/javascript"))
      ).then(function () {
        var messages = window[CARD_MESSAGES_GLOBAL];
        if (!messages || typeof messages !== "object") {
          throw new Error("card-messages-missing");
        }
        Object.assign(STR, messages);
      });
    }

    function loadCardScript() {
      if (typeof window[CARD_SCRIPT_GLOBAL] === "function") {
        return Promise.resolve();
      }
      return Promise.resolve(
        mw.loader.getScript(rawPageUrl(CARD_SCRIPT_PAGE, "text/javascript"))
      ).then(function () {
        if (typeof window[CARD_SCRIPT_GLOBAL] !== "function") {
          throw new Error("card-script-missing");
        }
      });
    }

    function createCardContext() {
      return {
        STR: STR,
        MAX_CHAIN_DEPTH: MAX_CHAIN_DEPTH,
        normalizeTitle: core.normalizeTitle,
        filterAndSortLog: core.filterAndSortLog,
        fetchLocalPageData: core.fetchLocalPageData,
        wpQuery: core.wpQuery,
        localQuery: core.localQuery,
        firstPage: core.firstPage,
        netGet: core.netGet,
        structureError: core.structureError,
        toolContainer: toolContainer,
        clearTool: clearTool,
        runPageCheck: runPageCheck,
        addEnglishLink: addEnglishLink,
        showFoundSize: showFoundSize,
        getOwnFields: core.getOwnFields,
        getLocalCreationTs: core.getLocalCreationTs,
        getLocalCreationFailed: core.getLocalCreationFailed,
        getCurrentLocalPage: core.getCurrentLocalPage,
        userCapabilities: userCapabilities,
        userCapabilitiesLoadFailed: userCapabilitiesLoadFailed,
        replaceWikipediaSortPageField: core.replaceWikipediaSortPageField,
        extractTemplateFields: core.extractTemplateFields,
        parseRedirectLine: core.parseRedirectLine,
        toWikipediaTitle: toWikipediaTitle,
        toLocalTitle: toLocalTitle,
      };
    }

    function ensureCardAssets() {
      if (cardAssetsPromise) return cardAssetsPromise;
      cardAssetsPromise = Promise.all([
        mw.loader.using("mediawiki.api"),
        loadUserCapabilities(),
        loadCardStylesheet(),
        loadCardMessages(),
        loadCardScript(),
      ])
        .then(function () {
          var module = window[CARD_SCRIPT_GLOBAL](createCardContext());
          if (!module || typeof module.renderResult !== "function") {
            throw new Error("card-module-invalid");
          }
          if (userCapabilitiesLoadFailed) cardAssetsPromise = null;
          return module;
        })
        .catch(function (err) {
          cardAssetsPromise = null;
          throw err;
        });
      return cardAssetsPromise;
    }

    function showAssetLoadFailure(err) {
      console.error(err);
      toolContainer()
        .empty()
        .append($("<div>", {
          class: "hmk-skeleton",
          dir: "rtl",
          text: STR.assetLoadFailed,
        }));
    }

    var stylesInjected = false;
    function ensureStyles() {
      if (stylesInjected) return;
      mw.util.addCSS(STYLES);
      stylesInjected = true;
    }

    // מכל יחיד בראש גוף הדף - במקום ערימת prepend נפרדים
    function toolContainer() {
      ensureStyles();
      var $container = $("#hmk-tool");
      if (!$container.length) {
        $container = $("<div>", { id: "hmk-tool", class: "hmk-tool" });
        $("#bodyContent").prepend($container);
      }
      return $container;
    }

    function showLoading() {
      toolContainer()
        .empty()
        .append(
          $("<div>", { class: "hmk-skeleton", dir: "rtl" })
            .append($("<span>", { class: "hmk-spinner" }))
            .append($("<span>", { text: STR.loadingState }))
        );
    }

    function clearTool() {
      $("#hmk-tool").remove();
    }

    // ==================================================================
    // ליבת ההכרעה - נטענת כקובץ נפרד. הקובץ הראשי נשאר שער + תצוגה.
    // ==================================================================
    var CORE_SCRIPT_PAGE = "משתמש:בוט גאון הירדן/Gadget page tool.core.js";
    var CORE_GLOBAL = "HMK_PAGE_TOOL_CORE_FACTORY";
    var corePromise = null;
    var core = null;

    function showRetryNotice(nextAttempt, maxAttempts) {
      var text = STR.retrying(nextAttempt, maxAttempts);
      $("#hmk-tool .hmk-skeleton span").not(".hmk-spinner").text(text);
      $("#hmk-tool .hmk-check-loading span").not(".hmk-spinner").text(text);
    }

    function ensureCore() {
      if (core) return Promise.resolve(core);
      if (corePromise) return corePromise;

      function createCore() {
        if (typeof window[CORE_GLOBAL] !== "function") {
          throw new Error("page-tool-core-missing");
        }
        core = window[CORE_GLOBAL]({
          STR: STR,
          MAX_CHAIN_DEPTH: MAX_CHAIN_DEPTH,
          address: addres,
          onRetry: showRetryNotice,
        });
        if (!core || typeof core.run !== "function") {
          throw new Error("page-tool-core-invalid");
        }
        return core;
      }

      if (typeof window[CORE_GLOBAL] === "function") {
        corePromise = Promise.resolve().then(createCore);
      } else {
        corePromise = Promise.resolve(
          mw.loader.getScript(rawPageUrl(CORE_SCRIPT_PAGE, "text/javascript"))
        ).then(createCore);
      }
      return corePromise;
    }

    function resultNeedsCardAssets(result) {
      if (result.status !== "found") return true;
      return !!(
        result.revidDeletedNotice ||
        (result.sourceFailures && result.sourceFailures.length)
      );
    }

    function renderResultWhenReady(result) {
      if (!resultNeedsCardAssets(result)) {
        renderFoundWithoutCard(result);
        return Promise.resolve();
      }
      // כשל בטעינת משאבי הכרטיס אינו כשל של הבדיקה: ההכרעה כבר התקבלה.
      // לכן מנסים לטעון פעם נוספת ומציגים את התוצאה עצמה, ורק אם גם זה
      // נכשל מציגים את הודעת כשל הטעינה. חריגה בזמן בניית הכרטיס עצמו
      // היא תקלה בקוד, והיא ממשיכה לכרטיס הכשל כמו קודם.
      return ensureCardAssets()
        .catch(function (err) {
          console.error(err);
          return ensureCardAssets();
        })
        .then(function (card) {
          card.renderResult(result);
        }, showAssetLoadFailure);
    }

    // דף שהוא הפניה במכלול עובר תמיד למסלול ההפניות של הכרטיס: לא מחוון
    // גודל, לא "מאז הייבוא", ולא כרטיסי ההעברה והמחיקה של ערך.
    function renderLocalRedirectWhenReady(result) {
      return ensureCardAssets()
        .catch(function (err) {
          console.error(err);
          return ensureCardAssets();
        })
        .then(function (card) {
          return card.renderLocalRedirect(result);
        }, showAssetLoadFailure);
    }

    function showFailureCardWhenReady(error) {
      return ensureCardAssets()
        .then(function (card) {
          card.showFailure(error);
        })
        .catch(showAssetLoadFailure);
    }

    function addEnglishLink(result) {
      var page = result && result.page;
      var langLinks = page && page.langlinks;
      if (!langLinks || !langLinks.length || $("#p-lang .hmk-en-link").length) return;
      var nav = $(
        '<div class="vector-menu-content hmk-en-link">' +
          '<ul class="vector-menu-content-list"><li class="interlanguage-link interwiki-en"><a href=' +
          langLinks[0].url +
          ' title="אנגלית" lang="en" hreflang="en" class="interlanguage-link-target" target="blank">אנגלית</a></li></ul>'
      );
      $("#p-lang").append(nav);
    }

    function showFoundSize(result) {
      var revision = result.page.revisions[0];
      var wikisize = revision.size;
      var localPage = core.getCurrentLocalPage();
      showSizeIndicator(
        localPage && typeof localPage.size === "number"
          ? wikisize - localPage.size
          : null,
        result.title,
        // כשידוע שגרסת הייבוא נמחקה אין ממנה נקודת השוואה.
        result.revidDeletedNotice ? null : revision.revid
      );
    }

    function renderFoundWithoutCard(result) {
      clearTool();
      addEnglishLink(result);
      showFoundSize(result);
    }

    // ==================================================================
    // "מאז הייבוא" - יכולת עצמאית בקובץ נפרד. כאן רק הפקד והטוען:
    // עד הלחיצה הראשונה אין שום בקשה, וכשהגרסה בוויקיפדיה היא גרסת
    // הייבוא עצמה הפקד לא מוצג כלל, כי אין מה לבדוק.
    // ==================================================================
    var UPDATE_SCRIPT_PAGE = "משתמש:בוט גאון הירדן/Gadget page tool.update.js";
    var UPDATE_GLOBAL = "HMK_PAGE_TOOL_UPDATE_FACTORY";
    var updateFeaturePromise = null;

    function asRevisionId(value) {
      var text = value === null || value === undefined ? "" : String(value).trim();
      return /^[1-9]\d*$/.test(text) ? text : null;
    }

    function importedRevisionId() {
      return asRevisionId(core.getOwnFields()["גרסה"]);
    }

    function loadUpdateFeature() {
      if (updateFeaturePromise) return updateFeaturePromise;
      updateFeaturePromise = (typeof window[UPDATE_GLOBAL] === "function"
        ? Promise.resolve()
        : Promise.resolve(
            mw.loader.getScript(rawPageUrl(UPDATE_SCRIPT_PAGE, "text/javascript"))
          )
      )
        .then(function () {
          if (typeof window[UPDATE_GLOBAL] !== "function") {
            throw new Error("update-script-missing");
          }
          var feature = window[UPDATE_GLOBAL]({
            localQuery: core.localQuery,
            netGet: core.netGet,
            directWikipediaSource: useDirectWikipediaSource,
            firstPage: core.firstPage,
            structureError: core.structureError,
            placePanel: placeUpdatePanel,
          });
          if (!feature || typeof feature.open !== "function") {
            throw new Error("update-module-invalid");
          }
          return feature;
        })
        .catch(function (err) {
          updateFeaturePromise = null;
          throw err;
        });
      return updateFeaturePromise;
    }

    // החלונית יושבת בגוף הדף מתחת למכל הכלי, ולא בשורת המחוון.
    function placeUpdatePanel($panel) {
      $("#hmk-update-panel").not($panel).remove();
      var $tool = $("#hmk-tool");
      if ($tool.length) $tool.after($panel);
      else $("#bodyContent").prepend($panel);
    }

    function makeUpdateTrigger(wikiTitle, currentRevision) {
      var importedRevision = importedRevisionId();
      var current = asRevisionId(currentRevision);
      if (!importedRevision || !current || current === importedRevision) return null;

      var controller = null;
      var loading = false;
      var $label = $("<span>", { text: STR.updateTrigger });
      var $toggle = $("<button>", {
        type: "button",
        class: "hmk-update-toggle",
        "aria-expanded": "false",
        "aria-controls": "hmk-update-panel",
      })
        .append($label)
        .append($("<span>", { class: "hmk-update-chevron", text: "▾", "aria-hidden": "true" }));

      $toggle.on("click", function () {
        if (loading) return;
        if (controller) {
          controller.toggle();
          return;
        }
        loading = true;
        $toggle.prop("disabled", true);
        $label.text(STR.updateTriggerLoading);
        loadUpdateFeature()
          .then(function (feature) {
            controller = feature.open({
              $toggle: $toggle,
              wikiTitle: wikiTitle,
              localTitle: mw.config.get("wgPageName").replace(/_/g, " "),
              importedRevision: importedRevision,
              currentRevision: current,
            });
            $label.text(STR.updateTrigger);
          })
          .catch(function (err) {
            console.error(err);
            $label.text(STR.updateTriggerFailed);
          })
          .then(function () {
            loading = false;
            $toggle.prop("disabled", false);
          });
      });

      return $toggle;
    }

    // ==================================================================
    // הפניות מוויקיפדיה - יכולת עצמאית בקובץ נפרד. כאן רק הטוען, הפקד
    // ומיקום החלונית. הזיהוי רץ מעצמו רק למשתמש מחובר; בלי ממצא אין פקד.
    // ==================================================================
    var REDIRECTS_SCRIPT_PAGE = "משתמש:בוט גאון הירדן/Gadget page tool.redirects.js";
    var REDIRECTS_GLOBAL = "HMK_PAGE_TOOL_REDIRECTS_FACTORY";
    var redirectsFeaturePromise = null;

    function loadRedirectsFeature() {
      if (redirectsFeaturePromise) return redirectsFeaturePromise;
      redirectsFeaturePromise = ensureCore()
        .then(function () {
          if (typeof window[REDIRECTS_GLOBAL] === "function") return;
          return mw.loader.getScript(rawPageUrl(REDIRECTS_SCRIPT_PAGE, "text/javascript"));
        })
        .then(function () {
          if (typeof window[REDIRECTS_GLOBAL] !== "function") {
            throw new Error("redirects-script-missing");
          }
          var feature = window[REDIRECTS_GLOBAL]({
            wpQuery: core.wpQuery,
            localQuery: core.localQuery,
            firstPage: core.firstPage,
            structureError: core.structureError,
            normalizeTitle: core.normalizeTitle,
            parseRedirectLine: core.parseRedirectLine,
            loadCapabilities: function () {
              return loadUserCapabilities().then(function (caps) {
                return { caps: caps, failed: userCapabilitiesLoadFailed };
              });
            },
            placePanel: placeRedirectsPanel,
          });
          if (!feature || typeof feature.detect !== "function" || typeof feature.open !== "function") {
            throw new Error("redirects-module-invalid");
          }
          return feature;
        })
        .catch(function (err) {
          redirectsFeaturePromise = null;
          throw err;
        });
      return redirectsFeaturePromise;
    }

    // מתחת לחלונית "מאז הייבוא" אם היא פתוחה, אחרת מתחת למכל הכלי.
    function placeRedirectsPanel($panel) {
      $("#hmk-redirects-panel").not($panel).remove();
      var $anchor = $("#hmk-update-panel");
      if (!$anchor.length) $anchor = $("#hmk-tool");
      if ($anchor.length) $anchor.after($panel);
      else $("#bodyContent").prepend($panel);
    }

    function makeRedirectsTrigger(wikiTitle) {
      if (!mw.config.get("wgUserName")) return null;
      var localTitle = mw.config.get("wgPageName").replace(/_/g, " ");
      var detection = null;
      var controller = null;
      var $label = $("<span>");
      var $toggle = $("<button>", {
        type: "button",
        class: "hmk-redirects-toggle",
        "aria-expanded": "false",
        "aria-controls": "hmk-redirects-panel",
      })
        .append($label)
        .append($("<span>", { class: "hmk-update-chevron", text: "▾", "aria-hidden": "true" }))
        .hide();

      function setCounts(missing, separate) {
        $label.text(STR.redirectsTrigger(missing, separate));
      }

      loadRedirectsFeature()
        .then(function (feature) {
          return feature.detect(wikiTitle, localTitle);
        })
        .then(function (result) {
          if (!result.missing.length && !result.separate.length) {
            $toggle.remove();
            return;
          }
          detection = result;
          setCounts(result.missing.length, result.separate.length);
          $toggle.show();
        })
        .catch(function (err) {
          $toggle.remove();
          if (err && err.silent) return;
          console.error(err);
        });

      $toggle.on("click", function () {
        if (controller) {
          controller.toggle();
          return;
        }
        loadRedirectsFeature().then(function (feature) {
          controller = feature.open({
            $toggle: $toggle,
            localTitle: localTitle,
            detection: detection,
            onCountChange: setCounts,
          });
        }, function (err) {
          console.error(err);
        });
      });

      return $toggle;
    }

    // דף שאינו קיים במכלול: אם הפניה בוויקיפדיה אל השם הזה קיימת במכלול
    // כערך, כרטיס "נראה שהערך קיים במכלול בשם אחר". בכל מקרה אחר, וגם
    // בכשל, שקט: הדף עצמו אינו נושא של הכלי. הליבה אינה נקראת כאן.
    function runMissingPageCheck() {
      var localTitle = mw.config.get("wgPageName").replace(/_/g, " ");
      loadRedirectsFeature()
        .then(function (feature) {
          return feature.detect(PageName, localTitle).then(function (result) {
            if (!result.separate.length) return;
            return ensureCardAssets()
              .catch(function (err) {
                console.error(err);
                return ensureCardAssets();
              })
              .then(function (card) {
                card.renderMissingPage(result.separate, feature);
              });
          });
        })
        .catch(function (err) {
          if (err && err.silent) return;
          console.error(err);
        });
    }

    function showSizeIndicator(diffsize, resolvedTitle, currentRevision) {
      ensureStyles();
      var cls = "hmk-diff ";
      var label;
      if (diffsize === null) {
        cls += "hmk-diff-null";
        label = STR.sizeNotChecked;
      } else if (diffsize > 0) {
        cls += "hmk-diff-pos" + (diffsize > 399 ? " hmk-diff-strong" : "");
        label = STR.sizeWikiPlus(diffsize.toLocaleString());
      } else if (diffsize === 0) {
        cls += "hmk-diff-null";
        label = STR.sizeWikiEqual;
      } else {
        cls += "hmk-diff-neg" + (diffsize < -399 ? " hmk-diff-strong" : "");
        label = STR.sizeWikiMinus(diffsize.toLocaleString());
      }

      var $pill = $("<span>", { class: cls, dir: "rtl", text: label });
      var localTitle = mw.config.get("wgPageName").replace(/_/g, " ");
      var shownTitle = resolvedTitle.trim().replace(/_/g, " ");
      var $wrap = $("<span>", { class: "hmk-size-wrap" }).append($pill);
      if (localTitle !== shownTitle) {
        $wrap.append(
          $("<span>", { class: "hmk-diff-alt", text: "(" + shownTitle + ")" })
        );
      }
      var $update = makeUpdateTrigger(shownTitle, currentRevision);
      if ($update) $wrap.append($update);
      var $redirects = makeRedirectsTrigger(shownTitle);
      if ($redirects) $wrap.append($redirects);

      isMobileWiew
        ? $(".tagline").append($wrap)
        : $(".mw-indicators").append(
            $("<div>", { class: "mw-indicator" }).append($wrap)
          );
    }

    // ==================================================================
    // 6. הפעלה
    // ==================================================================
    function runPageCheck() {
      if (isMissingPage) {
        runMissingPageCheck();
        return;
      }
      showLoading();
      var pageName = mw.config.get("wgPageName");

      ensureCore()
        .then(function (activeCore) {
          return activeCore.run(PageName, pageName);
        })
        .then(function (outcome) {
          var result = outcome.result;
          if (outcome.localStateMatched) {
            // מצב הדף כבר תואם, ולכן אין להציע פעולות. אם יש אזהרה על
            // מסלול הזיהוי, הליבה מסמנת אותה והתצוגה נשארת גלויה ללא פעולות.
            if (
              result.revidDeletedNotice ||
              (result.sourceFailures && result.sourceFailures.length)
            ) {
              return renderResultWhenReady(result);
            }
            clearTool();
            return;
          }
          if (core.getCurrentLocalPage().status === "redirect") {
            return renderLocalRedirectWhenReady(result);
          }
          return renderResultWhenReady(result);
        })
        .catch(function (e) {
          if (e && e.silent) return;
          console.error(e);
          return showFailureCardWhenReady(e);
        });
    }


    runPageCheck();
  }
});
