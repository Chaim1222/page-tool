'use strict';
// בדיקה קבועה: מפתח כפול בקובץ המלל דורס בשקט את ההגדרה הקודמת שלו,
// כי בליטרל של אובייקט ההגדרה המאוחרת גוברת. כך קרה בסבב תיקון הקישורים.
const fs = require('fs');
const path = require('path');

function duplicateMessageKeys(toolDir) {
  const src = fs.readFileSync(path.join(toolDir, 'site/messages.js'), 'utf8');
  const seen = new Map();
  const dups = [];
  for (const m of src.matchAll(/^ {2}([A-Za-z0-9_]+):/gm)) {
    if (seen.has(m[1])) dups.push(m[1]);
    else seen.set(m[1], true);
  }
  return dups;
}

module.exports = { duplicateMessageKeys };
