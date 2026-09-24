'use strict';

const { createEnv } = require('./env');
const { checkInvariants, helpers } = require('./checks');
const { PROFILES } = require('../fixtures/profiles');

// בניית מפרט הסביבה מתרחיש.
function envSpec(scn, ctx) {
  const profile = PROFILES[scn.profile || 'מפעיל'];
  if (!profile) throw new Error(`פרופיל לא מוכר: ${scn.profile}`);
  const net = Object.assign({}, scn.net || {});
  net.faults = Object.assign({}, profile.faults || {}, net.faults || {});

  const spec = {
    toolDir: ctx.toolDir,
    level: scn.level,
    rights: profile.rights,
    net,
    plans: scn.plans,
    confirms: scn.confirms,
    scriptFaults: scn.scriptFaults,
    styleFault: scn.styleFault,
    startSettle: scn.startSettle,
    userGroups: scn.userGroups,
    userName: scn.userName,
    articleId: scn.articleId,
    action: scn.action,
    reviewAck: scn.reviewAck,
  };

  if (scn.level === 'A') {
    spec.pageName = scn.pageName || 'מקומי';
    spec.fixture = scn.fixture;
    spec.localPages = scn.localPages;
  } else {
    const contractScenario = ctx.contract.scenarios.find((s) => s.id === scn.contractId);
    if (!contractScenario) throw new Error(`תרחיש חוזה לא קיים: ${scn.contractId}`);
    spec.pageName = contractScenario.pageName;
    spec.contractNet = ctx.contract.makeNetwork(contractScenario, () => {});
    spec.localPages = scn.localPages || {};
  }
  return spec;
}

function resolveLabel(env, label) {
  if (typeof label === 'string') return label;
  const runtime = env.cardRuntimes[env.cardRuntimes.length - 1];
  if (!runtime) return null;
  const value = runtime.STR[label.str];
  return typeof value === 'function' ? value.apply(null, label.args || []) : value;
}

function findControl(env, selector, text) {
  const matches = [...env.window.document.querySelectorAll(selector)].filter(
    (el) => el.textContent.trim() === text
  );
  return matches;
}

function mouse(env, el, type) {
  const w = env.window;
  el.dispatchEvent(new w.MouseEvent(type, { bubbles: true, relatedTarget: w.document.body }));
}

