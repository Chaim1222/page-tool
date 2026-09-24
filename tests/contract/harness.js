const fs = require('fs');
const vm = require('vm');

function stableSortObject(value) {
  if (Array.isArray(value)) return value.map(stableSortObject);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = stableSortObject(value[key]);
  return out;
}

function normalizeError(err) {
  if (!err) return null;
  return {
    kind: err.kind || null,
    transient: !!err.transient,
    silent: !!err.silent,
  };
}

function normalizeResult(value) {
  if (Array.isArray(value)) return value.map(normalizeResult);
  if (!value || typeof value !== 'object') return value;
  if (value instanceof Error || value.netError) return normalizeError(value);

  const out = {};
  for (const key of Object.keys(value)) {
    if (key === 'errorMessage') continue;
    if (key === 'error') {
      out.error = normalizeError(value.error);
      continue;
    }
    out[key] = normalizeResult(value[key]);
  }
  return stableSortObject(out);
}

function injectHooks(source) {
  const mustReplace = (needle, replacement, label) => {
    if (!source.includes(needle)) throw new Error(`Instrumentation point not found: ${label}`);
    source = source.replace(needle, replacement);
  };

  mustReplace(
    'function renderResultWhenReady(result) {',
    'function renderResultWhenReady(result) {\n      if (window.__contractHarnessCapture) return window.__contractHarnessCapture("success", result, { delivery: "render" });',
    'success'
  );

  mustReplace(
    'function showFailureCardWhenReady(error) {',
    'function showFailureCardWhenReady(error) {\n      if (window.__contractHarnessCapture) return window.__contractHarnessCapture("failure", error, { delivery: "failure" });',
    'failure'
  );

  const suppressedNeedle = `              clearTool();\n              return;\n            }\n            return renderResultWhenReady(result);`;
  const suppressedReplacement = `              if (window.__contractHarnessCapture) {\n                return window.__contractHarnessCapture("success", result, { delivery: "suppressed", localStateMatched: true });\n              }\n              clearTool();\n              return;\n            }\n            return renderResultWhenReady(result);`;
  if (source.includes(suppressedNeedle)) {
    source = source.replace(suppressedNeedle, suppressedReplacement);
  } else {
    const refactoredNeedle = `            clearTool();\n            return;\n          }\n          return renderResultWhenReady(result);`;
    const refactoredReplacement = `            if (window.__contractHarnessCapture) {\n              return window.__contractHarnessCapture("success", result, { delivery: "suppressed", localStateMatched: true });\n            }\n            clearTool();\n            return;\n          }\n          return renderResultWhenReady(result);`;
    mustReplace(refactoredNeedle, refactoredReplacement, 'suppressed state-match');
  }

  mustReplace(
    '          if (e && e.silent) return;',
    '          if (e && e.silent) {\n            if (window.__contractHarnessCapture) return window.__contractHarnessCapture("silent", e, { delivery: "silent" });\n            return;\n          }',
    'silent cancel'
  );

  return source;
}

function createJQuery(network) {
  class JQ {
    constructor(selector, attrs) {
      this.selector = selector;
      this.attrs = attrs || {};
      this.length = typeof selector === 'string' && selector === '#hmk-tool' ? 0 : 1;
    }
    text(value) {
      if (arguments.length === 0) return '';
      return this;
    }
    append() { return this; }
    prepend() { return this; }
    empty() { return this; }
    remove() { return this; }
    not() { return this; }
    after() { return this; }
    attr() { return this; }
    addClass() { return this; }
    removeClass() { return this; }
    on() { return this; }
    off() { return this; }
    find() { return new JQ('find'); }
    first() { return this; }
  }

  function $(selector, attrs) {
    return new JQ(selector, attrs);
  }

  $.ajax = function ajax(options) {
    const deferred = {
      doneCb: null,
      failCb: null,
      done(fn) { this.doneCb = fn; return this; },
      fail(fn) { this.failCb = fn; return this; },
    };

    queueMicrotask(async () => {
      try {
        const outcome = await network.handleAjax(options.url, options.data || {});
        if (outcome && outcome.fail) {
          if (deferred.failCb) deferred.failCb({ status: outcome.status || 0 }, outcome.textStatus || 'error');
        } else if (deferred.doneCb) {
          deferred.doneCb(outcome ? outcome.data : undefined);
        }
      } catch (err) {
        if (deferred.failCb) deferred.failCb({ status: 0 }, 'error');
      }
    });
    return deferred;
  };

  return $;
}

