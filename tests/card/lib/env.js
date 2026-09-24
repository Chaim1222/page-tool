'use strict';

// סביבת בדיקה אחת לכל תרחיש: דפדפן מדומה, ג'יי-קוורי שנטען בתוכו כמו
// באתר, הדמיה של ממשק מדיה־ויקי, וטוען שמגיש את שבעת קבצי הייצור
// מהדיסק כפי שהם, בלי שום שינוי. כל קריאה, כתיבה, טעינה ושגיאה נרשמות.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM, VirtualConsole } = require('jsdom');
const { createClock } = require('./clock');
const { createNetwork } = require('./network');
const { Wiki, norm } = require('./wiki');
const { serializeRegions } = require('./serialize');

const PAGE_PREFIX = 'משתמש:בוט גאון הירדן/';

const PRODUCTION_FILES = {
  main: 'site/main.js',
  core: 'site/core.js',
  card: 'site/card.js',
  details: 'site/details.js',
  preview: 'site/preview.js',
  messages: 'site/messages.js',
  css: 'site/style.css',
  redirects: 'site/redirects.js',
  links: 'site/links.js',
};

// שם הדף באתר → מפתח הקובץ. הטוען מגיש רק את מה שמופיע כאן.
const PAGE_TO_KEY = {
  'Gadget page tool.core.js': 'core',
  'Gadget page tool.card.js': 'card',
  'Gadget page tool.details.js': 'details',
  'Gadget page tool.preview.js': 'preview',
  'Gadget page tool.messages.js': 'messages',
  'Gadget page tool.css': 'css',
  'Gadget page tool.redirects.js': 'redirects',
  'Gadget page tool.links.js': 'links',
};

const compiledCache = new Map();
function compiledScript(file) {
  if (!compiledCache.has(file)) {
    const source = fs.readFileSync(file, 'utf8');
    compiledCache.set(file, new vm.Script(source, { filename: file }));
  }
  return compiledCache.get(file);
}

const textCache = new Map();
function readText(file) {
  if (!textCache.has(file)) textCache.set(file, fs.readFileSync(file, 'utf8'));
  return textCache.get(file);
}

const JQUERY_PATH = require.resolve('jquery/dist/jquery.js');

// הבטחה שנדחתה בלי טיפול מיוחסת לתרחיש שרץ כרגע.
let activeEnv = null;
let rejectionHookInstalled = false;
function installRejectionHook() {
  if (rejectionHookInstalled) return;
  rejectionHookInstalled = true;
  process.on('unhandledRejection', (reason) => {
    if (activeEnv) activeEnv.log.uncaught.push('דחייה ללא טיפול: ' + describeValue(reason));
    else process.stderr.write('דחייה ללא טיפול מחוץ לתרחיש: ' + describeValue(reason) + '\n');
  });
}

function describeValue(value) {
  if (value && typeof value === 'object' && 'message' in value) {
    const name = value.name || 'Error';
    const code = value.code ? ` [${value.code}]` : '';
    return `${name}: ${value.message}${code}`;
  }
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch (e) {
    return String(value);
  }
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] !== undefined) out[key] = sortKeys(value[key]);
  }
  return out;
}

