'use strict';

const path = require('path');

const SUITE_DIR = path.join(__dirname, '..');
const CONTRACT_DIR = path.join(SUITE_DIR, '..', 'contract');

function loadScenarios() {
  const all = [
    ...require('../scenarios/matrix').build(),
    ...require('../scenarios/interactions').build(),
    ...require('../scenarios/chain').build(),
    ...require('../scenarios/redirects').build(),
    ...require('../scenarios/wikiredirects').build(),
  ];
  const seen = new Set();
  for (const s of all) {
    if (!s.id) throw new Error('תרחיש בלי מזהה');
    if (seen.has(s.id)) throw new Error(`מזהה תרחיש כפול: ${s.id}`);
    seen.add(s.id);
  }
  return all;
}

module.exports = { SUITE_DIR, CONTRACT_DIR, loadScenarios };