function makeNetwork(scenario, onCall) {
  const attempts = new Map();

  const callKey = (call) => {
    const p = call.params || {};
    if (call.endpoint === 'wikidata') return `wikidata:${p.ids || ''}`;
    if (p.meta === 'userinfo') return 'local:userinfo';
    if (p.rvdir === 'newer' && p.prop === 'revisions') return 'local:creation';
    if (p.prop === 'info|revisions|pageprops') return 'local:page';
    if (p.prop === 'info|pageprops|revisions') return 'local:current';
    if (p.revids) return 'wp:revision';
    if (p.list === 'logevents') return `wp:log:${p.letitle}:${p.letype}`;
    if (p.redirects === 1 && !p.prop && call.endpoint === 'local') return 'local:redirect';
    if (p.titles && call.endpoint === 'wp') return `wp:title:${p.titles}`;
    return `${call.endpoint}:other`;
  };

  function nextAttempt(key) {
    const n = (attempts.get(key) || 0) + 1;
    attempts.set(key, n);
    return n;
  }

  function failureFor(key, attempt) {
    const entry = scenario.failures && scenario.failures[key];
    if (!entry) return null;
    if (Array.isArray(entry)) return entry[attempt - 1] || null;
    return entry;
  }

  function ajaxOutcome(call) {
    const key = callKey(call);
    const attempt = nextAttempt(key);
    const injected = failureFor(key, attempt);
    if (injected) {
      if (injected.type === 'api') return { data: { error: { code: injected.code || 'test-error' } } };
      if (injected.type === 'http') return { fail: true, status: injected.status || 500, textStatus: injected.textStatus || 'error' };
      if (injected.type === 'abort') return { fail: true, status: 0, textStatus: 'abort' };
    }

    const p = call.params;
    if (key === 'local:creation') return { data: buildLocalCreation(scenario) };
    if (key === 'local:page') return { data: buildLocalPage(scenario) };
    if (key === 'local:current') return { data: buildLocalCurrent(scenario) };
    if (key === 'local:redirect') return { data: buildLocalRedirect(scenario) };
    if (key === 'wp:revision') return { data: buildRevision(scenario) };
    if (key.startsWith('wp:title:')) return { data: buildWikiTitle(scenario, p.titles) };
    if (key.startsWith('wp:log:')) return { data: buildLogs(scenario, p.letitle, p.letype, p) };
    if (key === 'local:userinfo') return { data: { query: { userinfo: { rights: ['read', 'edit'] } } } };
    throw new Error(`No mock for ${key}`);
  }

  async function handleAjax(url, params) {
    const endpoint = url === '/w/api.php' ? 'local' : 'wp';
    const call = { endpoint, params: { ...params } };
    onCall(call);
    return ajaxOutcome(call);
  }

  async function handleFetch(url) {
    const parsed = new URL(url);
    const params = Object.fromEntries([...parsed.searchParams.entries()]);
    const call = { endpoint: 'wikidata', params };
    onCall(call);
    const key = callKey(call);
    const attempt = nextAttempt(key);
    const injected = failureFor(key, attempt);
    if (injected) {
      if (injected.type === 'http') {
        return { ok: false, status: injected.status || 500, json: async () => ({}) };
      }
      if (injected.type === 'api') {
        return { ok: true, status: 200, json: async () => ({ error: { code: injected.code || 'test-error' } }) };
      }
    }
    return { ok: true, status: 200, json: async () => buildWikidata(scenario, params.ids) };
  }

  return { handleAjax, handleFetch };
}

function buildLocalPage(s) {
  if (s.local && s.local.missing) {
    return { query: { pageids: ['-1'], pages: { '-1': { title: s.pageName, ns: 0, missing: '' } } } };
  }
  const local = s.local || {};
  const page = {
    pageid: 10,
    ns: 0,
    title: s.pageName,
    revisions: [{ revid: 11, size: local.size || 100, '*': local.wikitext || '' }],
  };
  if (local.redirect) page.redirect = '';
  if (local.disambiguation) page.pageprops = { disambiguation: '' };
  return { query: { pageids: ['10'], pages: { '10': page } } };
}

