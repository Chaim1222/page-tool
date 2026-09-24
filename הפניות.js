// כלים נוספים לעמוד הערך, שנטענים יחד עם הקובץ הראשי של Page tool:
// טעינת גאדג'ט הקישורים האדומים, כפתור "הצג/הסתר" להבדלים מול ויקיפדיה,
// ולשונית "פתיח".
mw.loader
  .using(["jquery.spinner", "mediawiki.diff.styles", "mediawiki.util", "ext.gadget.alert-script"])
  .then(function () {
    mw.loader.load("ext.gadget.redLinksForImport");

    var importApi =
      mw.user.options.get("userjs-import-source") === "direct"
        ? "https://he.wikipedia.org/w/api.php"
        : "https://import.hamichlol.org.il/";

    // שם הדף בוויקיפדיה: מהתבנית שבדף, ואם אין - לפי כללי השמות של המכלול
    // (אותם כללים כמו בקובץ הראשי).
    function wikipediaTitle() {
      return (
        $("#wikiPageName").text() ||
        mw.config
          .get("wgPageName")
          .replace(/_/g, " ")
          .replace(/^רבי /, "")
          .replace(/^הרב /, "")
          .replace(/ה"קדוש(ה|ים)?"/g, "הקדוש$1")
          .replace(/אישיות מהתנ"ך/g, "דמות מקראית")
          .replace(/א-ל/g, "אל")
      );
    }

    function failText(err) {
      if (err && err.status === 418) return "שגיאת סינון";
      return "הפעולה נכשלה: " + ((err && (err.message || err.statusText || err.code)) || err);
    }

    // ================================================================
    // "הצג/הסתר": ההבדלים בין הדף במכלול לבין הדף בוויקיפדיה, כולל תבנית
    // המיון שהייבוא היה מוסיף. רק לחברי wikiupdate וגם aspaklaryaEditor.
    // ================================================================
    function showDiff($button) {
      var $spinner = $.createSpinner({ size: "small", type: "inline" });
      $button.after($spinner);
      Promise.resolve(
        $.ajax({
          url: importApi,
          dataType: "json",
          data: {
            action: "parse",
            page: wikipediaTitle(),
            prop: "revid|properties|wikitext",
            format: "json",
            utf8: 1,
            origin: "*",
          },
        })
      )
        .then(function (result) {
          if (!result.parse) throw new Error(result.error ? result.error.code : "parse");
          var text = result.parse.wikitext["*"];
          if (mw.config.get("wgNamespaceNumber") === 0) {
            var item = (result.parse.properties || []).filter(function (p) {
              return p.name === "wikibase_item";
            })[0];
            text +=
              "\n{{וח}}\n{{מיון ויקיפדיה|דף=" + result.parse.title +
              "|גרסה=" + result.parse.revid +
              "|פריט=" + (item ? item["*"] : " ") + "}}";
          }
          return $.ajax({
            url: mw.util.wikiScript("api"),
            type: "POST",
            dataType: "json",
            data: {
              action: "query",
              format: "json",
              prop: "revisions",
              indexpageids: 1,
              titles: mw.config.get("wgPageName"),
              rvlimit: 1,
              rvdifftotext: text,
            },
          });
        })
        .then(function (result) {
          var diff = result.query.pages[result.query.pageids[0]].revisions[0].diff["*"];
          if (!diff) mw.notify("אין הבדלים");
          else $("#bodyContent").prepend($("<table>", { id: "mytable" }).html(diff));
        })
        .catch(function (err) {
          mw.notify(failText(err));
        })
        .then(function () {
          $spinner.remove();
        });
    }

    var groups = mw.config.get("wgUserGroups") || [];
    if (
      groups.indexOf("wikiupdate") !== -1 &&
      groups.indexOf("aspaklaryaEditor") !== -1 &&
      [0, 10, 14].indexOf(mw.config.get("wgNamespaceNumber")) !== -1 &&
      !mw.config.get("wgIsMainPage") &&
      mw.config.get("wgPageContentModel") !== "flow-board" &&
      mw.config.get("wgAction") === "view"
    ) {
      $(function () {
        var $button = $("<button>", { id: "show-hide", type: "button", text: "הצג/הסתר" });
        $button.on("click", function () {
          var $table = $("#mytable");
          if ($table.length) $table.toggle();
          else showDiff($button);
        });
        $("#firstHeading").after($button);
      });
    }

    // ================================================================
    // "פתיח": הפתיח של הערך בוויקיפדיה בראש הדף, ושורת התמונה הראשית
    // ללוח (להדבקה בתבנית המידע). לחיצה נוספת מסתירה ומציגה.
    // ================================================================
    function showLead() {
      var params = {
        action: "parse",
        page: wikipediaTitle(),
        section: 0,
        prop: "text|revid",
        disablelimitreport: 1,
        format: "json",
        utf8: 1,
        origin: "*",
      };
      fetch(importApi + "?" + $.param(params))
        .then(function (response) {
          if (response.status === 418) throw { status: 418 };
          return response.json();
        })
        .then(function (result) {
          if (!result.parse) {
            var code = result.error && result.error.code;
            mw.notify(code === "missingtitle" ? "לא קיים" : failText(code));
            return;
          }
          var html = result.parse.text["*"];
          var image = /<a href="\/wiki\/(%D7%A7%D7%95%D7%91%D7%A5:[^"]+)" class="mw-file-description">/.exec(html);
          if (image) {
            var line = "\n| תמונה = " + decodeURIComponent(image[1]).replace(/_/g, " ").split("קובץ:")[1];
            navigator.clipboard.writeText(line).then(function () {
              mw.notify("הועתקה תמונה ללוח");
            }, function () {});
          }
          $("#bodyContent").prepend(
            $("<div>", { id: "hmk-wiki-lead" }).html(html.replace(/\/wiki\//g, "/"))
          );
        })
        .catch(function (err) {
          mw.notify(failText(err));
        });
    }

    if (mw.config.get("wgNamespaceNumber") === 0) {
      $(function () {
        var link = mw.util.addPortletLink("p-views", "#", "פתיח", "div2", null, null, "#ca-history");
        $(link).on("click", function (event) {
          event.preventDefault();
          var $lead = $("#hmk-wiki-lead");
          if ($lead.length) $lead.toggle();
          else showLead();
        });
      });
    }
  });
