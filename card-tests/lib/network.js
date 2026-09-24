'use strict';

// נתב הרשת. כל בקשת קריאה שהקוד שולח (דרך $.ajax או fetch) מסווגת
// לנתיב בעל שם, נענית מנתוני התרחיש ונרשמת. בקשה שאין לה נתיב מוגדר
// אינה נענית בשקט: היא נרשמת כשגיאת ניתוב והבדיקה נכשלת.
//
// ברמה א' כל התשובות מגיעות מנתוני התרחיש כאן.
// ברמה ב' שכבת הכרטיס עונה רק על מה שתלוי בכותרת מסוימת במכלול
// (דפי יעד, מקשרים, עיבוד, תצוגה מקדימה, הרשאות), וכל השאר עובר למודל
// הרשת של סוויטת החוזה, כך שהליבה והכרטיס רואים אותו עולם.

const LOCAL = 'local';
const WP = 'wp';

function norm(title) {
  return String(title || '').replace(/_/g, ' ').trim();
}

// סיווג בקשה לנתיב. המפתח כולל כותרת כשהתשובה תלויה בה.
function classify(endpoint, p) {
  if (endpoint === 'wikidata') return { route: 'wikidata', key: `wikidata:${p.ids || ''}` };
  if (endpoint === LOCAL) {
    if (p.meta === 'userinfo') return { route: 'userinfo', key: 'userinfo' };
    // מודול ההפניות מוויקיפדיה: מצב ההפניות במכלול (קיום והגנת יצירה).
    // חלון תיקון הקישורים: טעינת דף לעריכה, עם זמן השרת לזיהוי התנגשות.
    if (p.prop === 'info|revisions' && p.curtimestamp) {
      return { route: 'local-edit-page', key: `local-edit-page:${norm(p.titles)}`, title: norm(p.titles) };
    }
    if (p.prop === 'info' && p.inprop === 'protection') {
      return { route: 'local-exists', key: `local-exists:${norm(p.titles)}`, titles: String(p.titles).split('|').map(norm) };
    }
    if (p.action === 'parse' && p.text !== undefined) return { route: 'parse-text', key: 'parse-text' };
    if (p.action === 'parse' && p.page) return { route: 'parse-page', key: `parse-page:${norm(p.page)}`, title: norm(p.page) };
    if (p.list === 'backlinks') {
      return {
        route: 'backlinks',
        // שאילתת התבניות מקבלת מפתח נפרד, כך שמפרטי כשל קיימים
        // (backlinks:<כותרת>:<סינון>) ממשיכים לחול רק על מרחב הערכים.
        key: String(p.blnamespace) === '10'
          ? `backlinks:${norm(p.bltitle)}:${p.blfilterredir}:templates`
          : `backlinks:${norm(p.bltitle)}:${p.blfilterredir}`,
        title: norm(p.bltitle),
        filter: p.blfilterredir,
        namespaces: String(p.blnamespace),
      };
    }
    if (p.prop === 'info|revisions|pageprops') return { route: 'local-page', key: `local-page:${norm(p.titles)}`, title: norm(p.titles) };
    if (p.prop === 'revisions' && p.rvdir === 'newer') return { route: 'local-creation', key: 'local-creation', title: norm(p.titles) };
    if (p.prop === 'info|pageprops' && p.redirects) return { route: 'preview-info', key: `preview-info:${norm(p.titles)}`, title: norm(p.titles) };
    // מסלול דפי ההפניה בכרטיס: שרשרת הפניות מלאה, ויומן ההעברות המקומי.
    if (p.prop === 'info' && p.redirects) return { route: 'local-chain', key: `local-chain:${norm(p.titles)}`, title: norm(p.titles) };
    if (p.list === 'logevents') {
      return { route: 'local-log', key: `local-log:${norm(p.letitle)}:${p.letype}`, title: norm(p.letitle), type: p.letype };
    }
    if (p.redirects && !p.prop) return { route: 'local-redirect', key: 'local-redirect', title: norm(p.titles) };
  }
  if (endpoint === WP) {
    // מודול ההפניות מוויקיפדיה: ההפניות אל כותרת, ותוכן ההפניות.
    if (p.prop === 'linkshere') return { route: 'wp-linkshere', key: `wp-linkshere:${norm(p.titles)}`, title: norm(p.titles) };
    if (p.prop === 'revisions' && p.rvprop === 'content') {
      return { route: 'wp-content', key: 'wp-content', titles: String(p.titles).split('|').map(norm) };
    }
    if (p.list === 'logevents') {
      return { route: 'wp-log', key: `wp-log:${norm(p.letitle)}:${p.letype}`, title: norm(p.letitle), type: p.letype };
    }
    if (p.revids) return { route: 'wp-revision', key: 'wp-revision' };
    if (p.titles && p.prop === 'info' && p.redirects) {
      return { route: 'wp-redirect', key: `wp-redirect:${norm(p.titles)}`, title: norm(p.titles) };
    }
    if (p.titles) return { route: 'wp-title', key: `wp-title:${norm(p.titles)}`, title: norm(p.titles) };
  }
  return { route: 'unknown', key: `${endpoint}:unknown` };
}