// השאילתה הקלה: מצב הדף, גודלו וזמן יצירתו, בלי תוכן.
function buildLocalCurrent(s) {
  if (s.local && s.local.missing) return buildLocalPage(s);
  const local = s.local || {};
  const page = {
    pageid: 10,
    ns: 0,
    title: s.pageName,
    length: local.size || 100,
    revisions: [{ timestamp: local.creationTs || '2026-01-01T00:00:00Z' }],
  };
  if (local.redirect) page.redirect = '';
  if (local.disambiguation) page.pageprops = { disambiguation: '' };
  return { query: { pageids: ['10'], pages: { '10': page } } };
}

function buildLocalCreation(s) {
  return {
    query: {
      pageids: ['10'],
      pages: {
        '10': {
          pageid: 10,
          ns: 0,
          title: s.pageName,
          revisions: [{ timestamp: (s.local && s.local.creationTs) || '2026-01-01T00:00:00Z' }],
        },
      },
    },
  };
}

function buildLocalRedirect(s) {
  const r = (s.local && s.local.redirectTarget) || { title: 'יעד', fragment: null };
  const item = { from: s.pageName, to: r.title };
  if (r.fragment) item.tofragment = r.fragment;
  return { query: { redirects: [item] } };
}

function buildRevision(s) {
  const rev = s.revision || {};
  if (rev.deleted) return { query: { badrevids: { [String(rev.id || 101)]: { revid: rev.id || 101 } } } };
  const title = rev.title || s.pageName;
  const ns = rev.ns == null ? 0 : rev.ns;
  return {
    query: {
      pageids: ['20'],
      pages: { '20': { pageid: 20, ns, title } },
    },
  };
}

function buildWikidata(s, qid) {
  const wd = s.wikidata || {};
  if (wd.missing) return { entities: { [qid]: { missing: '' } } };
  if (wd.noSitelink) return { entities: { [qid]: { sitelinks: {} } } };
  return { entities: { [qid]: { sitelinks: { hewiki: { title: wd.title || s.pageName } } } } };
}

function buildWikiTitle(s, title) {
  const spec = (s.wikiTitles && s.wikiTitles[title]) || { status: 'found' };
  if (spec.status === 'missing') {
    return { query: { pageids: ['-1'], pages: { '-1': { ns: 0, title, missing: '' } } } };
  }
  const target = spec.target || title;
  const page = {
    pageid: spec.pageid || 30,
    ns: spec.ns == null ? 0 : spec.ns,
    title: target,
    revisions: [{ revid: spec.revid || 301, size: spec.size || 200 }],
  };
  if (spec.status === 'disambiguation') page.pageprops = { disambiguation: '' };
  const query = { pageids: [String(page.pageid)], pages: { [String(page.pageid)]: page } };
  if (spec.status === 'redirect') {
    query.redirects = [{ from: title, to: spec.target }];
    if (spec.fragment) query.redirects[0].tofragment = spec.fragment;
  }
  return { query };
}

// טווח הזמן של יומן, כמו בממשק מדיה־ויקי: בכיוון newer (מהישן לחדש)
// lestart הוא הגבול התחתון ו־leend העליון; בכיוון older (ברירת המחדל) להפך.
function logRange(events, p) {
  const newer = p && p.ledir === 'newer';
  const t = (x) => Date.parse(x);
  return events
    .filter((ev) => {
      if (p && p.lestart && (newer ? t(ev.timestamp) < t(p.lestart) : t(ev.timestamp) > t(p.lestart))) return false;
      if (p && p.leend && (newer ? t(ev.timestamp) > t(p.leend) : t(ev.timestamp) < t(p.leend))) return false;
      return true;
    })
    .sort((a, b) => (newer ? t(a.timestamp) - t(b.timestamp) : t(b.timestamp) - t(a.timestamp)));
}

function buildLogs(s, title, type, params) {
  const byTitle = (s.logs && s.logs[title]) || {};
  return { query: { logevents: logRange((byTitle[type] || []).map((x) => ({ ...x, type })), params) } };
}

