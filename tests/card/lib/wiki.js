'use strict';

// הדמיית ויקי קטנה בזיכרון. מקור האמת לדפים המקומיים בכל תרחיש:
// קריאות (נתוני דף, תצוגה מקדימה, עיבוד) נענות ממנה, ופעולות כתיבה
// (העברה, מחיקה, עריכה) משנות אותה. כך קריאה שמגיעה אחרי פעולה רואה
// את תוצאת הפעולה, כמו באתר.

const TALK_PREFIX = 'שיחה:';

function norm(title) {
  return String(title || '').replace(/_/g, ' ').trim();
}

// ויקיטקסט של {{מיון ויקיפדיה}} באותה צורה שבה סוויטת החוזה בונה אותו.
function sortTemplate(fields) {
  const parts = ['{{מיון ויקיפדיה'];
  for (const [k, v] of Object.entries(fields || {})) {
    if (v !== null && v !== undefined) parts.push(`|${k}=${v}`);
  }
  parts.push('}}');
  return parts.join('');
}

function redirectText(target, fragment) {
  return `#הפניה[[${target}${fragment ? '#' + fragment : ''}]]`;
}

function parseRedirect(content) {
  const m = /^\s*#(?:הפניה|REDIRECT)\s*\[\[([^\]|#]+)(?:#([^\]|]*))?/i.exec(content || '');
  return m ? { to: norm(m[1]), fragment: m[2] ? m[2].trim() : null } : null;
}

class Wiki {
  constructor(pages) {
    this.pages = new Map();
    this.nextId = 100;
    this.nextRev = 1000;
    for (const [title, spec] of Object.entries(pages || {})) this.put(title, spec);
  }

  // spec: { content } או { fields, body } או { redirectTo, fragment },
  // ובנוסף disambiguation ו-previewHtml לפי הצורך.
  put(title, spec) {
    const t = norm(title);
    spec = spec || {};
    let content = spec.content;
    if (content === undefined) {
      if (spec.redirectTo) content = redirectText(spec.redirectTo, spec.fragment);
      else content = (spec.fields ? sortTemplate(spec.fields) + '\n' : '') + (spec.body || `תוכן הערך ${t}.`);
    }
    const existing = this.pages.get(t);
    this.pages.set(t, {
      title: t,
      id: existing ? existing.id : this.nextId++,
      rev: this.nextRev++,
      content,
      disambiguation: !!spec.disambiguation,
      previewHtml: spec.previewHtml || null,
    });
  }

  get(title) {
    return this.pages.get(norm(title)) || null;
  }

  redirectOf(title) {
    const page = this.get(title);
    return page ? parseRedirect(page.content) : null;
  }

  // ---- תשובות קריאה במבנה של ממשק מדיה־ויקי ----

  pageQuery(title) {
    const t = norm(title);
    const page = this.get(t);
    if (!page) {
      return { query: { pageids: ['-1'], pages: { '-1': { ns: 0, title: t, missing: '' } } } };
    }
    const out = {
      pageid: page.id,
      ns: 0,
      title: page.title,
      revisions: [{ revid: page.rev, size: Buffer.byteLength(page.content, 'utf8'), '*': page.content }],
    };
    if (parseRedirect(page.content)) out.redirect = '';
    if (page.disambiguation) out.pageprops = { disambiguation: '' };
    return { query: { pageids: [String(page.id)], pages: { [String(page.id)]: out } } };
  }

  // שאילתת info עם redirects=1: השרת עוקב אחרי כל שרשרת ההפניות ומחזיר את
  // כל הקפיצות ואת הדף הסופי. בלולאה הדף הסופי עדיין מסומן כהפניה.
  chainQuery(title) {
    let t = norm(title);
    const redirects = [];
    const seen = new Set([t]);
    for (let i = 0; i < 10; i++) {
      const r = this.redirectOf(t);
      if (!r) break;
      const hop = { from: t, to: r.to };
      if (r.fragment) hop.tofragment = r.fragment;
      redirects.push(hop);
      const loop = seen.has(r.to);
      seen.add(r.to);
      t = r.to;
      if (loop) break;
    }
    const page = this.get(t);
    const query = {};
    if (redirects.length) query.redirects = redirects;
    if (!page) {
      query.pageids = ['-1'];
      query.pages = { '-1': { ns: 0, title: t, missing: '' } };
    } else {
      const out = { pageid: page.id, ns: 0, title: page.title };
      if (parseRedirect(page.content)) out.redirect = '';
      query.pageids = [String(page.id)];
      query.pages = { [String(page.id)]: out };
    }
    return { query };
  }