// ביצוע צעד. מחזיר false אם הצעד דולג (למשל פתיחת פרטים כשאין חץ).
async function perform(env, step, fail) {
  const w = env.window;
  const doc = w.document;
  const tag = `[${step.tag || step.do}]`;

  switch (step.do) {
    case 'open':
    case 'close': {
      const arrow = doc.querySelector('#hmk-tool .hmk-arrow');
      if (!arrow) {
        if (step.ifPresent) return false;
        fail(`${tag} אין חץ פרטים בכרטיס`);
        return true;
      }
      const isOpen = arrow.getAttribute('aria-expanded') === 'true';
      if (isOpen === (step.do === 'open')) fail(`${tag} הפרטים כבר ${isOpen ? 'פתוחים' : 'סגורים'}`);
      arrow.click();
      break;
    }
    case 'click': {
      const text = resolveLabel(env, step.label);
      const matches = findControl(env, step.selector || '#hmk-tool .hmk-actions > *', text);
      if (!matches.length) {
        fail(`${tag} לא נמצא פקד בשם "${text}"`);
        return true;
      }
      if (matches.length > 1) fail(`${tag} נמצאו ${matches.length} פקדים בשם "${text}"`);
      if (matches[0].disabled) fail(`${tag} הפקד "${text}" מושבת`);
      if (matches[0].tagName === 'A') {
        fail(`${tag} "${text}" הוא קישור ולא כפתור; קישורים נבדקים לפי הכתובת בלבד`);
        return true;
      }
      matches[0].click();
      break;
    }
    case 'toggle': {
      const text = resolveLabel(env, step.label);
      const matches = findControl(env, '#hmk-tool .hmk-seg-btn', text);
      if (!matches.length) {
        fail(`${tag} אין בורר הפניה עם "${text}"`);
        return true;
      }
      matches[0].click();
      break;
    }
    case 'hover':
    case 'leave': {
      const el = doc.querySelector(step.selector || '#hmk-tool .hmk-target a');
      if (!el) {
        fail(`${tag} אין אלמנט לריחוף: ${step.selector || 'קישור היעד'}`);
        return true;
      }
      mouse(env, el, step.do === 'hover' ? 'mouseover' : 'mouseout');
      break;
    }
    case 'key': {
      const el = doc.querySelector(step.selector || '#hmk-tool .hmk-target a');
      el.dispatchEvent(new w.KeyboardEvent('keydown', { key: step.key, bubbles: true }));
      break;
    }
    case 'backlinks': {
      const toggle = doc.querySelector('#hmk-tool .hmk-backlinks-toggle');
      if (!toggle) {
        fail(`${tag} אין כפתור הצגת מקשרים`);
        return true;
      }
      toggle.click();
      break;
    }
    case 'expand': {
      const row = [...doc.querySelectorAll('#hmk-tool .hmk-backlink-row')].find((r) => {
        const a = r.querySelector('a');
        return a && a.textContent.trim() === step.title;
      });
      const button = row && row.querySelector('.hmk-backlink-expand');
      if (!button) {
        fail(`${tag} אין כפתור הרחבה למקשר "${step.title}"`);
        return true;
      }
      button.click();
      break;
    }
    // לחיצה על האלמנט הראשון שתואם לבורר (תיבת סימון, תא תוכן וכדומה).
    case 'press': {
      const el = doc.querySelector(step.selector);
      if (!el) {
        fail(`${tag} אין אלמנט: ${step.selector}`);
        return true;
      }
      if (el.disabled) fail(`${tag} האלמנט מושבת: ${step.selector}`);
      el.click();
      break;
    }
    // הקלדה בתיבת טקסט: החלפת הערך ואירוע קלט.
    case 'type': {
      const el = doc.querySelector(step.selector);
      if (!el) {
        fail(`${tag} אין תיבה: ${step.selector}`);
        return true;
      }
      el.value = step.value;
      el.dispatchEvent(new w.Event('input', { bubbles: true }));
      break;
    }
    case 'blur': {
      const el = doc.querySelector(step.selector);
      if (!el) {
        fail(`${tag} אין אלמנט: ${step.selector}`);
        return true;
      }
      el.dispatchEvent(new w.Event('blur'));
      break;
    }
    case 'settle':
      break;
    case 'advance':
      await env.advance(step.ms);
      return true;
    default:
      throw new Error(`צעד לא מוכר: ${step.do}`);
  }
  await env.settle(step.settle);
  return true;
}

function compactFrame(frame) {
  const out = { step: frame.step, dom: frame.dom };
  for (const key of ['reads', 'writes', 'scripts', 'styles', 'imports', 'confirms', 'notifies', 'console', 'uncaught', 'routeErrors']) {
    if (frame[key] && frame[key].length) out[key] = frame[key];
  }
  return out;
}

async function runScenario(scn, ctx) {
  const failures = [];
  const fail = (msg) => failures.push(msg);
  const frames = [];
  let env = null;

  function capture(step, label) {
    const frame = env.frame(label);
    checkInvariants(env, frame, step, fail);
    if (typeof step.check === 'function') {
      try {
        step.check(helpers(env, frame, fail));
      } catch (err) {
        fail(`[${label}] חריגה בבדיקת הכוונה: ${err && err.stack ? err.stack : err}`);
      }
    }
    frames.push(compactFrame(frame));
  }

  try {
    env = await createEnv(envSpec(scn, ctx));
    await env.start();
    const startStep = Object.assign({ do: 'start' }, scn.start || {});
    capture(startStep, 'start');
    for (const [i, step] of (scn.steps || []).entries()) {
      const label = `${i + 1}:${step.name || step.do}`;
      const ran = await perform(env, Object.assign({}, step, { tag: label }), fail);
      if (!ran) continue;
      capture(step, label);
    }
    if (typeof scn.after === 'function') {
      try {
        scn.after({ env, fail, frames });
      } catch (err) {
        fail(`חריגה בבדיקת הסיום: ${err && err.stack ? err.stack : err}`);
      }
    }
    if (scn.recordWiki) frames.push({ step: 'מצב-הוויקי', wiki: env.wiki.summary() });
  } catch (err) {
    fail(`חריגה בהרצת התרחיש: ${err && err.stack ? err.stack : err}`);
  } finally {
    if (env) await env.close();
  }
  return { frames, failures, env };
}

module.exports = { runScenario, envSpec };