// מפרט כשל: { type: 'api', code } | { type: 'http', status } | { type: 'abort' },
// עם times (כמה פעמים להיכשל; ברירת מחדל: תמיד) ו-skip (כמה ניסיונות ראשונים
// מצליחים לפני הכשל).
function failureOutcome(spec) {
  if (spec.type === 'api') return { data: { error: { code: spec.code || 'test-error', info: 'test' } } };
  if (spec.type === 'http') return { fail: { status: spec.status || 500, textStatus: 'error' } };
  if (spec.type === 'abort') return { fail: { status: 0, textStatus: 'abort' } };
  if (spec.type === 'timeout') return { fail: { status: 0, textStatus: 'timeout' } };
  throw new Error(`מפרט כשל לא מוכר: ${JSON.stringify(spec)}`);
}

function describeOutcome(outcome) {
  if (!outcome) return null;
  if (outcome.fail) return outcome.fail.textStatus === 'error' ? `http:${outcome.fail.status}` : outcome.fail.textStatus;
  if (outcome.data && outcome.data.error) return `api:${outcome.data.error.code}`;
  return null;
}

function createNetwork(options) {
  const {
    level,          // 'A' | 'B'
    net,            // נתוני הרשת של התרחיש
    wiki,           // הדמיית הוויקי המקומי
    rights,         // מערך הרשאות של הפרופיל
    contractNet,    // מודל הרשת של סוויטת החוזה (רמה ב' בלבד)
    pageName,       // שם הדף הנוכחי, עם רווחים
  } = options;

  const calls = [];
  const routeErrors = [];
  const attempts = new Map();
  const faults = net.faults || {};
  const delays = net.delays || {};

  function nextAttempt(key) {
    const n = (attempts.get(key) || 0) + 1;
    attempts.set(key, n);
    return n;
  }

  function injected(key, attempt) {
    const spec = faults[key];
    if (!spec) return null;
    // skip: כמה ניסיונות ראשונים עוברים בהצלחה לפני שהכשל מתחיל.
    const skip = spec.skip || 0;
    const times = spec.times === undefined ? Infinity : spec.times;
    return attempt > skip && attempt <= skip + times ? failureOutcome(spec) : null;
  }

  // ---- תשובות שכבת הכרטיס ----

  function userinfo() {
    return { data: { query: { userinfo: { id: rights.length ? 7 : 0, name: 'בודק', rights: rights.slice() } } } };
  }

  function backlinks(info) {
    const spec = (net.backlinks && net.backlinks[info.title]) || {};
    const redirects = info.filter === 'redirects';
    // שאילתה נפרדת למרחב התבניות (10), עם סימן "יש עוד" משלה.
    if (info.namespaces === '10') {
      const tdata = {
        query: { backlinks: (spec.templates || []).map((t, i) => ({ pageid: 900 + i, ns: 10, title: t })) },
      };
      if (spec.templateMore) tdata.continue = { blcontinue: '10|999', continue: '-||' };
      return { data: tdata };
    }
    const titles = (redirects ? spec.redirects : spec.direct) || [];
    const more = redirects ? spec.redirectMore : spec.directMore;
    const data = {
      query: {
        backlinks: titles.map((t, i) => ({ pageid: 500 + i, ns: 0, title: t, ...(redirects ? { redirect: '' } : {}) })),
      },
    };
    if (more) data.continue = { blcontinue: '0|999', continue: '-||' };
    return { data };
  }

  // עיבוד ויקיטקסט של סיבת מחיקה: קישורים חיצוניים הופכים לקישורי HTML.
  function parseText(params) {
    const text = String(params.text || '');
    const html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/\[(https?:\/\/[^\s\]]+) ([^\]]+)\]/g, '<a rel="nofollow" class="external text" href="$1">$2</a>');
    return { data: { parse: { title: 'עמוד ראשי', text: { '*': `<div class="mw-parser-output"><p>${html}\n</p></div>` } } } };
  }

  function wpRedirect(info) {
    const spec = (net.wp && net.wp[info.title]) || {};
    const query = {};
    if (spec.redirectTo) {
      query.redirects = [{ from: info.title, to: spec.redirectTo }];
      query.pageids = ['40'];
      query.pages = { 40: { pageid: 40, ns: 0, title: spec.redirectTo } };
    } else if (spec.missing) {
      query.pageids = ['-1'];
      query.pages = { '-1': { ns: 0, title: info.title, missing: '' } };
    } else {
      query.pageids = ['41'];
      query.pages = { 41: { pageid: 41, ns: 0, title: info.title } };
    }
    return { data: { query } };
  }

  function wpLog(info) {
    const byTitle = (net.wpLogs && net.wpLogs[info.title]) || {};
    const events = (byTitle[info.type] || []).map((ev) => ({ ...ev, type: info.type, title: info.title }));
    return { data: { query: { logevents: events } } };
  }

  // יומן מקומי: אירועים לפי כותרת וסוג, מתוך net.localLogs.
  function localLog(info) {
    const byTitle = (net.localLogs && net.localLogs[info.title]) || {};
    const events = (byTitle[info.type] || []).map((ev) => ({ ...ev, type: info.type, title: info.title }));
    return { data: { query: { logevents: events } } };
  }

  // ---- מודול ההפניות מוויקיפדיה ----
  // net.wpRedirects[כותרת] = { titles: [...], more }; net.wpTexts[כותרת] = טקסט,
  // או null להפניה שכבר אינה קיימת; net.createProtected = [כותרות].
  function wpLinkshere(info) {
    const spec = (net.wpRedirects && net.wpRedirects[info.title]) || null;
    const page = { pageid: 41, ns: 0, title: info.title };
    if (spec && spec.titles && spec.titles.length) {
      page.linkshere = spec.titles.map((t, i) => ({ pageid: 700 + i, ns: 0, title: t, redirect: '' }));
    }
    const data = { query: { pageids: ['41'], pages: { 41: page } } };
    if (spec && spec.more) data.continue = { lhcontinue: '999', continue: '||' };
    return { data };
  }

  function wpContent(info) {
    const texts = net.wpTexts || {};
    const pages = {};
    info.titles.forEach((t, i) => {
      const text = Object.prototype.hasOwnProperty.call(texts, t) ? texts[t] : null;
      if (text === null) pages[String(-1 - i)] = { ns: 0, title: t, missing: '' };
      else pages[String(800 + i)] = { pageid: 800 + i, ns: 0, title: t, revisions: [{ slots: { main: { contentmodel: 'wikitext', '*': text } } }] };
    });
    return { data: { query: { pages } } };
  }

  function localExists(info) {
    const protectedTitles = net.createProtected || [];
    const pages = {};
    info.titles.forEach((t, i) => {
      const page = wiki.get(t);
      if (!page) {
        pages[String(-1 - i)] = {
          ns: 0,
          title: t,
          missing: '',
          protection: protectedTitles.indexOf(t) !== -1 ? [{ type: 'create', level: 'sysop', expiry: 'infinity' }] : [],
        };
        return;
      }
      const out = { pageid: page.id, ns: 0, title: page.title, protection: [] };
      if (wiki.redirectOf(t)) out.redirect = '';
      pages[String(page.id)] = out;
    });
    return { data: { query: { pages } } };
  }

  function localEditPage(info) {
    const page = wiki.get(info.title);
    if (!page) {
      return { data: { curtimestamp: '2026-01-01T00:00:00Z', query: { pageids: ['-1'], pages: { '-1': { ns: 0, title: info.title, missing: '' } } } } };
    }
    const out = {
      pageid: page.id,
      ns: 0,
      title: page.title,
      revisions: [{ revid: page.rev || 1, timestamp: '2025-01-01T00:00:00Z', '*': page.content }],
    };
    if (wiki.redirectOf(info.title)) out.redirect = '';
    return { data: { curtimestamp: '2026-01-01T00:00:00Z', query: { pageids: [String(page.id)], pages: { [page.id]: out } } } };
  }

  function cardLayer(info, params) {
    switch (info.route) {
      case 'local-edit-page':
        return localEditPage(info);
      case 'wp-linkshere':
        return wpLinkshere(info);
      case 'wp-content':
        return wpContent(info);
      case 'local-exists':
        return localExists(info);
      case 'userinfo':
        return userinfo();
      case 'backlinks':
        return backlinks(info);
      case 'parse-text':
        return parseText(params);
      case 'parse-page': {
        const data = wiki.parsePage(info.title);
        return { data };
      }
      case 'preview-info':
        return { data: wiki.previewQuery(info.title) };
      case 'local-page':
        // ברמה ב' הדף הנוכחי שייך למודל החוזה, כדי שהליבה תראה בדיוק את
        // העולם שסוויטת החוזה הגדירה לו.
        if (level === 'B' && info.title === pageName) return null;
        return { data: wiki.pageQuery(info.title) };
      case 'wp-redirect':
        return level === 'A' ? wpRedirect(info) : null;
      case 'wp-log':
        return level === 'A' ? wpLog(info) : null;
      case 'local-chain':
        return { data: wiki.chainQuery(info.title) };
      case 'local-log':
        return localLog(info);
      default:
        return null;
    }
  }

  async function respond(endpoint, url, params) {
    const info = classify(endpoint, params);
    const attempt = nextAttempt(info.key);
    const call = { endpoint, params: { ...params } };
    calls.push(call);

    let outcome = injected(info.key, attempt);
    if (!outcome) outcome = cardLayer(info, params);
    if (!outcome && level === 'B') {
      try {
        if (endpoint === 'wikidata') {
          outcome = { fetchResponse: await contractNet.handleFetch(url) };
        } else {
          outcome = await contractNet.handleAjax(url, params);
          // מודל החוזה מסמן כשל תעבורה כ-{ fail: true, status, textStatus };
          // כאן כשל הוא אובייקט { status, textStatus } תחת fail.
          if (outcome && outcome.fail === true) {
            outcome = { fail: { status: outcome.status, textStatus: outcome.textStatus } };
          }
        }
      } catch (err) {
        outcome = null;
      }
    }
    if (!outcome) {
      routeErrors.push(`${info.key} ${JSON.stringify(params)}`);
      outcome = { data: { error: { code: 'card-tests-no-route' } } };
    }
    call.outcome = describeOutcome(outcome);
    outcome.delay = delays[info.key] || 0;
    return outcome;
  }

  return {
    ajax(url, params) {
      const endpoint = url === '/w/api.php' ? LOCAL : WP;
      return respond(endpoint, url, params);
    },
    fetch(url) {
      const parsed = new URL(url);
      const params = Object.fromEntries(parsed.searchParams.entries());
      return respond('wikidata', url, params);
    },
    calls,
    routeErrors,
  };
}

module.exports = { createNetwork, classify };