  // שאילתת info|pageprops עם redirects=1, כפי שמודול התצוגה המקדימה שולח.
  previewQuery(title) {
    const t = norm(title);
    const redirect = this.redirectOf(t);
    const finalTitle = redirect ? redirect.to : t;
    const page = this.get(finalTitle);
    const query = {};
    if (redirect) {
      const r = { from: t, to: redirect.to };
      if (redirect.fragment) r.tofragment = redirect.fragment;
      query.redirects = [r];
    }
    if (!page) {
      query.pageids = ['-1'];
      query.pages = { '-1': { ns: 0, title: finalTitle, missing: '' } };
    } else {
      const out = { pageid: page.id, ns: 0, title: page.title };
      if (page.disambiguation) out.pageprops = { disambiguation: '' };
      query.pageids = [String(page.id)];
      query.pages = { [String(page.id)]: out };
    }
    return { query };
  }

  parsePage(title) {
    const page = this.get(title);
    if (!page) return { error: { code: 'missingtitle' } };
    const html =
      page.previewHtml ||
      `<div class="mw-parser-output"><table class="infobox"><tr><td>תבנית</td></tr></table>` +
        `<p>${page.title} הוא ערך לדוגמה בסוויטת הבדיקות.</p></div>`;
    return { parse: { title: page.title, pageid: page.id, text: { '*': html } } };
  }

  // ---- פעולות כתיבה ----

  move(from, to, noredirect, movetalk) {
    const f = norm(from);
    const t = norm(to);
    const page = this.get(f);
    if (!page) return { error: 'missingtitle' };
    if (f === t) return { error: 'selfmove' };
    // יעד קיים חוסם, למעט הפניה שמצביעה חזרה לדף המקור ונדרסת בהעברה.
    // קוד שגיאה אחר (למשל redirectexists) נקבע במפורש בתוכנית התרחיש.
    const target = this.get(t);
    const targetRedirect = target ? parseRedirect(target.content) : null;
    const overRedirect = !!(targetRedirect && targetRedirect.to === f);
    if (target && !overRedirect) return { error: 'articleexists' };
    this.pages.delete(f);
    this.pages.set(t, { ...page, title: t, rev: this.nextRev++ });
    if (!noredirect) this.put(f, { content: redirectText(t) });
    // פורמט ברירת המחדל של הממשק באתר: שדה ריק מופיע רק כשהוא נכון.
    const data = { from: f, to: t };
    if (!noredirect) data.redirectcreated = '';
    if (overRedirect) data.moveoverredirect = '';
    if (movetalk && this.get(TALK_PREFIX + f)) {
      const talk = this.move(TALK_PREFIX + f, TALK_PREFIX + t, noredirect, false);
      if (!talk.error) {
        data.talkfrom = TALK_PREFIX + f;
        data.talkto = TALK_PREFIX + t;
      }
    }
    return { data };
  }

  remove(title) {
    const t = norm(title);
    if (!this.get(t)) return { error: 'missingtitle' };
    this.pages.delete(t);
    return { data: { title: t, reason: '', logid: 1 } };
  }

  edit(title, text) {
    const t = norm(title);
    const existed = !!this.get(t);
    this.put(t, { content: text });
    return { data: { result: 'Success', title: t, new: existed ? undefined : '' } };
  }

  // פסקה חדשה בסוף הדף (יוצרת את הדף אם אינו קיים).
  addSection(title, heading, text) {
    const t = norm(title);
    const page = this.get(t);
    const block = `== ${heading} ==\n${text}`;
    this.put(t, { content: page ? `${page.content}\n\n${block}` : block });
    return { data: { result: 'Success', title: t } };
  }

  // מצב סופי קצר של הדפים, לתיעוד בתמונת הייחוס אחרי פעולה.
  summary() {
    const out = {};
    for (const page of [...this.pages.values()].sort((a, b) => a.title.localeCompare(b.title))) {
      const r = parseRedirect(page.content);
      out[page.title] = r ? `הפניה ← ${r.to}${r.fragment ? '#' + r.fragment : ''}` : page.content;
    }
    return out;
  }
}

module.exports = { Wiki, sortTemplate, redirectText, parseRedirect, norm };
