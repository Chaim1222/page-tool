'use strict';

// נרמול מבנה הדף לשורות טקסט קריאות. כל שורה היא אלמנט אחד: תגית,
// מחלקות, תכונות רלוונטיות ומצב (מוסתר/מושבת), ואחריה הטקסט שלו.
// הצורה הזו מאפשרת לראות בהשוואה בדיוק איזה אלמנט השתנה.

const ATTRS = [
  'href',
  'dir',
  'role',
  'title',
  'aria-label',
  'aria-expanded',
  'aria-describedby',
  'target',
];

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch (e) {
    return value;
  }
}

function textOf(node) {
  return node.data.replace(/\s+/g, ' ');
}

function meaningfulChildren(node) {
  return [...node.childNodes].filter(
    (n) => n.nodeType === 1 || (n.nodeType === 3 && textOf(n).trim() !== '')
  );
}

function head(el) {
  const tag = el.tagName.toLowerCase();
  let out = tag;
  if (el.id) out += '#' + el.id;
  const cls = (el.getAttribute('class') || '').trim();
  if (cls) out += cls.split(/\s+/).map((c) => '.' + c).join('');
  const parts = [];
  for (const name of ATTRS) {
    if (!el.hasAttribute(name)) continue;
    let value = el.getAttribute(name);
    if (name === 'href') value = safeDecode(value);
    parts.push(`${name}=${value}`);
  }
  if (el.disabled) parts.push('disabled');
  if (el.style && el.style.display === 'none') parts.push('hidden');
  if (parts.length) out += ' [' + parts.join(' ') + ']';
  return out;
}

function serializeNode(node, depth, out) {
  const pad = '  '.repeat(depth);
  if (node.nodeType === 3) {
    out.push(pad + JSON.stringify(textOf(node)));
    return;
  }
  if (node.nodeType !== 1) return;
  const tag = node.tagName.toLowerCase();
  if (tag === 'svg' || tag === 'style' || tag === 'script') {
    out.push(pad + head(node));
    return;
  }
  const kids = meaningfulChildren(node);
  if (kids.length === 1 && kids[0].nodeType === 3) {
    out.push(pad + head(node) + ' ' + JSON.stringify(textOf(kids[0])));
    return;
  }
  out.push(pad + head(node));
  for (const kid of kids) serializeNode(kid, depth + 1, out);
}

function lines(el) {
  if (!el) return null;
  const out = [];
  serializeNode(el, 0, out);
  return out;
}

// האזורים שהכלי נוגע בהם: המכל בראש הדף, מחוון הגודל, קישור השפה
// ובועת התצוגה המקדימה. אזור ריק אינו נכלל.
function serializeRegions(w) {
  const doc = w.document;
  const regions = {};
  const tool = doc.getElementById('hmk-tool');
  if (tool) regions.tool = lines(tool);
  const indicators = doc.querySelector('.mw-indicators');
  if (indicators && indicators.childNodes.length) {
    regions.indicators = [...indicators.childNodes].flatMap((n) => lines(n) || []);
  }
  const lang = doc.querySelector('#p-lang .hmk-en-link');
  if (lang) regions.lang = lines(lang);
  const bubble = doc.getElementById('hmk-link-preview');
  if (bubble) regions.preview = lines(bubble);
  const redirectsPanel = doc.getElementById('hmk-redirects-panel');
  if (redirectsPanel) regions.redirectsPanel = lines(redirectsPanel);
  return regions;
}

module.exports = { serializeRegions, lines };
