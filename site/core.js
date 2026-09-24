(function (root) {
  "use strict";

  // ליבת ההכרעה בלבד. אין DOM, אין כרטיסים ואין פעולות כתיבה.
  // התצוגה מספקת callback קטן לעדכון הודעת retry, וכל שאר ההכרעה נשארת כאן.
  root.HMK_PAGE_TOOL_CORE_FACTORY = function (options) {
    var STR = options.STR;
    var MAX_CHAIN_DEPTH = options.MAX_CHAIN_DEPTH;
    var addres = options.address;
    var onRetry = options.onRetry;
    var currentPageName = null;

    // נרמול כותרת להשוואה - קו-תחתון לרווח, גזירת רווחים
    function normalizeTitle(t) {
      return (t || "").replace(/_/g, " ").trim();
    }

    // האם שתי כותרות הן אותו דף: קו תחתון כרווח, רווחים כפולים, והאות
    // הראשונה אינה תלוית רישיות במדיה־ויקי.
    function sameTitle(a, b) {
      a = normalizeTitle(a).replace(/\s+/g, " ");
      b = normalizeTitle(b).replace(/\s+/g, " ");
      return a.charAt(0).toUpperCase() + a.slice(1) === b.charAt(0).toUpperCase() + b.slice(1);
    }

    // האם לתוצאה יש אזהרה על מסלול הזיהוי (גרסה שנמחקה או מקור שנכשל).
    function hasWarnings(result) {
      return !!(result.revidDeletedNotice || (result.sourceFailures && result.sourceFailures.length));
    }

    // יומן ויקיפדיה לכותרת, לסוג אירוע אחד. sinceTs: רק אירועים מאז
    // (מהחדש לישן, עד הזמן הזה).
    function fetchLog(title, type, sinceTs) {
      var params = {
        list: "logevents",
        letitle: title,
        letype: type,
        lelimit: 20,
        leprop: "ids|title|type|user|timestamp|comment|details",
      };
      if (sinceTs) params.leend = sinceTs;
      return wpQuery(params).then(function (data) {
        if (!data.query || !Array.isArray(data.query.logevents)) {
          throw structureError("יומן " + type);
        }
        return data.query.logevents;
      });
    }

    // ==================================================================
    // שכבת-רשת אחידה. כל שליפת-מידע משתמשת באותו חוזה-כשל:
    // הצלחה מחזירה נתון; כשל דוחה עם סיווג. אין כאן ערכי-שווא שמתחזים
    // ל"אין מידע". רק כשל רגעי זוכה לניסיון חוזר.
    // ==================================================================
    var NET_MAX_ATTEMPTS = 5;
    var NET_DELAYS = [1000, 2000, 4000, 4000];
    var NET_TIMEOUT_MS = 15000;
    var NET_TRANSIENT_STATUS = [429, 500, 502, 503, 504];

    function netError(isTransient, kind, message, code) {
      var err = new Error(message || "");
      err.netError = true;
      err.transient = !!isTransient;
      err.kind = kind;
      err.code = code === undefined ? null : code;
      return err;
    }

    function structureError(context) {
      var err = netError(false, "structure", STR.netStructure);
      err.context = context || null;
      return err;
    }

    function classifyHttpStatus(status) {
      if (NET_TRANSIENT_STATUS.indexOf(status) !== -1) {
        return netError(true, "server", STR.netServerBusy, status);
      }
      if (status === 418) return netError(false, "filter", STR.netFilter, status);
      if (status === 404) return netError(false, "notfound", STR.netNotFound, status);
      return netError(false, "http", STR.netHttpError(status), status);
    }

    // קוד-המצב נבדק לפני סוג-הפענוח: 503 שמחזיר HTML נשאר תקלה רגעית,
    // ולא מתחפש לשגיאת פענוח.
    function classifyNetFailure(request, textStatus) {
      var status = request ? request.status : 0;
      if (textStatus === "abort") {
        var aborted = netError(false, "aborted", "");
        aborted.silent = true;
        return aborted;
      }
      if (textStatus === "timeout") {
        return netError(true, "timeout", STR.netTimeout);
      }
      if (status && status !== 200) return classifyHttpStatus(status);
      if (status === 0) return netError(true, "offline", STR.netNoConnection);
      if (textStatus === "parsererror") {
        return netError(false, "parse", STR.netParse);
      }
      return netError(false, "unknown", STR.netUnknown);
    }

    function retryOrReject(err, attempt, run, reject) {
      if (!err.transient || attempt >= NET_MAX_ATTEMPTS) {
        reject(err);
        return;
      }
      onRetry(attempt + 1, NET_MAX_ATTEMPTS);
      setTimeout(
        run,
        NET_DELAYS[Math.min(attempt - 1, NET_DELAYS.length - 1)]
      );
    }

    // שליפת JSON דרך אייג'קס. מיועד לממשקי המכלול/ויקיפדיה ולכל parse מקומי.
    function netGet(url, params) {
      return new Promise(function (resolve, reject) {
        var attempt = 0;
        function run() {
          attempt++;
          $.ajax({
            url: url,
            data: params,
            dataType: "json",
            timeout: NET_TIMEOUT_MS,
          })
            .done(function (data) {
              var apiErr = data && data.error;
              if (apiErr) {
                reject(
                  netError(
                    false,
                    "api",
                    STR.netApiError(apiErr.code || ""),
                    apiErr.code
                  )
                );
                return;
              }
              resolve(data);
            })
            .fail(function (request, textStatus) {
              retryOrReject(
                classifyNetFailure(request, textStatus),
                attempt,
                run,
                reject
              );
            });
        }
        run();
      });
    }

    // ויקינתונים נשאר בשליפת fetch חוצת-אתרים, אך נושא בדיוק אותו חוזה-כשל.
    // קוד-המצב נבדק לפני פענוח JSON; שגיאת פענוח היא מבנית ואינה נשלחת שוב.
    function netFetchJson(url) {
      return new Promise(function (resolve, reject) {
        var attempt = 0;
        function run() {
          attempt++;
          var controller = new AbortController();
          var timer = setTimeout(function () { controller.abort(); }, NET_TIMEOUT_MS);
          fetch(url, { signal: controller.signal })
            .then(function (response) {
              clearTimeout(timer);
              if (!response.ok) throw classifyHttpStatus(response.status);
              return response.json().catch(function () {
                throw netError(false, "parse", STR.netParse);
              });
            })
            .then(function (data) {
              var apiErr = data && data.error;
              if (apiErr) {
                throw netError(
                  false,
                  "api",
                  STR.netApiError(apiErr.code || ""),
                  apiErr.code
                );
              }
              resolve(data);
            })
            .catch(function (rawErr) {
              clearTimeout(timer);
              var err;
              if (rawErr && rawErr.netError) {
                err = rawErr;
              } else if (rawErr && rawErr.name === "AbortError") {
                err = netError(true, "timeout", STR.netTimeout);
              } else {
                err = netError(true, "offline", STR.netNoConnection);
              }
              retryOrReject(err, attempt, run, reject);
            });
        }
        run();
      });
    }

    // כל שאילתות-המידע עוברות דרך אותו עוטף. בוויקיפדיה מוסיפים origin
    // מפני שהשליפה אנונימית וחוצת-אתרים.
    function wpQuery(params) {
      return netGet(
        addres,
        Object.assign(
          { action: "query", format: "json", utf8: 1, origin: "*" },
          params
        )
      );
    }

    function localQuery(params) {
      return netGet(
        "/w/api.php",
        Object.assign({ action: "query", format: "json", utf8: 1 }, params)
      );
    }

    // הדף הראשון בתשובת query, עם טיפול בחוסר
    function firstPage(data) {
      var q = data && data.query;
      if (!q || !q.pages) return null;
      var id = (q.pageids && q.pageids[0]) || Object.keys(q.pages)[0];
      return id ? q.pages[id] : null;
    }

    // זמן-היצירה של דף המכלול הנוכחי. הכשל צף; runPageCheck הופך אותו
    // במפורש ל"לא נבדק". הוא גבול תחתון ליומן, ולכן הכרעה לפי יומן
    // כשהוא לא נבדק הופכת לכשל גלוי (בבדיקת העברה/מחיקה).
    function fetchLocalCreationTs(title) {
      return localQuery({
        titles: title,
        prop: "revisions",
        rvprop: "timestamp",
        rvlimit: 1,
        rvdir: "newer",
        indexpageids: 1,
      }).then(function (data) {
        var page = firstPage(data);
        if (!page || "missing" in page) throw structureError("זמן יצירת הדף");
        var rev = page.revisions && page.revisions[0];
        if (!rev || !rev.timestamp) throw structureError("זמן יצירת הדף");
        return rev.timestamp;
      });
    }

    // מצב, תוכן וגודל של דף מקומי בשליפה אחת. safe=true מיועד
    // לבדיקות-משנה: כשל הופך במפורש ל"לא נבדק" ולא להיעדר.
    function fetchLocalPageData(title, safe) {
      var request = localQuery({
        titles: title,
        prop: "info|revisions|pageprops",
        rvprop: "ids|size|content",
        rvlimit: 1,
        ppprop: "disambiguation",
        indexpageids: 1,
      }).then(function (data) {
        var page = firstPage(data);
        if (!page) throw structureError("מצב הדף במכלול");
        if ("missing" in page) {
          return { title: page.title, status: "missing", fields: null, wikitext: null, size: null };
        }
        var rev = page.revisions && page.revisions[0];
        if (!rev || !("*" in rev) || typeof rev.size !== "number") {
          throw structureError("תוכן הדף במכלול");
        }
        return {
          title: page.title,
          status: "redirect" in page ? "redirect" : "article",
          disambiguation: !!(page.pageprops && "disambiguation" in page.pageprops),
          fields: extractTemplateFields(rev["*"]),
          wikitext: rev["*"],
          size: rev.size,
        };
      });
      if (!safe) return request;
      return request.catch(function (err) {
        if (err && err.silent) throw err;
        return { title: title, status: "unchecked", fields: null, wikitext: null, size: null };
      });
    }


    // סינון רצף היומן הרגיל: העברות ומחיקות בלבד, מזמן-היצירה
    // המכלולאי והלאה, מהחדש לישן. אירועים מוקדמים יותר נשמרים בנפרד
    // רק כשהם הראיה היחידה, ואינם משתתפים בהכרעה.
    function filterAndSortLog(events, sinceTs) {
      var floor = sinceTs ? new Date(sinceTs).getTime() : -Infinity;
      return (events || [])
        .filter(function (ev) {
          if (ev.type !== "move" && ev.type !== "delete") return false;
          return new Date(ev.timestamp).getTime() >= floor;
        })
        .sort(function (a, b) {
          return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        });
    }

    // ==================================================================
    // 1. שליפת שדות התבנית {{מיון ויקיפדיה}} מהוויקיטקסט של דף המכלול
    // ==================================================================
    // שדות הדף הנוכחי - נשמרים בהפעלה, משמשים את השוואת-הזהות בלוג-המידע
    var ownFields = { דף: null, גרסה: null, פריט: null };
    // זמן-היצירה של דף המכלול - גבול-תחתון לרצף היומן. נשלף בהפעלה
    var localCreationTs = null;
    var localCreationFailed = false;
    var currentLocalPage = null;

    function findTopLevelEquals(text, start, end) {
      var templateDepth = 0;
      var linkDepth = 0;
      for (var i = start; i < end; i++) {
        if (text.substr(i, 2) === "{{") {
          templateDepth++;
          i++;
          continue;
        }
        if (text.substr(i, 2) === "}}" && templateDepth > 0) {
          templateDepth--;
          i++;
          continue;
        }
        if (text.substr(i, 2) === "[[") {
          linkDepth++;
          i++;
          continue;
        }
        if (text.substr(i, 2) === "]]" && linkDepth > 0) {
          linkDepth--;
          i++;
          continue;
        }
        if (text.charAt(i) === "=" && templateDepth === 0 && linkDepth === 0) {
          return i;
        }
      }
      return -1;
    }

    // מפענח יחיד ל־{{מיון ויקיפדיה}}. אותו פענוח משמש גם לקריאה וגם
    // לעדכון דף=, כדי שלא נקרא מבנה שהעדכון אחר כך אינו יודע לזהות.
    // קיצור-דרך: זה אינו מפענח ויקיטקסט מלא; הוא מטפל בקינון תבניות וקישורים
    // שנדרש למבנה הזה, בלי לנסות לפרש את כל תחביר הוויקי.
    function parseWikipediaSortTemplate(wikitext) {
      var parsed = {
        fields: { דף: null, גרסה: null, פריט: null },
        pageRange: null,
      };
      if (!wikitext) return parsed;

      var startMatch = /\{\{\s*מיון ויקיפדיה(?=\s*(?:\||\}\}))/.exec(wikitext);
      if (!startMatch) return parsed;

      var cursor = startMatch.index + startMatch[0].length;
      var templateDepth = 1;
      var linkDepth = 0;
      var segmentStart = null;
      var segments = [];
      var closed = false;

      for (var i = cursor; i < wikitext.length; i++) {
        var pair = wikitext.substr(i, 2);
        if (pair === "{{") {
          templateDepth++;
          i++;
          continue;
        }
        if (pair === "}}") {
          templateDepth--;
          if (templateDepth === 0) {
            if (segmentStart !== null) segments.push([segmentStart, i]);
            closed = true;
            break;
          }
          i++;
          continue;
        }
        if (pair === "[[") {
          linkDepth++;
          i++;
          continue;
        }
        if (pair === "]]" && linkDepth > 0) {
          linkDepth--;
          i++;
          continue;
        }
        if (wikitext.charAt(i) === "|" && templateDepth === 1 && linkDepth === 0) {
          if (segmentStart !== null) segments.push([segmentStart, i]);
          segmentStart = i + 1;
        }
      }

      if (!closed) return parsed;

      segments.forEach(function (range) {
        var eq = findTopLevelEquals(wikitext, range[0], range[1]);
        if (eq === -1) return;
        var name = wikitext.slice(range[0], eq).trim();
        if (name !== "דף" && name !== "גרסה" && name !== "פריט") return;
        if (parsed.fields[name] !== null) return;

        var rawStart = eq + 1;
        var rawEnd = range[1];
        var raw = wikitext.slice(rawStart, rawEnd);
        var leading = raw.match(/^\s*/)[0].length;
        var trailing = raw.match(/\s*$/)[0].length;
        var valueStart = rawStart + leading;
        var valueEnd = rawEnd - trailing;
        parsed.fields[name] = wikitext.slice(valueStart, valueEnd);
        if (name === "דף") {
          parsed.pageRange = { start: valueStart, end: valueEnd };
        }
      });

      return parsed;
    }

    function extractTemplateFields(wikitext) {
      return parseWikipediaSortTemplate(wikitext).fields;
    }

    // שורת הפניה: סולמית, מילת ההפניה וקישור. מי שמחליף יעד מחליף רק את
    // יעד הקישור, כך שקטגוריות, תבניות ותבנית המיון נשמרות כמו שהן.
    // עזר פענוח בלבד, כמו מפענח תבנית המיון; אינו משתתף בהכרעה.
    var REDIRECT_LINE = /^(\s*#([^\[\n]*?)\[\[\s*)([^\]|\n#]*)(#[^\]|\n]*)?((?:\|[^\]\n]*)?\]\])/;

    function parseRedirectLine(text) {
      var m = REDIRECT_LINE.exec(text || "");
      if (!m) return null;
      var word = m[2].replace(/:\s*$/, "").trim();
      if (!/^(הפניה|redirect)$/i.test(word)) return null;
      return {
        match: m,
        target: m[3].trim(),
        fragment: m[4] ? m[4].slice(1) : null,
      };
    }

    function replaceWikipediaSortPageField(wikitext, title) {
      var parsed = parseWikipediaSortTemplate(wikitext);
      if (!parsed.pageRange) return null;
      return (
        wikitext.slice(0, parsed.pageRange.start) +
        title +
        wikitext.slice(parsed.pageRange.end)
      );
    }

    // ==================================================================
    // 2. סדר העדיפויות לפתרון מצב-הכותרת (סעיף 3 במסמך הארכיטקטורה)
    //    שינוי-שם נמדד מול שדה דף= (מצב הכותרת בסנכרון האחרון), לא מול
    //    הכותרת המכלולאית - כדי למנוע התרעות-שווא מהבדל-שמות חוצה-אתרים
    // ==================================================================
    function resolveWikipediaState(mechalolTitle, fields) {
      var baseline = fields["דף"] ? fields["דף"].trim() : null;
      var failures = [];

      function rememberFailure(sourceKey, err, messageKey) {
        if (err && err.silent) throw err;
        failures.push({
          sourceKey: sourceKey,
          messageKey: messageKey,
          errorMessage: err && err.message ? err.message : "",
          error: err || null,
        });
        return null;
      }

      function attachFailures(result) {
        if (failures.length) result.sourceFailures = failures.slice();
        return result;
      }

      function finish(result, revidDeleted) {
        return Promise.resolve(result).then(function (finalResult) {
          if (revidDeleted && isLiveState(finalResult.status)) {
            finalResult.revidDeletedNotice = true;
          }
          return attachFailures(finalResult);
        });
      }

      // גם הנפילה לפי כותרת נמדדת מול שדה דף=: מתחילה ממנו כשהוא קיים,
      // ועוברת את בדיקת הבסיס כמו מסלולי הגרסה והפריט. השם המכלולאי משמש
      // רק כשאין שדה דף= כלל.
      function titleFallback(revidDeleted) {
        return resolveTitleChain(baseline || mechalolTitle)
          .then(function (result) {
            return applyBaselineCheck(result, baseline);
          })
          .then(function (checked) {
            return finish(checked, revidDeleted);
          });
      }

      function afterRevision(result) {
        if (result && !result.__revidDeleted) {
          return applyBaselineCheck(result, baseline).then(attachFailures);
        }

        var revidDeleted = !!(result && result.__revidDeleted);
        if (!fields["פריט"]) return titleFallback(revidDeleted);

        return resolveByWikidata(fields["פריט"])
          .catch(function (err) {
            return rememberFailure("failureSourceWikidata", err, "fallbackWikidataFailed");
          })
          .then(function (result2) {
            if (result2) {
              return applyBaselineCheck(result2, baseline).then(function (checked) {
                return finish(checked, revidDeleted);
              });
            }
            return titleFallback(revidDeleted);
          });
      }

      if (fields["גרסה"] && fields["גרסה"] !== "0") {
        return resolveByRevisionId(fields["גרסה"])
          .catch(function (err) {
            return rememberFailure("failureSourceRevision", err, "fallbackRevisionFailed");
          })
          .then(afterRevision);
      }

      return afterRevision(null);
    }

    function isLiveState(status) {
      return (
        status === "found" ||
        status === "renamed" ||
        status === "redirect" ||
        status === "disambiguation" ||
        status === "already_synced"
      );
    }

    // אם הגרסה הישנה מצביעה להפניה שכבר תואמת דף=, עצם הסנכרון מוכרע לפי
    // שתי הכותרות. בדיקת תוכן היעד היא בדיקת-משנה בלבד; כשל בה מסומן ולא
    // מבטל את המסקנה שכבר טופל שינוי-השם.
    function applyBaselineCheck(result, baseline) {
      if (!baseline) return Promise.resolve(result);

      if (
        result.status === "redirect" &&
        sameTitle(result.target, baseline)
      ) {
        return resolveTitleChain(result.target)
          .then(function (resolved) {
            return {
              status: "already_synced",
              title: result.target,
              from: result.title,
              target: result.target,
              baseline: baseline,
              via: result.via,
              revid: result.revid,
              page: resolved && resolved.page ? resolved.page : null,
              resolvedStatus: resolved ? resolved.status : "unknown",
              moveLog: result.moveLog || [],
            };
          })
          .catch(function (err) {
            if (err && err.silent) throw err;
            return {
              status: "already_synced",
              title: result.target,
              from: result.title,
              target: result.target,
              baseline: baseline,
              via: result.via,
              revid: result.revid,
              page: null,
              resolvedStatus: "unchecked",
              baselineTargetFailure: err,
              moveLog: result.moveLog || [],
            };
          });
      }

      return Promise.resolve(applyRenameCheck(result, baseline));
    }

    function applyRenameCheck(result, baseline) {
      if (result.status !== "found" && result.status !== "disambiguation")
        return result;
      if (sameTitle(result.title, baseline)) return result;
      return {
        status: "renamed",
        title: result.title,
        from: baseline,
        page: result.page,
        via: result.via,
        revid: result.revid,
        timestamp: result.timestamp,
        targetIsDisambig: result.status === "disambiguation",
        moveLog: result.moveLog || [],
      };
    }

    // מסלול הגרסה אינו בולע כשל. resolveWikipediaState הוא המקום היחיד שמחליט
    // במפורש אם לבצע נסיגה למקור זיהוי חלופי.
    function resolveByRevisionId(revid) {
      return wpQuery({
        revids: revid,
        prop: "info",
        indexpageids: 1,
      }).then(function (data) {
        var query = data.query;
        if (!query) throw structureError("מזהה גרסה");
        if (query.badrevids && Object.keys(query.badrevids).length) {
          return { __revidDeleted: true };
        }
        if (!query.pages) throw structureError("מזהה גרסה");
        var page = query.pages[query.pageids[0]];
        if (page.ns !== 0) {
          return {
            status: "moved_to_other_namespace",
            title: page.title,
            target: page.title,
            targetNs: page.ns,
            via: "גרסה",
            revid: revid,
          };
        }
        return resolveTitleChain(page.title).then(function (res) {
          res.via = "גרסה";
          res.revid = revid;
          return res;
        });
      });
    }

    // ויקינתונים נשאר בשליפת fetch חוצת-אתרים, אך כשלו מסווג באותו חוזה.
    function resolveByWikidata(qid) {
      return netFetchJson(
        "https://www.wikidata.org/w/api.php?action=wbgetentities&ids=" +
          encodeURIComponent(qid) +
          "&props=sitelinks&sitefilter=hewiki&format=json&origin=*"
      ).then(function (data) {
        if (!data.entities) throw structureError("ויקינתונים");
        var entity = data.entities[qid];
        if (!entity || entity.missing !== undefined) return null;
        var sitelink = entity.sitelinks && entity.sitelinks.hewiki;
        if (!sitelink || !sitelink.title) return null;
        return resolveTitleChain(sitelink.title).then(function (result) {
          result.via = "פריט";
          return result;
        });
      });
    }

    // 2.3 מעקב הכותרת הוא מסלול הכרעה. כשל-רשת או מבנה-תשובה חסר
    // אינם מתורגמים ל"unknown"; הם צפים למי שבחר במסלול הזה.
    function resolveTitleChain(title, depth, visited, moveLog) {
      depth = depth || 0;
      visited = visited || new Set();
      moveLog = moveLog || [];
      if (depth > MAX_CHAIN_DEPTH) {
        return Promise.resolve({
          status: "chain_too_long",
          title: title,
          moveLog: moveLog,
        });
      }
      if (visited.has(title)) {
        return Promise.resolve({
          status: "cycle_detected",
          title: title,
          moveLog: moveLog,
        });
      }
      visited.add(title);

      return wpQuery({
        titles: title,
        redirects: 1,
        prop: "info|revisions|langlinks|pageprops",
        rvprop: "size|ids",
        indexpageids: 1,
        lllang: "en",
        llprop: "langname|url",
        ppprop: "disambiguation",
      }).then(function (data) {
        var query = data.query;
        if (!query || !query.pages || !query.pageids || !query.pageids.length) {
          throw structureError("מעקב כותרת");
        }
        var pageId = query.pageids[0];
        if (String(pageId) !== "-1") {
          var page = query.pages[pageId];
          if (!page) throw structureError("מעקב כותרת");
          if (query.redirects && query.redirects.length) {
            return {
              status: "redirect",
              title: title,
              target: query.redirects[0].to,
              targetFragment: query.redirects[0].tofragment || null,
              depth: depth,
              moveLog: moveLog,
            };
          }
          if (page.pageprops && "disambiguation" in page.pageprops) {
            return {
              status: "disambiguation",
              title: title,
              page: page,
              depth: depth,
              moveLog: moveLog,
            };
          }
          return {
            status: "found",
            title: title,
            page: page,
            depth: depth,
            moveLog: moveLog,
          };
        }
        return checkMoveOrDelete(title, depth, visited, moveLog);
      });
    }

    // יומן ההעברות/מחיקות הוא חלק מההכרעה כאשר הכותרת חסרה. רק אירועים
    // מזמן יצירת הדף במכלול והלאה רשאים להכריע. אירוע מוקדם יותר מוחזר
    // כראיה בלבד, ורק אם לא נמצאה ראיה מאוחרת יותר. כשל באחת השאילתות
    // אינו "אין אירוע" אלא כשל שממשיך למעלה.
    function checkMoveOrDelete(title, depth, visited, moveLog) {
      return Promise.all([fetchLog(title, "move"), fetchLog(title, "delete")]).then(
        function (results) {
          // בלי זמן יצירה אין גבול תחתון, וכל אירוע ישן היה משתתף בהכרעה.
          // כשיש אירועים ביומן זה כשל גלוי ולא מסקנה; כשהיומן ריק, "לא ידוע"
          // נכון בכל מקרה.
          if (localCreationFailed && (results[0].length || results[1].length)) {
            throw netError(false, "log-floor", STR.logFloorUnchecked);
          }
          var moves = filterAndSortLog(results[0], localCreationTs);
          var deletes = filterAndSortLog(results[1], localCreationTs);
          var moveEvent = moves[0] || null;
          var deleteEvent = deletes[0] || null;

          if (!moveEvent && !deleteEvent) {
            var creationTime = localCreationTs
              ? new Date(localCreationTs).getTime()
              : null;
            var olderLogEvidence = creationTime === null
              ? []
              : results[0]
                  .concat(results[1])
                  .filter(function (ev) {
                    return (
                      (ev.type === "move" || ev.type === "delete") &&
                      new Date(ev.timestamp).getTime() < creationTime
                    );
                  })
                  .sort(function (a, b) {
                    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
                  });

            return {
              status: "unknown",
              title: title,
              moveLog: moveLog,
              olderLogEvidence: olderLogEvidence,
            };
          }

          if (moveEvent && (!moveEvent.params || !moveEvent.params.target_title)) {
            throw structureError("אירוע העברה");
          }

          if (moveEvent) {
            var targetTitle = moveEvent.params.target_title;
            var targetNs = moveEvent.params.target_ns;

            var moveParams = { target_title: targetTitle };
            if (
              Object.prototype.hasOwnProperty.call(
                moveEvent.params,
                "suppressredirect"
              )
            ) {
              moveParams.suppressredirect = moveEvent.params.suppressredirect;
            }
            moveLog.push({
              type: "move",
              user: moveEvent.user,
              timestamp: moveEvent.timestamp,
              comment: moveEvent.comment,
              params: moveParams,
            });
            if (deleteEvent) {
              moveLog.push({
                type: "delete",
                user: deleteEvent.user,
                timestamp: deleteEvent.timestamp,
                comment: deleteEvent.comment,
              });
            }

            if (targetNs !== 0) {
              return {
                status: "moved_to_other_namespace",
                title: title,
                target: targetTitle,
                targetNs: targetNs,
                via: "יומן",
                timestamp: moveEvent.timestamp,
                moveLog: moveLog,
              };
            }

            return resolveTitleChain(targetTitle, depth + 1, visited, moveLog).then(
              function (res) {
                if (res.status === "found") {
                  return {
                    status: "renamed",
                    title: res.title,
                    from: title,
                    page: res.page,
                    via: "יומן",
                    timestamp: moveEvent.timestamp,
                    moveLog: res.moveLog,
                  };
                }
                return res;
              }
            );
          }

          moveLog.push({
            type: "delete",
            user: deleteEvent.user,
            timestamp: deleteEvent.timestamp,
            comment: deleteEvent.comment,
          });
          return {
            status: "deleted",
            title: title,
            reason: deleteEvent.comment,
            timestamp: deleteEvent.timestamp,
            via: "יומן",
            moveLog: moveLog,
          };
        }
      );
    }

    // ==================================================================
    // השוואת מצב הדף במכלול למצב בוויקיפדיה. כשהדף המקומי כבר נמצא באותו
    // מצב - הפניה לאותו יעד, או פירושונים מול פירושונים - אין על מה להתריע.
    // כשל בבדיקה אינו מדלג: הכרטיס מוצג כרגיל, כמו לפני הנדבך הזה.
    // ==================================================================
    // יעד ההפניה המקומית לפי פתרון ההפניות של השרת, ולא לפי פענוח ויקיטקסט:
    // כך מכוסים כל כינויי ההפניה והנרמול של כותרת היעד.
    function fetchLocalRedirectTarget(title) {
      return localQuery({ titles: title, redirects: 1 }).then(function (data) {
        var redirects = data.query && data.query.redirects;
        if (!Array.isArray(redirects) || !redirects.length || !redirects[0].to) {
          throw structureError("יעד ההפניה במכלול");
        }
        return {
          title: redirects[0].to,
          fragment: redirects[0].tofragment || null,
        };
      });
    }

    function localStateMatches(result) {
      // אותו סימון פירושונים שמשמש בצד ויקיפדיה (מאפייני הדף), מאותה
      // שליפה של נתוני הדף המקומי - בלי תלות בשם קטגוריה ובלי בקשה נוספת.
      if (result.status === "disambiguation") {
        return Promise.resolve(currentLocalPage.disambiguation === true);
      }

      if (result.status === "redirect" && currentLocalPage.status === "redirect") {
        return fetchLocalRedirectTarget(currentPageName)
          .then(function (localTarget) {
            return (
              sameTitle(localTarget.title, result.target) &&
              normalizeTitle(localTarget.fragment) === normalizeTitle(result.targetFragment)
            );
          })
          .catch(function (err) {
            if (err && err.silent) throw err;
            return false;
          });
      }

      return Promise.resolve(false);
    }

    // מצב הדף הנוכחי וזמן יצירתו בשאילתה קלה אחת, כששדות התבנית כבר ידועים
    // מהדף עצמו. כך לא שולפים את כל הוויקיטקסט רק בשביל שלושה שדות.
    function fetchCurrentPage(title, fields) {
      return localQuery({
        titles: title,
        prop: "info|pageprops|revisions",
        rvprop: "timestamp",
        rvlimit: 1,
        rvdir: "newer",
        ppprop: "disambiguation",
        indexpageids: 1,
      }).then(function (data) {
        var page = firstPage(data);
        if (!page || "missing" in page || typeof page.length !== "number") {
          throw structureError("הדף הנוכחי במכלול");
        }
        var rev = page.revisions && page.revisions[0];
        return {
          page: {
            title: page.title,
            status: "redirect" in page ? "redirect" : "article",
            disambiguation: !!(page.pageprops && "disambiguation" in page.pageprops),
            fields: fields,
            size: page.length,
          },
          creationTs: rev && rev.timestamp ? rev.timestamp : null,
        };
      });
    }

    // בלי שדות מהדף (אין תבנית, או דף הפניה שאינו מציג אותה): שתי שאילתות,
    // תוכן הדף וזמן היצירה, כמו קודם.
    function fetchCurrentPageWithText(title) {
      var creationRequest = fetchLocalCreationTs(title).catch(function (err) {
        if (err && err.silent) throw err;
        return null;
      });
      return Promise.all([fetchLocalPageData(title), creationRequest]).then(function (results) {
        if (results[0].status === "missing") throw structureError("הדף הנוכחי במכלול");
        return { page: results[0], creationTs: results[1] };
      });
    }

    // נקודת הכניסה היחידה להכרעה. knownFields: שדות התבנית כפי שהדף מציג
    // אותם, או null.
    function run(mechalolTitle, pageName, knownFields) {
      ownFields = { דף: null, גרסה: null, פריט: null };
      localCreationTs = null;
      localCreationFailed = false;
      currentLocalPage = null;
      currentPageName = pageName;

      return (knownFields ? fetchCurrentPage(pageName, knownFields) : fetchCurrentPageWithText(pageName))
        .then(function (current) {
          currentLocalPage = current.page;
          ownFields = current.page.fields;
          localCreationTs = current.creationTs;
          localCreationFailed = !current.creationTs;
          return resolveWikipediaState(mechalolTitle, ownFields);
        })
        .then(function (result) {
          return localStateMatches(result).then(function (matches) {
            if (matches && hasWarnings(result)) result.localStateMatched = true;
            return { result: result, localStateMatched: matches };
          });
        });
    }

    return {
      run: run,
      normalizeTitle: normalizeTitle,
      sameTitle: sameTitle,
      hasWarnings: hasWarnings,
      fetchLog: fetchLog,
      filterAndSortLog: filterAndSortLog,
      fetchLocalPageData: fetchLocalPageData,
      wpQuery: wpQuery,
      localQuery: localQuery,
      firstPage: firstPage,
      netGet: netGet,
      structureError: structureError,
      replaceWikipediaSortPageField: replaceWikipediaSortPageField,
      extractTemplateFields: extractTemplateFields,
      parseRedirectLine: parseRedirectLine,
      getOwnFields: function () { return ownFields; },
      getLocalCreationTs: function () { return localCreationTs; },
      getLocalCreationFailed: function () { return localCreationFailed; },
      getCurrentLocalPage: function () { return currentLocalPage; }
    };
  };
})(window);
