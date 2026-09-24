mw.loader
  .using(["jquery.spinner", "mediawiki.diff.styles", "mediawiki.api", "ext.gadget.alert-script"])
  .then((require) => {
  	
    function getProperties(result) {
      var parit = " ";
      if (!result.parse.properties[0]) {
        parit = " ";
      } else if (result.parse.properties[0]["name"] == "wikibase_item") {
        parit = result.parse.properties[0]["*"];
      } else if (
        result.parse.properties[0]["name"] != "wikibase_item" &&
        result.parse.properties.length <= 1
      ) {
        parit = " ";
      } else if (
        result.parse.properties[0]["name"] != "wikibase_item" &&
        result.parse.properties.length > 1
      ) {
        for (let pa = 0; pa < result.parse.properties.length; pa++) {
          if (result.parse.properties[pa]["name"] == "wikibase_item") {
            parit = result.parse.properties[pa]["*"];
          } else continue;
        }
      }
      return parit;
    }

    // ייבוא הפניות חסרות מוויקיפדיה ושורת "קיים במכלול כערך נפרד" עברו
    // לכלי עמוד הערך (מודול ההפניות מוויקיפדיה).
    mw.loader.load("ext.gadget.redLinksForImport");

    // "נראה שהערך קיים כבר בשם אחר" ותיוג המנטרים בדף שאינו קיים עברו
    // לכלי עמוד הערך (כרטיס הדף שאינו קיים).

    $(function () {
      if (
        mw.config.get("wgUserGroups").indexOf("wikiupdate") == -1 ||
        mw.config.get("wgUserGroups").indexOf("aspaklaryaEditor") == -1
      )
        return;

      var bt = $('<button id= "show-hide" type="button">הצג/הסתר</button>');

      var page = mw.config
        .get("wgPageName")
        .replace(/^רבי_/, "")
        .replace(/^הרב_/, "")
        .replace("_", " ")
        .replace(/ה"קדושה"/g, "הקדושה")
        .replace(/ה"קדוש"/g, "הקדוש")
        .replace(/ה"קדושים"/g, "הקדושים")
        .replace(/א-ל/g, "אל")

      var $spinner = $.createSpinner({
        size: "small",
        type: "inline",
        id: "diff-btn-spinner",
      });

      $(bt).click(function () {
        var mydiv = document.getElementById("mytable");

        if (mydiv) {
          $(mydiv).toggle();
        } else {
          appendDiff();
        }
      });

      function appendDiff() {
        $(bt).after($spinner);
        var point = mw.user.options.get("userjs-import-source") === "direct" ? "https://he.wikipedia.org/w/api.php?" : "https://import.hamichlol.org.il/?";

        if (window.PageName != undefined) page = window.PageName;

        var dataWi = {
          action: "parse",
          page: page,
          format: "json",
          prop: "images|revid|properties|wikitext",
          utf8: "1",
          origin: "*",
        };

        $.ajax({
          url: point,
          data: dataWi,
          dataType: "json",
        })
          .done(function (result) {
            if (result && result.parse) {
              var textpage = result.parse.wikitext["*"];

              var girsa = result.parse.revid;
              var parit = getProperties(result);

              var added = "";

              var rating = [
                "מיון ויקיפדיה",
                "דף=" + result.parse.title,
                "גרסה=" + girsa,
                "פריט=" + parit,
              ];
              added = "\n{{וח}}\n" + "{{" + rating.join("|") + "}}";
            	mw.config.get("wgNamespaceNumber") === 0 ? textpage = textpage + added : textpage = textpage;

              getLocl(textpage);
            } else if (result && result.error) {
              var error = result.error.code;
              mw.notify(error);
              $.removeSpinner("diff-btn-spinner");
            }
          })
          .fail(function (request, exception) {
            // Our error logic here
            var msg = "";
            if (request.status === 0) {
              msg = "Not connect.\n Verify Network.";
            } else if (request.status == 404) {
              msg = "Requested page not found. [404]";
            } else if (request.status == 418) {
              msg = "שגיאת סינון";
            } else if (request.status == 500) {
              msg = "Internal Server Error [500].";
            } else if (exception === "parsererror") {
              msg = "Requested JSON parse failed.";
            } else if (exception === "timeout") {
              msg = "Time out error.";
            } else if (exception === "abort") {
              msg = "Ajax request aborted.";
            } else {
              msg = "Uncaught Error.\n" + request.responseText;
            }

            mw.notify(msg);
            $.removeSpinner("diff-btn-spinner");
          });
      }

      function getLocl(textpage) {
        var page = mw.config.get("wgPageName");
        var point = "w/api.php?";
        var data = {
          action: "query",
          format: "json",
          prop: "info|revisions",
          indexpageids: true,
          titles: page,
          rvlimit: "1",
          rvdifftotext: textpage,
        };
        $.ajax({
          data: data,
          dataType: "json",
          url: mw.config.get("wgScriptPath") + "/api.php",
          type: "POST",
        })
          .done(function (result) {
            var diffString =
              result.query.pages[result.query.pageids[0]].revisions[0].diff[
                "*"
              ];
            var pageParse = '<table id = "mytable">' + diffString + "</table>";
            if (diffString === "") {
              mw.notify("אין הבדלים");
            } else {
              $("#bodyContent").prepend(pageParse);
            }
            $.removeSpinner("diff-btn-spinner");
          })
          .fail(function (error) {
            mw.notify(error);
            $.removeSpinner("diff-btn-spinner");
          });
      }

      if (
        mw.config.get("wgPageName") != "עמוד_ראשי" &&
        mw.config.get("wgPageContentModel") != "flow-board" &&
        (mw.config.get("wgNamespaceNumber") === 0 ||
         mw.config.get("wgNamespaceNumber") === 10||
         mw.config.get("wgNamespaceNumber") === 14) &&
        mw.config.get("wgAction") === "view"
      ) {
        $("#firstHeading").after(bt);
      }
    });

    $(function () {
      if (mw.config.get("wgNamespaceNumber") != 0) return;
      var aa = mw.util.addPortletLink(
        "p-views",
        "#",
        "פתיח",
        "div2",
        null,
        null,
        "#ca-history"
      );
      $(aa).click(function () {
        var thispage = mw.config.get("wgPageName");
        var link = thispage
          .replace("המכלול", "ויקיפדיה")
          .replace(/^הרב_/, "")
          .replace("הרב_", "")
          .replace("_", " ")
          .replace(/ה"קדושה"/g, "הקדושה")
          .replace(/ה"קדוש"/g, "הקדוש")
          .replace(/ה"קדושים"/g, "הקדושים")
          .replace(/א-ל/g, "אל");
        var apiEndpoint1 =
          "https://import.hamichlol.org.il/?action=parse&page=" +
          encodeURIComponent(link) +
          "&format=json&section=0&prop=text|revid&disablelimitreport=1&utf8=1&origin=*";

        /**
         * Send the request to get the text
         */
        fetch(apiEndpoint1)
          .then(function (response) {
            if (response.status == 418) {
              mw.notify("שגיאת סינון");
              return false;
            }
            response
              .json()
              .then(function (result) {
                if (result && result.parse) {
                  var imgalt = /<a href="\/wiki\/(%D7%A7%D7%95%D7%91%D7%A5:[^"]+)" class="mw-file-description">/;

                  if (imgalt.test(result.parse.text["*"])) {
                    var imageMain = imgalt.exec(result.parse.text["*"])[1];
                                      console.log(imageMain);

                    imageMain = decodeURIComponent(imageMain).replace(
                      /_/g,
                      " "
                    );
                    console.log(imageMain);
                    var image1 = imageMain.split("קובץ:")[1];
                    var text = "\n| תמונה = " + image1;
                    copyToClipboard(text);
                    function copyToClipboard(text) {
                      if (
                        window.clipboardData &&
                        window.clipboardData.setData
                      ) {
                        return window.clipboardData.setData("Text", text);
                      } else if (
                        document.queryCommandSupported &&
                        document.queryCommandSupported("copy")
                      ) {
                        var textarea = document.createElement("textarea");
                        textarea.textContent = text;
                        textarea.style.position = "fixed";
                        document.body.appendChild(textarea);
                        textarea.select();
                        mw.notify("הועתקה תמונה ללוח");
                        try {
                          return document.execCommand("copy"); // Security exception may be thrown by some browsers.
                        } catch (ex) {
                          console.warn("Copy to clipboard failed.", ex);
                          return false;
                        } finally {
                          document.body.removeChild(textarea);
                        }
                      }
                    }
                  }

                  var rawa = result.parse.text["*"].replace(/\/wiki\//g, "/");
                  //rawa=$.parseHTML(rawa);
                  var box2 = $(
                    '<table class="wikitable mw-collapsible mw-collapsed" dir="rtl" lang="he"><tbody><p>הפתיח של הערך בוויקיפדיה העברית</p></tbody></table>'
                  ).html(rawa);
                  $("#bodyContent").prepend(rawa);
                } else if (
                  result &&
                  result.error &&
                  result.error.code == "missingtitle"
                ) {
                  mw.notify("לא קיים");
                }
              })
              .catch((error) =>
                mw.notify(
                  "אירעה שגיאה בשאיבת התוכן. תיאור השגיאה הוא: " + error
                )
              );
          })
          .catch((error) =>
            mw.notify("אירעה שגיאה בשאיבת התוכן. תיאור השגיאה הוא: " + error)
          );
      });
    });
  });