function classifyStage(call) {
  const p = call.params || {};
  if (call.endpoint === 'wikidata') return 'wikidata';
  if (call.endpoint === 'local' && p.rvdir === 'newer' && p.prop === 'revisions') return 'bootstrap';
  if (call.endpoint === 'local' && p.prop === 'info|revisions|pageprops') return 'bootstrap';
  if (call.endpoint === 'local' && p.prop === 'info|pageprops|revisions') return 'bootstrap';
  if (call.endpoint === 'wp' && p.revids) return 'revision';
  if (call.endpoint === 'wp' && p.list === 'logevents') return 'log';
  if (call.endpoint === 'wp' && p.titles) return 'title';
  if (call.endpoint === 'local' && p.redirects === 1 && !p.prop) return 'local-state';
  if (call.endpoint === 'local' && p.meta === 'userinfo') return 'permissions';
  return 'other';
}

function normalizeCall(call) {
  return stableSortObject({ endpoint: call.endpoint, params: call.params });
}

function groupCalls(calls) {
  const groups = [];
  for (const call of calls) {
    const stage = classifyStage(call);
    let group = groups[groups.length - 1];
    if (!group || group.stage !== stage) {
      group = { stage, calls: [] };
      groups.push(group);
    }
    group.calls.push(normalizeCall(call));
  }
  for (const group of groups) {
    group.calls.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  return groups;
}

async function runScenario(sourcePath, scenario, timeoutMs = 1000) {
  let source = fs.readFileSync(sourcePath, 'utf8');
  source = injectHooks(source);
  const siblingCore = [
    'Gadget%20page%20tool.core.js',
    'Gadget page tool.core.js',
  ].map((name) => require('path').join(require('path').dirname(sourcePath), name))
    .find((candidate) => fs.existsSync(candidate));

  const calls = [];
  let recording = true;
  let terminalCount = 0;
  let terminalResolve;
  const terminalPromise = new Promise((resolve) => { terminalResolve = resolve; });

  const network = makeNetwork(scenario, (call) => {
    if (recording) calls.push(call);
  });

  const $ = createJQuery(network);
  const config = {
    wgCategories: [],
    wgNamespaceNumber: 0,
    wgPageName: scenario.pageName,
    wgAction: 'view',
    wgUserGroups: [],
    wgIsMainPage: false,
  };

  const capture = (kind, payload, meta) => {
    terminalCount++;
    if (terminalCount > 1) throw new Error(`More than one terminal point in ${scenario.id}`);
    recording = false;
    const envelope = {
      terminal: kind,
      delivery: (meta && meta.delivery) || null,
      localStateMatched: !!(meta && meta.localStateMatched),
      result: kind === 'success' ? normalizeResult(payload) : null,
      error: kind === 'success' ? null : normalizeError(payload),
      calls: groupCalls(calls),
    };
    terminalResolve(envelope);
    return Promise.resolve();
  };

  const context = {
    window: null,
    document: {
      getElementsByClassName() { return []; },
      getElementById() { return null; },
      createElement() { return { setAttribute() {}, addEventListener() {}, remove() {} }; },
      head: { appendChild() {} },
    },
    location: { href: `https://www.hamichlol.org.il/${encodeURIComponent(scenario.pageName)}` },
    mw: {
      loader: {
        using() { return Promise.resolve(); },
        getScript() {
          if (siblingCore && typeof context.HMK_PAGE_TOOL_CORE_FACTORY !== 'function') {
            const coreSource = fs.readFileSync(siblingCore, 'utf8');
            vm.runInContext(coreSource, context, { filename: siblingCore });
            return Promise.resolve();
          }
          return Promise.reject(new Error('UI asset loading is outside contract harness'));
        },
      },
      config: { get(name) { return config[name]; } },
      user: { options: { get(name) { return name === 'userjs-import-source' ? 'direct' : null; } } },
      util: {
        addCSS() {},
        getUrl(title) { return `/wiki/${encodeURIComponent(title)}`; },
      },
    },
    $,
    jQuery: $,
    fetch: (url) => network.handleFetch(url),
    AbortController: global.AbortController,
    URL,
    URLSearchParams,
    Promise,
    Set,
    Map,
    Date,
    Error,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Math,
    JSON,
    console: { log() {}, warn() {}, error() {} },
    queueMicrotask,
    setTimeout(fn, ms) {
      if (ms >= 15000) return { longTimer: true };
      queueMicrotask(fn);
      return { shortTimer: true };
    },
    clearTimeout() {},
    __contractHarnessCapture: capture,
  };
  context.window = context;

  vm.createContext(context);
  vm.runInContext(source, context, { filename: sourcePath });

  let timer;
  const timeout = new Promise((_, reject) => {
    timer = global.setTimeout(() => reject(new Error(`Scenario timed out: ${scenario.id}`)), timeoutMs);
  });
  try {
    return await Promise.race([terminalPromise, timeout]);
  } finally {
    global.clearTimeout(timer);
  }
}


function deriveMechalolTitle(pageName) {
  return String(pageName || '')
    .replace(/^רבי_/, '')
    .replace(/^הרב_/, '')
    .replace(/_/g, ' ')
    .replace(/ה"קדוש(ה|ים)?\"/g, 'הקדוש$1')
    .replace(/אישיות_מהתנ"ך/g, 'דמות מקראית')
    .replace(/א-ל/g, 'אל');
}

function coreStrings() {
  return {
    retrying(n, max) { return `retry ${n}/${max}`; },
    netNoConnection: 'offline',
    netTimeout: 'timeout',
    netServerBusy: 'server',
    netFilter: 'filter',
    netNotFound: 'notfound',
    netParse: 'parse',
    netStructure: 'structure',
    netHttpError(code) { return `http ${code}`; },
    netApiError(code) { return `api ${code}`; },
    netUnknown: 'unknown',
    logFloorUnchecked: 'log floor unchecked',
  };
}

async function runCoreScenario(corePath, scenario, timeoutMs = 1000) {
  const source = fs.readFileSync(corePath, 'utf8');
  const calls = [];
  let recording = true;
  const network = makeNetwork(scenario, (call) => {
    if (recording) calls.push(call);
  });
  const $ = createJQuery(network);

  const context = {
    window: null,
    $,
    jQuery: $,
    fetch: (url) => network.handleFetch(url),
    AbortController: global.AbortController,
    URL,
    URLSearchParams,
    Promise,
    Set,
    Map,
    Date,
    Error,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Math,
    JSON,
    console: { log() {}, warn() {}, error() {} },
    queueMicrotask,
    setTimeout(fn, ms) {
      if (ms >= 15000) return { longTimer: true };
      queueMicrotask(fn);
      return { shortTimer: true };
    },
    clearTimeout() {},
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: corePath });

  if (typeof context.HMK_PAGE_TOOL_CORE_FACTORY !== 'function') {
    throw new Error(`Core factory missing: ${corePath}`);
  }

  const core = context.HMK_PAGE_TOOL_CORE_FACTORY({
    STR: coreStrings(),
    MAX_CHAIN_DEPTH: 5,
    address: 'https://he.wikipedia.org/w/api.php',
    onRetry() {},
  });

  const run = core.run(deriveMechalolTitle(scenario.pageName), scenario.pageName, scenario.pageFields || null)
    .then((outcome) => {
      recording = false;
      const result = outcome.result;
      const hasWarning = !!(result && (
        result.revidDeletedNotice ||
        (result.sourceFailures && result.sourceFailures.length)
      ));
      const suppressed = !!outcome.localStateMatched && !hasWarning;
      return {
        terminal: 'success',
        delivery: suppressed ? 'suppressed' : 'render',
        localStateMatched: suppressed,
        result: normalizeResult(result),
        error: null,
        calls: groupCalls(calls),
      };
    })
    .catch((err) => {
      recording = false;
      return {
        terminal: err && err.silent ? 'silent' : 'failure',
        delivery: err && err.silent ? 'silent' : 'failure',
        localStateMatched: false,
        result: null,
        error: normalizeError(err),
        calls: groupCalls(calls),
      };
    });

  let timer;
  const timeout = new Promise((_, reject) => {
    timer = global.setTimeout(() => reject(new Error(`Scenario timed out: ${scenario.id}`)), timeoutMs);
  });
  try {
    return await Promise.race([run, timeout]);
  } finally {
    global.clearTimeout(timer);
  }
}

module.exports = { runScenario, runCoreScenario, stableSortObject, normalizeResult, normalizeError };
