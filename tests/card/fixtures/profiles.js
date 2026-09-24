'use strict';

// פרופילי משתמש. כל פרופיל הוא רשימת ההרשאות ששאילתת userinfo מחזירה,
// ולצדו כשל אפשרי בטעינת ההרשאות.
//
// expectedCapabilities היא ניסוח עצמאי של כלל המיפוי מהרשאות ליכולות,
// כפי שהוא מתועד. היא אינה מועתקת מהקוד; אם הכלל בקוד ישתנה, הבדיקה
// תיכשל עד שהמפרט כאן יעודכן במפורש.

const PROFILES = {
  'עורך': { rights: ['read', 'edit'] },
  'מעביר': { rights: ['read', 'edit', 'move'] },
  'מעביר-מלא': { rights: ['read', 'edit', 'move', 'suppressredirect'] },
  'מפעיל': { rights: ['read', 'edit', 'move', 'suppressredirect', 'delete'] },
  'כשל-הרשאות': {
    rights: ['read', 'edit', 'move', 'suppressredirect', 'delete'],
    faults: { userinfo: { type: 'api', code: 'rights-test-failure' } },
  },
  // פרופילים משניים לתרחישים ממוקדים
  // יכול למחוק הפניות אך לא ערכים, ולהעביר בלי הפניה
  'מוחק-הפניות': { rights: ['read', 'edit', 'move', 'suppressredirect', 'delete-redirect'] },
  'רשימה-ריקה': { rights: [] },
  // יצירת דפים: ייבוא הפניות מוויקיפדיה
  'יוצר': { rights: ['read', 'edit', 'createpage'] },
};

// הפרופילים שמשתתפים במטריצה המלאה
const MATRIX_PROFILES = ['עורך', 'מעביר', 'מעביר-מלא', 'מפעיל', 'כשל-הרשאות'];

const NONE = Object.freeze({
  moveWithRedirect: false,
  moveWithoutRedirect: false,
  deletePage: false,
  deleteRedirect: false,
  createRedirect: false,
});

// כלל המיפוי (עריכה ובקשה ממפעילים פתוחות לכל משתמש רשום, ולכן אינן יכולת):
// - העברה עם הפניה: move.
// - העברה בלי הפניה: move וגם suppressredirect.
// - מחיקת דף: delete. מחיקת הפניה: delete או delete-redirect.
// - ייבוא הפניה מוויקיפדיה: createpage.
// - רשימת הרשאות ריקה נחשבת כשל טעינה (כל משתמש מקבל read).
function capabilitiesFromRights(rights) {
  if (!Array.isArray(rights) || !rights.length) return { failed: true, caps: { ...NONE } };
  const has = (r) => rights.indexOf(r) !== -1;
  return {
    failed: false,
    caps: {
      moveWithRedirect: has('move'),
      moveWithoutRedirect: has('move') && has('suppressredirect'),
      deletePage: has('delete'),
      deleteRedirect: has('delete') || has('delete-redirect'),
      createRedirect: has('createpage'),
    },
  };
}

function expectedCapabilities(profileName) {
  const profile = PROFILES[profileName];
  if (!profile) throw new Error(`פרופיל לא מוכר: ${profileName}`);
  if (profile.faults && profile.faults.userinfo) return { failed: true, caps: { ...NONE } };
  return capabilitiesFromRights(profile.rights);
}

module.exports = { PROFILES, MATRIX_PROFILES, NONE, capabilitiesFromRights, expectedCapabilities };
