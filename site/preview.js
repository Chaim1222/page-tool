(function () {
  "use strict";

  window.HMK_PAGE_TOOL_PREVIEW_FACTORY = function (runtime, deps) {
    var STR = runtime.STR;
    var normalizeTitle = runtime.normalizeTitle;
    var localQuery = runtime.localQuery;
    var netGet = runtime.netGet;
    var firstPage = runtime.firstPage;
    var structureError = runtime.structureError;
    var applyLocalLinkStatus = deps.applyLocalLinkStatus;

    var previewCache = Object.create(null);
    var previewSerial = 0;
    var $previewBubble = null;
    var PREVIEW_DELAY_MS = 350;
    var PREVIEW_MAX_CHARS = 320;

    function previewBubble() {
      if ($previewBubble && $previewBubble.length) return $previewBubble;
      $previewBubble = $("<div>", {
        id: "hmk-link-preview",
        class: "hmk-link-preview",
        role: "tooltip",
        dir: "rtl",
      }).hide();
      $(document.body).append($previewBubble);
      return $previewBubble;
    }

    function previewTextFromHtml(html) {
      var $root = $("<div>").html(html || "");
      $root
        .find("style,table,.mw-editsection,.navbox,.infobox,.metadata")
        .remove();
      var text = "";
      $root.find("p").each(function () {
        var candidate = $(this).text().replace(/\s+/g, " ").trim();
        if (!candidate) return;
        text = candidate;
        return false;
      });
      if (!text) text = $root.text().replace(/\s+/g, " ").trim();
      if (text.length > PREVIEW_MAX_CHARS) {
        text = text.slice(0, PREVIEW_MAX_CHARS).replace(/\s+\S*$/, "") + "…";
      }
      return text;
    }

    function fetchPreviewText(title) {
      return netGet("/w/api.php", {
        action: "parse",
        format: "json",
        page: title,
        prop: "text",
        disableeditsection: 1,
        disablelimitreport: 1,
      }).then(function (data) {
        if (!data.parse || !data.parse.text || !("*" in data.parse.text)) {
          throw structureError("תצוגה מקדימה");
        }
        return previewTextFromHtml(data.parse.text["*"]);
      });
    }

    function fetchLinkPreview(title) {
      var key = normalizeTitle(title);
      if (previewCache[key]) return previewCache[key];

      previewCache[key] = localQuery({
        titles: title,
        redirects: 1,
        prop: "info|pageprops",
        ppprop: "disambiguation",
        indexpageids: 1,
      })
        .then(function (data) {
          var page = firstPage(data);
          var redirects =
            data.query && Array.isArray(data.query.redirects)
              ? data.query.redirects
              : [];
          if (!page) throw structureError("תצוגה מקדימה");

          var redirectTarget = redirects.length ? redirects[0].to : null;
          if ("missing" in page) {
            return {
              status: redirectTarget ? "redirect" : "missing",
              redirectTarget: redirectTarget,
              targetMissing: !!redirectTarget,
              isDisambiguation: false,
              text: "",
            };
          }

          var isDisambiguation =
            !!page.pageprops && "disambiguation" in page.pageprops;
          return fetchPreviewText(page.title).then(function (text) {
            return {
              status: redirectTarget ? "redirect" : "article",
              redirectTarget: redirectTarget,
              targetMissing: false,
              isDisambiguation: isDisambiguation,
              text: text,
            };
          });
        })
        .catch(function () {
          delete previewCache[key];
          return { status: "error", text: "" };
        });

      return previewCache[key];
    }

    function positionPreviewBubble($link) {
      var bubble = previewBubble();
      var rect = $link[0].getBoundingClientRect();
      bubble.css({ left: 0, top: 0 }).show();
      var width = bubble.outerWidth();
      var height = bubble.outerHeight();
      var viewLeft = window.pageXOffset;
      var viewTop = window.pageYOffset;
      var viewWidth = document.documentElement.clientWidth;
      var viewHeight = window.innerHeight || document.documentElement.clientHeight;
      var left = viewLeft + rect.left + rect.width / 2 - width / 2;
      left = Math.max(viewLeft + 8, Math.min(left, viewLeft + viewWidth - width - 8));
      var top = viewTop + rect.bottom + 8;
      if (top + height > viewTop + viewHeight - 8) {
        top = Math.max(viewTop + 8, viewTop + rect.top - height - 8);
      }
      bubble.css({ left: left, top: top });
    }

    function renderLinkPreview(data) {
      var bubble = previewBubble().empty();
      var title;
      if (data.status === "redirect") {
        title = STR.previewRedirectTo(data.redirectTarget);
      } else if (data.status === "missing") {
        title = STR.previewMissing;
      } else if (data.status === "error") {
        title = STR.previewFailed;
      } else if (data.isDisambiguation) {
        title = STR.previewDisambiguation;
      } else {
        title = STR.previewArticle;
      }
      bubble.append($("<div>", { class: "hmk-link-preview-title", text: title }));

      if (data.status === "redirect" && data.isDisambiguation) {
        bubble.append(
          $("<div>", {
            class: "hmk-link-preview-note",
            text: STR.previewRedirectDisambiguation,
          })
        );
      }

      var body = data.targetMissing
        ? STR.previewRedirectTargetMissing
        : data.text ||
          (data.status === "missing" || data.status === "error"
            ? ""
            : STR.previewEmpty);
      if (body) {
        bubble.append($("<div>", { class: "hmk-link-preview-text", text: body }));
      }
    }

    function bindLocalPreview($link, title, showNow, linkDestination) {
      $link.addClass("hmk-preview-link");
      var timer = null;
      var token = 0;

      function hide() {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        token = ++previewSerial;
        $link.removeAttr("aria-describedby");
        if ($previewBubble) $previewBubble.hide();
      }

      function show() {
        if (timer) clearTimeout(timer);
        token = ++previewSerial;
        var ownToken = token;
        timer = setTimeout(function () {
          timer = null;
          previewBubble()
            .empty()
            .append(
              $("<div>", {
                class: "hmk-link-preview-loading",
                text: STR.previewLoading,
              })
            );
          $link.attr("aria-describedby", "hmk-link-preview");
          positionPreviewBubble($link);
          fetchLinkPreview(title).then(function (data) {
            if (ownToken !== previewSerial) return;
            applyLocalLinkStatus($link, title, data.status, linkDestination);
            renderLinkPreview(data);
            positionPreviewBubble($link);
          });
        }, PREVIEW_DELAY_MS);
      }

      $link.on("mouseenter.hmkPreview focusin.hmkPreview", show);
      $link.on("mouseleave.hmkPreview focusout.hmkPreview", hide);
      $link.on("keydown.hmkPreview", function (event) {
        if (event.key === "Escape") hide();
      });
      if (showNow) show();
      return $link;
    }

    return { bindLocalPreview: bindLocalPreview };
  };
})();