function wikiUrlencode(str) {
  return encodeURIComponent(String(str))
    .replace(/[!'()*~]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/%20/g, '_')
    .replace(/%3B/g, ';')
    .replace(/%40/g, '@')
    .replace(/%24/g, '$')
    .replace(/%2C/g, ',')
    .replace(/%2F/g, '/')
    .replace(/%3A/g, ':');
}

async function createEnv(spec) {
  installRejectionHook();

  const toolDir = spec.toolDir;
  const pageName = spec.pageName || 'מקומי';
  const pageTitle = norm(pageName);
  const level = spec.level;

  const log = {
    reads: null, // מוצבע אל network.calls
    writes: [],
    scripts: [],
    styles: [],
    imports: [],
    confirms: [],
    notifies: [],
    console: [],
    uncaught: [],
    runs: [],
    events: [],
  };

  const env = {
    spec,
    log,
    level,
    pageTitle,
    cardRuntimes: [],
    redirectsFeatures: [],
    detailsFactories: 0,
    previewFactories: 0,
    coreOutcomes: [],
    cursors: {},
  };

  const clock = createClock((err) => log.uncaught.push('חריגה בטיימר: ' + describeValue(err)));
  env.clock = clock;

  // ---- דפדפן מדומה ----
  const virtualConsole = new VirtualConsole();
  const record = (level) => (...args) => {
    log.console.push({ level, text: args.map(describeValue).join(' ') });
  };
  virtualConsole.on('error', record('error'));
  virtualConsole.on('warn', record('warn'));
  virtualConsole.on('log', () => {});
  virtualConsole.on('info', () => {});
  virtualConsole.on('jsdomError', (e) => {
    const detail = e.detail ? ' ← ' + describeValue(e.detail) : '';
    log.uncaught.push('שגיאת דפדפן: ' + e.message + detail);
  });

  const html =
    '<!doctype html><html lang="he" dir="rtl"><head><title>בדיקה</title></head>' +
    '<body class="skin-vector">' +
    '<nav id="p-lang"><div class="vector-menu-content"><ul class="vector-menu-content-list"></ul></div></nav>' +
    '<div id="content"><div class="mw-indicators"></div>' +
    `<h1 id="firstHeading">${pageTitle}</h1>` +
    '<div id="bodyContent"><div id="mw-content-text"><div class="mw-parser-output"><p>תוכן הדף.</p></div></div></div>' +
    '</div></body></html>';

  const dom = new JSDOM(html, {
    url: 'https://www.hamichlol.org.il/wiki/' + wikiUrlencode(pageTitle),
    runScripts: 'outside-only',
    virtualConsole,
  });
  const w = dom.window;
  const context = dom.getInternalVMContext();
  env.dom = dom;
  env.window = w;

  w.setTimeout = clock.setTimeout;
  w.clearTimeout = clock.clearTimeout;
  w.setInterval = () => {
    log.uncaught.push('שימוש לא צפוי ב-setInterval');
    return 0;
  };

  function toWindow(value) {
    return value === undefined ? undefined : w.JSON.parse(JSON.stringify(value));
  }
  env.toWindow = toWindow;

  compiledScript(JQUERY_PATH).runInContext(context);
  const $ = w.jQuery;
  env.$ = $;

  // בדפדפן מדומה אין פריסה, ולכן בדיקת הנראות של ג'יי-קוורי מחזירה תמיד
  // "מוסתר". הקוד פותח וסוגר פאנלים לפיה, ולכן היא מוחלפת כאן בבדיקה
  // לפי סגנון התצוגה המחושב של האלמנט ושל כל הוריו. זו החלפה בסביבת
  // הבדיקה בלבד, בספרייה, לא בקבצי הייצור.
  function isRendered(elem) {
    if (!elem || !elem.isConnected) return false;
    for (let node = elem; node && node.nodeType === 1; node = node.parentNode) {
      if (node.style && node.style.display === 'none') return false;
      if (w.getComputedStyle(node).display === 'none') return false;
    }
    return true;
  }
  $.expr.pseudos.visible = (elem) => isRendered(elem);
  $.expr.pseudos.hidden = (elem) => !isRendered(elem);
  env.isRendered = isRendered;

  // ---- ויקי ורשת ----
  const wiki = new Wiki(spec.localPages || {});
  env.wiki = wiki;

  const network = createNetwork({
    level,
    net: spec.net || {},
    wiki,
    rights: spec.rights || [],
    contractNet: spec.contractNet || null,
    pageName: pageTitle,
  });
  env.network = network;
  log.reads = network.calls;

  $.ajax = function (options) {
    const deferred = $.Deferred();
    network.ajax(options.url, options.data || {}).then((outcome) => {
      clock.setTimeout(() => {
        if (outcome.fail) {
          deferred.reject({ status: outcome.fail.status, readyState: 4, responseText: '' }, outcome.fail.textStatus, '');
        } else {
          deferred.resolve(toWindow(outcome.data), 'success', { status: 200 });
        }
      }, outcome.delay);
    });
    return deferred.promise();
  };

  w.fetch = function (url) {
    return network.fetch(String(url)).then(
      (outcome) =>
        new Promise((resolve) => {
          clock.setTimeout(() => {
            const r = outcome.fetchResponse;
            if (r) {
              resolve({
                ok: r.ok,
                status: r.status,
                json: () => Promise.resolve(r.json()).then(toWindow),
              });
            } else if (outcome.fail) {
              resolve({ ok: false, status: outcome.fail.status || 500, json: () => Promise.resolve({}) });
            } else {
              resolve({ ok: true, status: 200, json: () => Promise.resolve(toWindow(outcome.data)) });
            }
          }, outcome.delay);
        })
    );
  };

  // ---- פעולות כתיבה ----
  const plans = {};
  for (const [kind, list] of Object.entries(spec.plans || {})) plans[kind] = list.slice();
  function takePlan(kind) {
    const list = plans[kind];
    return list && list.length ? list.shift() : null;
  }

  function apiReject(deferred, code) {
    deferred.reject(code, toWindow({ error: { code, info: 'test' } }));
  }

  function performPost(params) {
    switch (params.action) {
      case 'move':
        return wiki.move(params.from, params.to, !!params.noredirect, !!params.movetalk);
      case 'delete':
        return wiki.remove(params.title);
      case 'edit':
        if (params.pageid) return { data: { result: 'Success', pageid: Number(params.pageid), title: 'דף הבקשות ממפעילים' } };
        if (params.createonly && params.title && wiki.get(params.title)) return { error: 'articleexists' };
        if (params.title && params.section === 'new' && params.text !== undefined) {
          return wiki.addSection(params.title, params.sectiontitle, params.text);
        }
        if (params.title && params.text !== undefined) return wiki.edit(params.title, params.text);
        return { error: 'card-tests-unsupported-edit' };
      default:
        return { error: 'card-tests-unsupported-action' };
    }
  }

  function Api() {}
  Api.prototype.postWithToken = function (tokenType, params) {
    const deferred = $.Deferred();
    const p = { ...(params || {}) };
    const entry = { api: 'postWithToken', token: tokenType, params: sortKeys(p) };
    log.writes.push(entry);
    const planned = takePlan(p.action);
    if (planned && typeof planned.effect === 'function') planned.effect(wiki);
    let outcome;
    if (planned && planned.error) outcome = { error: planned.error };
    else outcome = performPost(p);
    if (!outcome.error && planned && planned.data) outcome.data = Object.assign({}, outcome.data, planned.data);
    entry.outcome = outcome.error ? 'error:' + outcome.error : 'ok';
    clock.setTimeout(() => {
      if (outcome.error) apiReject(deferred, outcome.error);
      else deferred.resolve(toWindow({ [p.action]: outcome.data }));
    }, (planned && planned.delay) || 0);
    return deferred.promise();
  };
  Api.prototype.edit = function (title, transform) {
    const deferred = $.Deferred();
    const entry = { api: 'edit', title: norm(title) };
    log.writes.push(entry);
    const planned = takePlan('transform');
    if (planned && typeof planned.effect === 'function') planned.effect(wiki);
    clock.setTimeout(() => {
      if (planned && planned.error) {
        entry.outcome = 'error:' + planned.error;
        apiReject(deferred, planned.error);
        return;
      }
      const page = wiki.get(title);
      if (!page) {
        entry.outcome = 'error:nocreate-missing';
        apiReject(deferred, 'nocreate-missing');
        return;
      }
      let params;
      try {
        params = transform(toWindow({ timestamp: '2026-03-01T00:00:00Z', content: page.content }));
      } catch (err) {
        entry.outcome = 'transform-threw:' + (err && (err.code || err.message));
        deferred.reject(err);
        return;
      }
      Promise.resolve(params).then((resolved) => {
        entry.params = sortKeys({ ...resolved });
        const r = wiki.edit(title, resolved.text);
        entry.outcome = 'ok';
        clock.setTimeout(() => deferred.resolve(toWindow({ edit: r.data })), 0);
      });
    }, 0);
    return deferred.promise();
  };
  Api.prototype.get = function (params) {
    network.routeErrors.push('mw.Api.get ' + JSON.stringify(params));
    return $.Deferred().reject('card-tests-no-route').promise();
  };

  // ---- ממשק מדיה־ויקי מדומה ----
  const config = {
    wgCategories: [],
    wgNamespaceNumber: 0,
    wgPageName: pageTitle.replace(/ /g, '_'),
    wgAction: spec.action || 'view',
    wgUserGroups: spec.userGroups || [],
    wgUserName: spec.userName || null,
    wgIsMainPage: false,
    wgScript: '/w/index.php',
    wgArticlePath: '/wiki/$1',
    wgFormattedNamespaces: { 0: '', 1: 'שיחה', 2: 'משתמש', 4: 'המכלול' },
  };
  // מזהה הדף מוגדר רק בתרחיש שמבקש אותו (0 = דף שאינו קיים), כך שבכל
  // התרחישים האחרים הקריאה מחזירה null כמו קודם.
  if (spec.articleId !== undefined) config.wgArticleId = spec.articleId;

  function getUrl(title, params) {
    let page = title === undefined || title === null ? config.wgPageName : String(title);
    let fragment = '';
    const hash = page.indexOf('#');
    if (hash !== -1) {
      fragment = page.slice(hash + 1);
      page = page.slice(0, hash);
    }
    const query = params && Object.keys(params).length ? $.param(params) : '';
    let url = query
      ? config.wgScript + '?title=' + wikiUrlencode(page) + '&' + query
      : config.wgArticlePath.replace('$1', wikiUrlencode(page));
    if (fragment) url += '#' + fragment.replace(/ /g, '_');
    return url;
  }

  const scriptFaults = spec.scriptFaults || {};
  const scriptAttempts = {};
  function scriptShouldFail(key) {
    const n = (scriptAttempts[key] = (scriptAttempts[key] || 0) + 1);
    const f = scriptFaults[key];
    if (!f) return false;
    const times = f.times === undefined ? Infinity : f.times;
    return n <= times;
  }

  function runProductionFile(key) {
    compiledScript(path.join(toolDir, PRODUCTION_FILES[key])).runInContext(context);
    afterLoad(key);
  }

  w.mw = {
    config: {
      get(name) {
        return Object.prototype.hasOwnProperty.call(config, name) ? config[name] : null;
      },
    },
    user: {
      options: {
        get(name) {
          return name === 'userjs-import-source' ? 'direct' : null;
        },
      },
    },
    util: {
      getUrl,
      wikiUrlencode,
      addCSS(text) {
        const style = w.document.createElement('style');
        style.textContent = text;
        w.document.head.appendChild(style);
        return style.sheet;
      },
    },
    loader: {
      // אישור העיון של האתר (spec.reviewAck): 'accept' (ברירת מחדל) או
      // 'unavailable' (הגאדג'ט לא נטען). כמו באתר, הפונקציה לא ממתינה
      // למשתמש ואינה נכשלת. כל קריאה נרשמת.
      using(modules) {
        const list = [].concat(modules || []);
        if (list.indexOf('ext.gadget.alert-script') === -1) return Promise.resolve();
        const mode = spec.reviewAck || 'accept';
        if (mode === 'unavailable') return Promise.reject(new w.Error('module-unavailable'));
        const moduleApi = {
          requireReviewAck() {
            log.events.push('אישור עיון');
            return Promise.resolve();
          },
        };
        return Promise.resolve(function require(name) {
          if (name !== 'ext.gadget.alert-script') throw new w.Error('unknown module ' + name);
          return moduleApi;
        });
      },
      getScript(url) {
        const u = new URL(url, 'https://www.hamichlol.org.il');
        const title = norm(u.searchParams.get('title') || url);
        const name = title.indexOf(PAGE_PREFIX) === 0 ? title.slice(PAGE_PREFIX.length) : title;
        const key = PAGE_TO_KEY[name];
        log.scripts.push(name);
        return new Promise((resolve, reject) => {
          clock.setTimeout(() => {
            if (!key || scriptShouldFail(key)) {
              reject(new Error('טעינת הסקריפט נכשלה: ' + name));
              return;
            }
            try {
              runProductionFile(key);
              resolve();
            } catch (err) {
              reject(err);
            }
          }, 0);
        });
      },
    },
    Api,
    notify(message) {
      log.notifies.push(describeValue(message));
    },
  };

  w.importScript = function (page) {
    log.imports.push(page);
  };

  const confirmAnswers = (spec.confirms || []).slice();
  w.confirm = function (message) {
    log.confirms.push(String(message));
    return confirmAnswers.length ? confirmAnswers.shift() : true;
  };

  // קובץ העיצוב נטען דרך <link>. בדפדפן מדומה אין טעינת משאבים, ולכן
  // הסביבה מזהה את הוספת הקישור, מחילה את קובץ העיצוב האמיתי מהדיסק
  // ומפעילה את אירוע הטעינה (או את אירוע הכשל, אם התרחיש מבקש זאת).
  const styleFault = spec.styleFault || null;
  let styleAttempts = 0;
  const observer = new w.MutationObserver((records) => {
    for (const r of records) {
      for (const node of r.addedNodes) {
        if (node.nodeName === 'LINK' && node.id === 'hmk-card-stylesheet') handleStylesheet(node);
      }
    }
  });
  observer.observe(w.document.head, { childList: true });
  function handleStylesheet(link) {
    styleAttempts++;
    log.styles.push(decodeURIComponent(link.getAttribute('href') || ''));
    const fail = styleFault && styleAttempts <= (styleFault.times === undefined ? Infinity : styleFault.times);
    clock.setTimeout(() => {
      if (fail) {
        link.dispatchEvent(new w.Event('error'));
        return;
      }
      const style = w.document.createElement('style');
      style.setAttribute('data-card-tests', 'card-css');
      style.textContent = readText(path.join(toolDir, PRODUCTION_FILES.css));
      w.document.head.appendChild(style);
      link.dispatchEvent(new w.Event('load'));
    }, 0);
  }

  // ---- נקודות חיבור אחרי טעינת קבצים ----
  function afterLoad(key) {
    if (key === 'core') wrapCore();
    if (key === 'card') {
      const real = w.HMK_PAGE_TOOL_CARD_FACTORY;
      w.HMK_PAGE_TOOL_CARD_FACTORY = function (runtime) {
        env.cardRuntimes.push(runtime);
        return real(runtime);
      };
    }
    if (key === 'details') {
      const real = w.HMK_PAGE_TOOL_DETAILS_FACTORY;
      w.HMK_PAGE_TOOL_DETAILS_FACTORY = function (runtime, deps) {
        env.detailsFactories++;
        return real(runtime, deps);
      };
    }
    if (key === 'redirects') {
      const real = w.HMK_PAGE_TOOL_REDIRECTS_FACTORY;
      w.HMK_PAGE_TOOL_REDIRECTS_FACTORY = function (runtime) {
        const feature = real(runtime);
        env.redirectsFeatures.push(feature);
        return feature;
      };
    }
    if (key === 'preview') {
      const real = w.HMK_PAGE_TOOL_PREVIEW_FACTORY;
      w.HMK_PAGE_TOOL_PREVIEW_FACTORY = function (runtime, deps) {
        env.previewFactories++;
        return real(runtime, deps);
      };
    }
  }

  // ברמה א' ההכרעה מוזרקת: הליבה האמיתית נוצרת ומספקת את כל כלי הרשת
  // והפענוח, אבל run מחזיר את תוצאת התרחיש. ברמה ב' הליבה רצה במלואה,
  // והעטיפה רק רושמת את התוצאה ואת קריאות הרשת עד נקודת הסיום.
  function wrapCore() {
    const real = w.HMK_PAGE_TOOL_CORE_FACTORY;
    w.HMK_PAGE_TOOL_CORE_FACTORY = function (options) {
      const core = real(options);
      if (level === 'A') return injectedCore(core);
      return Object.assign({}, core, {
        run(mechalolTitle, name) {
          log.runs.push({ mechalolTitle, pageName: name });
          const start = network.calls.length;
          return core.run(mechalolTitle, name).then(
            (outcome) => {
              env.coreOutcomes.push({ outcome, calls: network.calls.slice(start) });
              return outcome;
            },
            (error) => {
              env.coreOutcomes.push({ error, calls: network.calls.slice(start) });
              throw error;
            }
          );
        },
      });
    };
  }

  function injectedCore(core) {
    const base = spec.fixture || {};
    // fixture.runs: רצף תוצאות לריצות עוקבות (למשל כשל ואחריו הצלחה).
    const runs = Array.isArray(base.runs) ? base.runs.slice() : null;
    const fx = base;
    const ownFields = toWindow(Object.assign({ דף: null, גרסה: null, פריט: null }, fx.ownFields || {}));
    const current = wiki.get(pageTitle);
    const currentLocal = current
      ? toWindow({
          title: pageTitle,
          status: wiki.redirectOf(pageTitle) ? 'redirect' : 'article',
          disambiguation: !!current.disambiguation,
          fields: Object.assign({ דף: null, גרסה: null, פריט: null }, fx.ownFields || {}),
          wikitext: current.content,
          size: fx.localSize === undefined ? Buffer.byteLength(current.content, 'utf8') : fx.localSize,
        })
      : null;
    return Object.assign({}, core, {
      run(mechalolTitle, name) {
        log.runs.push({ mechalolTitle, pageName: name });
        const current = runs ? runs.shift() || base : base;
        return new Promise((resolve, reject) => {
          clock.setTimeout(() => {
            if (current.error) {
              const err = new w.Error(current.error.message || '');
              Object.assign(err, current.error);
              reject(err);
              return;
            }
            resolve(toWindow({ result: current.result, localStateMatched: !!current.localStateMatched }));
          }, 0);
        });
      },
      getOwnFields: () => ownFields,
      getLocalCreationTs: () => (fx.creationFailed ? null : fx.creationTs || '2026-01-01T00:00:00Z'),
      getLocalCreationFailed: () => !!fx.creationFailed,
      getCurrentLocalPage: () => currentLocal,
    });
  }

  // ---- הרצה ויציבות ----
  async function tick() {
    await new Promise((resolve) => setImmediate(resolve));
  }

  // מריץ מיקרו־משימות וטיימרים שזמנם הגיע, עד שהמערכת שקטה, בלי לקדם זמן.
  async function flush() {
    let quiet = 0;
    for (let i = 0; i < 5000; i++) {
      await tick();
      const ran = clock.runDue();
      if (ran === 0) {
        quiet++;
        if (quiet >= 3) return;
      } else {
        quiet = 0;
      }
    }
    throw new Error('הסביבה לא התייצבה');
  }

  // מקדם זמן לטיימר הבא שוב ושוב, עד שלא נשארו טיימרים קצרים.
  // טיימרים של 15 שניות ומעלה הם מגבלות זמן של בקשות, ואינם מופעלים.
  async function settle(options) {
    const advance = !options || options.advance !== false;
    await flush();
    if (!advance) return;
    for (let i = 0; i < 1000; i++) {
      const next = clock.nextTimer();
      if (!next || next.due - clock.now() >= 15000) return;
      clock.advanceTo(next.due);
      await flush();
    }
    throw new Error('יותר מדי טיימרים ברצף');
  }

  async function advance(ms) {
    const target = clock.now() + ms;
    for (;;) {
      const next = clock.nextTimer();
      if (!next || next.due > target) break;
      clock.advanceTo(next.due);
      await flush();
    }
    clock.advanceTo(target);
    await flush();
  }

  env.flush = flush;
  env.settle = settle;
  env.advance = advance;

  env.start = async function start() {
    activeEnv = env;
    runProductionFile('main');
    await settle(spec.startSettle);
  };

  // מסגרת: מצב הדף אחרי צעד, והשינויים ברישום מאז המסגרת הקודמת.
  function since(name, list) {
    const from = env.cursors[name] || 0;
    env.cursors[name] = list.length;
    return list.slice(from);
  }

  env.frame = function frame(label) {
    const reads = since('reads', network.calls).map((c) => {
      const out = { endpoint: c.endpoint, params: sortKeys(c.params) };
      if (c.outcome) out.outcome = c.outcome;
      return out;
    });
    reads.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const f = {
      step: label,
      dom: serializeRegions(w),
      reads,
      writes: since('writes', log.writes).map(sortKeys),
      scripts: since('scripts', log.scripts),
      styles: since('styles', log.styles),
      imports: since('imports', log.imports),
      confirms: since('confirms', log.confirms),
      notifies: since('notifies', log.notifies),
      console: since('console', log.console),
      uncaught: since('uncaught', log.uncaught),
      routeErrors: since('routeErrors', network.routeErrors),
    };
    return f;
  };

  env.close = async function close() {
    await tick();
    await tick();
    observer.disconnect();
    if (activeEnv === env) activeEnv = null;
    w.close();
  };

  return env;
}

module.exports = { createEnv, PRODUCTION_FILES, sortKeys, describeValue };
