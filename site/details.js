(function () {
  "use strict";

  // שכבת תצוגת הפרטים בלבד. נטענת בפעם הראשונה שפותחים את הפאנל.
  window.HMK_PAGE_TOOL_DETAILS_FACTORY = function (runtime, deps) {
    var STR = runtime.STR;
    var normalizeTitle = runtime.normalizeTitle;
    var can = deps.can;
    var fetchMechalolBacklinks = deps.fetchMechalolBacklinks;
    var sourceFailureText = deps.sourceFailureText;
    var wikipediaUrl = deps.wikipediaUrl;
    var redirectDestination = deps.redirectDestination;

    var LOG_MONTHS = [
      "בינואר", "בפברואר", "במרץ", "באפריל", "במאי", "ביוני",
      "ביולי", "באוגוסט", "בספטמבר", "באוקטובר", "בנובמבר", "בדצמבר"
    ];

    function fmtLogDate(ts) {
      var d = new Date(ts);
      var hh = String(d.getHours()).padStart(2, "0");
      var mm = String(d.getMinutes()).padStart(2, "0");
      return (
        hh + ":" + mm + ", " + d.getDate() + " " +
        LOG_MONTHS[d.getMonth()] + " " + d.getFullYear()
      );
    }

    function renderRow(row) {
      if ("choice" in row) {
        return $("<div>", { class: "hmk-choice", text: row.choice });
      }
      var cls = "hmk-row";
      if (row.tone === "warn") cls += " hmk-row-warn";
      if (row.numeric) cls += " hmk-row-num";
      if (row.wide) cls += " hmk-row-wide";
      var $row = $("<div>", { class: cls });
      $row.append(
        $("<span>", { class: "hmk-row-label", text: row.label + ":" })
      );
      var $val = $("<span>", { class: "hmk-row-val" });
      if (Array.isArray(row.value)) {
        row.value.forEach(function (v, i) {
          if (i) $val.append($("<br>"));
          $val.append(document.createTextNode(v));
        });
      } else {
        $val.text(row.value);
      }
      $row.append($val);
      if (row.badge) {
        $row.append($("<span>", { class: "hmk-row-badge", text: row.badge }));
      }
      return $row;
    }
    function buildRows(rows, wrapClass) {
      var $wrap = $("<div>", { class: wrapClass });
      rows.forEach(function (row) {
        $wrap.append(renderRow(row));
      });
      return $wrap;
    }
    function wpLink(title, text, extraClass) {
      return $("<a>", {
        href: wikipediaUrl(title),
        text: text || title,
        class: extraClass || null,
        target: "_blank",
        rel: "noopener",
      });
    }
    function buildLogSequence(logEvents) {
      var $wrap = $("<section>", { class: "hmk-log-section" });
      $wrap.append($("<div>", { class: "hmk-section-title", text: STR.factLog }));
      var $list = $("<ul>", { class: "hmk-log-list" });
      logEvents.forEach(function (ev) {
        var $li = $("<li>", { class: "hmk-log-item" });
        $li.append(
          $("<span>", { class: "hmk-log-time", text: fmtLogDate(ev.timestamp) })
        );
        $li.append(document.createTextNode(" — "));
        if (ev.user) {
          $li.append(
            wpLink("משתמש:" + ev.user, ev.user, "mw-userlink")
          );
          $li.append(document.createTextNode(" "));
        }
        var actionText = ev.type === "move" ? STR.logActionMove : STR.logActionDelete;
        $li.append(document.createTextNode(actionText));
        if (ev.type === "move" && ev.target) {
          $li.append(document.createTextNode(STR.logMoveTo));
          $li.append(wpLink(ev.target, ev.target));
          $li.append(
            document.createTextNode(
              " · " +
                (ev.suppressRedirect
                  ? STR.logWithoutRedirect
                  : STR.logWithRedirect)
            )
          );
        }
        if (ev.comment) {
          $li.append(document.createTextNode(" "));
          $li.append(
            $("<span>", { class: "hmk-log-comment", text: "(" + ev.comment + ")" })
          );
        }
        $list.append($li);
      });
      $wrap.append($list);
      return $wrap;
    }
    function decisionSourceText(result) {
      var viaLabel = {
        גרסה: STR.viaVersion,
        פריט: STR.viaWikidata,
        יומן: STR.viaLog,
      };
      return result.via ? viaLabel[result.via] : STR.viaTitle;
    }
    function appendOverviewContent($node, value) {
      if (typeof value === "string") $node.text(value);
      else $node.append(value);
    }
    function overviewItem(label, main, sub, tone) {
      var cls = "hmk-overview-item";
      if (tone) cls += " hmk-overview-item-" + tone;
      var $item = $("<div>", { class: cls });
      $item.append($("<div>", { class: "hmk-overview-label", text: label }));
      var $main = $("<div>", { class: "hmk-overview-main" });
      appendOverviewContent($main, main);
      $item.append($main);
      if (sub !== null && sub !== undefined && sub !== "") {
        var $sub = $("<div>", { class: "hmk-overview-sub" });
        appendOverviewContent($sub, sub);
        $item.append($sub);
      }
      return $item;
    }
    function moveEvents(logEvents) {
      return logEvents.filter(function (ev) {
        return ev.type === "move";
      });
    }
    function historicalMoveSummary(result, logEvents) {
      var moves = moveEvents(logEvents);
      var $sub = $("<span>");
      if (result.from) {
        $sub.append(wpLink(result.from, "„" + result.from + "”"));
        $sub.append(document.createTextNode(" ← "));
      }
      $sub.append(wpLink(result.title, "„" + result.title + "”"));

      return {
        main: moves.length ? STR.overviewMoveEventMain : STR.overviewCurrentWikipediaName,
        sub: $sub,
        moveEvent: moves.length === 1 ? moves[0] : null,
      };
    }
    function currentOldTitleOverview(result, checklistData, historicalMove) {
      if (!checklistData || checklistData.wpOldFailed || result.status !== "renamed") {
        return null;
      }

      var sameTarget =
        checklistData.wpOldRedirect === true &&
        normalizeTitle(checklistData.wpOldTarget) === normalizeTitle(result.title);
      var historicalCreatedRedirect = historicalMove && !historicalMove.suppressRedirect;
      var historicalNoRedirect = historicalMove && historicalMove.suppressRedirect;

      if (historicalCreatedRedirect && sameTarget) return null;
      if (historicalNoRedirect && checklistData.wpOldRedirect === false) return null;

      if (checklistData.wpOldRedirect === true) {
        var $sub = $("<span>")
          .append(document.createTextNode(STR.overviewRedirectsTo + " "))
          .append(wpLink(checklistData.wpOldTarget, "„" + checklistData.wpOldTarget + "”"));
        return overviewItem(
          STR.overviewOldTitleNow,
          STR.overviewOldTitleRedirectMain,
          $sub,
          sameTarget ? null : "warning"
        );
      }

      if (checklistData.wpOldExists === false) {
        return overviewItem(
          STR.overviewOldTitleNow,
          STR.overviewOldTitleMissingMain,
          null,
          historicalCreatedRedirect ? "warning" : null
        );
      }

      if (historicalCreatedRedirect) {
        return overviewItem(
          STR.overviewOldTitleNow,
          STR.overviewOldTitleNotRedirectMain,
          null,
          "warning"
        );
      }

      return null;
    }
    function buildStateOverview(result, checklistData, logEvents) {
      var $wrap = $("<div>", { class: "hmk-overview hmk-overview-2" });

      if (result.status === "renamed") {
        var moveSummary = historicalMoveSummary(result, logEvents);
        $wrap.append(
          overviewItem(
            STR.overviewWp,
            moveSummary.main,
            moveSummary.sub
          )
        );
        var currentOld = currentOldTitleOverview(
          result,
          checklistData,
          moveSummary.moveEvent
        );
        if (currentOld) $wrap.append(currentOld);
        return $wrap;
      }

      if (result.status === "redirect") {
        var redirectTo = redirectDestination(result.target, result.targetFragment);
        var $redirect = $("<span>")
          .append(wpLink(result.title, "„" + result.title + "”"))
          .append(document.createTextNode(STR.overviewRedirectsTo + " "))
          .append(wpLink(redirectTo, "„" + redirectTo + "”"));
        $wrap.append(
          overviewItem(
            STR.overviewWp,
            STR.overviewRedirectMain,
            $redirect
          )
        );
        return $wrap;
      }

      var main;
      var sub = null;
      var tone = null;
      if (result.status === "already_synced") {
        main = STR.overviewHandledMain;
        sub = STR.overviewBaselinePointsTo + result.baseline;
        tone = "success";
      } else if (result.status === "deleted") {
        main = STR.overviewDeletedMain;
        tone = "warning";
      } else if (result.status === "moved_to_other_namespace") {
        main = STR.overviewMovedNsMain;
        sub = STR.overviewTargetPrefix + result.target;
        tone = "warning";
      } else if (result.status === "disambiguation") {
        main = STR.overviewDisambigMain;
        sub = result.title;
      } else if (result.status === "chain_too_long") {
        main = STR.overviewStoppedMain;
        sub = STR.overviewChainLong + result.title;
        tone = "warning";
      } else if (result.status === "cycle_detected") {
        main = STR.overviewStoppedMain;
        sub = STR.overviewCycle + result.title;
        tone = "warning";
      } else if (result.status === "unknown") {
        main = STR.overviewUnknownMain;
        sub =
          result.olderLogEvidence && result.olderLogEvidence.length
            ? STR.overviewUnknownOldEvidenceSub
            : STR.overviewUnknownSub;
        tone = "warning";
      } else {
        main = STR.overviewFoundMain;
        sub = result.title;
      }
      $wrap.append(overviewItem(STR.overviewWp, main, sub, tone));
      return $wrap;
    }
    function backlinkLink(item) {
      var $link = $("<a>", {
        href: item.redirect
          ? mw.util.getUrl(item.title, { redirect: "no" })
          : mw.util.getUrl(item.title),
        text: item.title,
      });
      if (item.redirect) $link.addClass("mw-redirect");
      return $link;
    }
    function renderBacklinkItems(items, depth, ancestry) {
      var $list = $("<ul>", {
        class: "hmk-backlinks-list" + (depth ? " hmk-backlinks-list-nested" : ""),
      });

      items.forEach(function (item) {
        var key = normalizeTitle(item.title);
        if (ancestry[key]) return;

        var $item = $("<li>", { class: "hmk-backlink-item" });
        var $row = $("<div>", { class: "hmk-backlink-row" });
        var mayExpand = item.redirect && depth < 2;

        if (mayExpand) {
          var $expand = $("<button>", {
            class: "hmk-backlink-expand",
            type: "button",
            text: "▸",
            title: STR.btnShowBacklinkChildren,
            "aria-label": STR.btnShowBacklinkChildren,
            "aria-expanded": "false",
          });
          $row.append($expand);
        } else {
          $row.append($("<span>", { class: "hmk-backlink-bullet", text: "•" }));
        }

        if (item.redirect) {
          $row.append($("<span>", { class: "hmk-backlink-redirect-mark", text: "↪" }));
        }
        $row.append(backlinkLink(item));
        if (item.redirect) {
          $row.append($("<span>", { class: "hmk-backlink-kind", text: STR.backlinkRedirect }));
        } else if (item.template) {
          $row.append($("<span>", { class: "hmk-backlink-kind", text: STR.backlinkTemplate }));
        }
        $item.append($row);

        if (mayExpand) {
          var $children = $("<div>", { class: "hmk-backlink-children" }).hide();
          var loaded = false;
          $item.append($children);
          $expand.on("click", function () {
            var willOpen = !$children.is(":visible");
            $children.toggle(willOpen);
            $expand.text(willOpen ? "▾" : "▸");
            $expand.attr("aria-expanded", willOpen ? "true" : "false");
            if (!willOpen || loaded) return;
            loaded = true;
            $children.empty().append(
              $("<div>", { class: "hmk-backlinks-loading", text: STR.backlinksLoading })
            );
            // כשל אינו ננעל: הדגל מתאפס, ופתיחה חוזרת שולפת שוב.
            function showUnchecked() {
              loaded = false;
              $children.empty().append(
                $("<div>", { class: "hmk-backlinks-note", text: STR.notChecked })
              );
            }
            fetchMechalolBacklinks(item.title)
              .then(function (data) {
                if (data.failed) {
                  showUnchecked();
                  return;
                }
                $children.empty();
                var nextAncestry = Object.assign(Object.create(null), ancestry);
                nextAncestry[key] = true;
                var $childList = renderBacklinkItems(data.items, depth + 1, nextAncestry);
                if (!$childList.children().length) {
                  $children.append(
                    $("<div>", { class: "hmk-backlinks-note", text: STR.backlinksNone })
                  );
                  return;
                }
                $children.append($childList);
                if (data.more) {
                  $children.append(
                    $("<div>", { class: "hmk-backlinks-note", text: STR.backlinksMore })
                  );
                }
              })
              .catch(showUnchecked);
          });
        }

        $list.append($item);
      });
      return $list;
    }
    function buildBacklinksDetails(checklistData) {
      var $wrap = $("<div>", { class: "hmk-backlinks" });
      var value = checklistData.backlinksFailed
        ? STR.notChecked
        : STR.backlinksSummary(
            checklistData.backlinksDirectCount,
            checklistData.backlinksRedirectCount,
            checklistData.backlinksDirectMore,
            checklistData.backlinksRedirectMore,
            checklistData.backlinksTemplateCount,
            checklistData.backlinksTemplateMore
          );
      var $summary = $("<div>", { class: "hmk-backlinks-summary" })
        .append($("<span>", { class: "hmk-backlinks-label", text: STR.backlinksLabel }))
        .append($("<span>", { class: "hmk-backlinks-value", text: value }));
      $wrap.append($summary);

      if (checklistData.backlinksFailed || !checklistData.backlinksCount) {
        return $wrap;
      }

      var $toggle = $("<button>", {
        class: "hmk-backlinks-toggle",
        type: "button",
        text: STR.btnShowBacklinks,
        "aria-expanded": "false",
      });
      var $tree = $("<div>", { class: "hmk-backlinks-tree" }).hide();
      var ancestry = Object.create(null);
      ancestry[normalizeTitle(checklistData.backlinksRoot)] = true;
      $tree.append(renderBacklinkItems(checklistData.backlinksItems, 0, ancestry));
      if (checklistData.backlinksMore) {
        $tree.append($("<div>", { class: "hmk-backlinks-note", text: STR.backlinksMore }));
      }
      $toggle.on("click", function () {
        var willOpen = !$tree.is(":visible");
        $tree.toggle(willOpen);
        $toggle.text(willOpen ? STR.btnHideBacklinks : STR.btnShowBacklinks);
        $toggle.attr("aria-expanded", willOpen ? "true" : "false");
      });
      $wrap.append($toggle, $tree);
      return $wrap;
    }
    function buildDecisionReason(checklistData) {
      var title =
        checklistData.action === "manual_review"
          ? STR.whyManualReview
          : checklistData.action === "none"
          ? STR.whyNoAction
          : STR.whyRecommendation;
      var $wrap = $("<section>", { class: "hmk-reason" });
      $wrap.append($("<div>", { class: "hmk-section-title", text: title }));
      $wrap.append(
        $("<div>", { class: "hmk-reason-text", text: checklistData.decisionReason })
      );
      if (checklistData.action !== "none") {
        $wrap.append(buildBacklinksDetails(checklistData));
      }
      return $wrap;
    }
    function keyFact(label, value, tone, sub) {
      var cls = "hmk-keyfact" + (tone ? " hmk-keyfact-" + tone : "");
      var $item = $("<div>", { class: cls });
      $item.append($("<div>", { class: "hmk-keyfact-label", text: label }));
      $item.append($("<div>", { class: "hmk-keyfact-value", text: value }));
      $item.append($("<div>", { class: "hmk-keyfact-sub", text: sub }));
      return $item;
    }
    function identityKeyFact(identity) {
      if (identity.verdict === "same") {
        return { value: STR.identitySameShort, tone: "success", sub: identity.text };
      }
      if (identity.verdict === "different") {
        return { value: STR.identityDifferentShort, tone: "danger", sub: identity.text };
      }
      return { value: STR.identityUnknownShort, tone: "warning", sub: identity.text };
    }
    function buildDecisiveFacts(checklistData) {
      var facts = [];
      if (checklistData.target === "unchecked") {
        facts.push({
          label: STR.factTargetStatus,
          value: STR.notChecked,
          tone: "warning",
          sub: STR.targetStatusUnknownReason,
        });
      }
      if (checklistData.targetIdentity) {
        var identity = identityKeyFact(checklistData.targetIdentity);
        facts.push({
          label: STR.factTargetIdentity,
          value: identity.value,
          tone: identity.tone,
          sub: identity.sub,
        });
      }
      if (checklistData.wpOldFailed) {
        facts.push({
          label: STR.factOldTitleRedirect,
          value: STR.notChecked,
          tone: "warning",
          sub: STR.unknownSafeRedirect,
        });
      }
      if (!facts.length) return null;

      var $grid = $("<div>", { class: "hmk-keyfacts" });
      facts.forEach(function (fact) {
        $grid.append(keyFact(fact.label, fact.value, fact.tone, fact.sub));
      });
      var $section = $("<section>", { class: "hmk-keyfacts-section" });
      $section.append($("<div>", { class: "hmk-section-title", text: STR.decisiveFacts }));
      $section.append($grid);
      return $section;
    }
    function buildTechnicalFacts(infoRows, result) {
      var rows = [];
      var importedRevision = runtime.getOwnFields()["גרסה"];

      if (result.via === "גרסה" && result.revid) {
        rows.push({
          label: STR.detectedByImportedRevision,
          value: result.revid,
          badge: STR.revidExistsVal,
          numeric: true,
        });
      } else {
        rows.push({ label: STR.detectedBy, value: decisionSourceText(result) });
        if (
          importedRevision &&
          importedRevision !== "0" &&
          result.revidDeletedNotice
        ) {
          rows.push({
            label: STR.importedRevision,
            value: importedRevision,
            badge: STR.revidGoneVal,
            numeric: true,
            tone: "warn",
          });
        }
      }

      if (result.status === "already_synced" && result.baseline) {
        rows.push({ label: STR.traceBaseline, value: result.baseline });
      }
      (result.sourceFailures || []).forEach(
        function (failure) {
          rows.push({
            label: STR.traceFailedSource,
            value: sourceFailureText(failure),
            tone: "warn",
            wide: true,
          });
        }
      );
      if (result.baselineTargetFailure) {
        rows.push({
          label: STR.traceFailedSource,
          value: STR.baselineTargetUnchecked,
          tone: "warn",
          wide: true,
        });
      }

      infoRows.forEach(function (r) {
        rows.push({
          label: r.label,
          value: r.value,
          badge: r.badge,
          tone: r.tone,
          wide: r.wide,
        });
      });
      return buildRows(rows, "hmk-tech-grid");
    }
    function buildRedirectToggle(recommendedSuppress, onChange) {
      var $wrap = $("<div>", { class: "hmk-toggle-redirect" });
      $wrap.append(
        $("<span>", { class: "hmk-toggle-label", text: STR.selectorLabel })
      );
      var $seg = $("<span>", { class: "hmk-seg" });
      [
        { label: STR.btnMoveNoRedirect, val: true },
        { label: STR.btnMoveWithRedirect, val: false },
      ].forEach(function (o) {
        var $b = $("<button>", {
          class:
            "hmk-seg-btn" + (o.val === recommendedSuppress ? " hmk-seg-on" : ""),
          type: "button",
          text: o.label,
        });
        $b.on("click", function () {
          $seg.find(".hmk-seg-btn").removeClass("hmk-seg-on");
          $b.addClass("hmk-seg-on");
          onChange(o.val);
        });
        $seg.append($b);
      });
      $wrap.append($seg);
      return $wrap;
    }
    function appendTechnicalAndLog($body, info, result) {
      var $tech = $("<section>", { class: "hmk-tech" });
      $tech.append(
        $("<div>", { class: "hmk-section-title", text: STR.technicalDetails })
      );
      $tech.append(buildTechnicalFacts(info.rows, result));
      $body.append($tech);
      if (info.log && info.log.length) $body.append(buildLogSequence(info.log));
    }
    function buildDetailsBody($body, result, info, checklist, options) {
      $body.empty();
      $body.append(buildStateOverview(result, checklist, info.log));

      if (checklist) {
        $body.append(buildDecisionReason(checklist));
        var $decisive = buildDecisiveFacts(checklist);
        if ($decisive) $body.append($decisive);

        if (
          options.onRedirectOverride &&
          can("moveWithRedirect") &&
          can("moveWithoutRedirect") &&
          (checklist.action === "move_no_redirect" ||
            checklist.action === "move_with_redirect")
        ) {
          var $toggle = buildRedirectToggle(checklist.suppress, function (s) {
            options.onRedirectOverride(s);
            var choice = s ? STR.btnMoveNoRedirect : STR.btnMoveWithRedirect;
            var $choice = $body.find(".hmk-choice");
            if (!$choice.length) {
              $choice = renderRow({ choice: STR.userChoiceLabel + ": " + choice });
              $choice.insertAfter($toggle);
            } else {
              $choice.text(STR.userChoiceLabel + ": " + choice);
            }
          });
          $body.append($toggle);
          if (options.rendered && options.rendered.busy) {
            $toggle.find(".hmk-seg-btn").prop("disabled", true);
          }
        }
      }

      appendTechnicalAndLog($body, info, result);
    }

    return {
      buildDetailsBody: buildDetailsBody,
    };
  };
})();
