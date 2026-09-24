'use strict';

// שעון מדומה. מחליף את setTimeout/clearTimeout של חלון הבדיקה, כך שכל
// המתנה בקוד (ניסיון חוזר ברשת, השהיית הריחוף, תשובות אסינכרוניות של
// הדמיית השרת, והתורים הפנימיים של ג'יי-קוורי) רצה לפי זמן מדומה ולא
// לפי זמן אמיתי. כך כל הרצה דטרמיניסטית ואינה ממתינה בפועל.

function createClock(onError) {
  let now = 0;
  let seq = 0;
  const timers = new Map();

  function setTimeout(fn, ms, ...args) {
    const id = ++seq;
    const delay = Math.max(0, Number(ms) || 0);
    timers.set(id, { id, due: now + delay, delay, fn, args });
    return id;
  }

  function clearTimeout(id) {
    timers.delete(id);
  }

  function nextTimer() {
    let best = null;
    for (const t of timers.values()) {
      if (!best || t.due < best.due || (t.due === best.due && t.id < best.id)) best = t;
    }
    return best;
  }

  // מריץ את כל הטיימרים שזמנם הגיע, לפי סדר. חריגה בתוך טיימר נחשבת
  // שגיאה שלא נתפסה, כמו בדפדפן, ונרשמת ולא עוצרת את הריצה.
  function runDue() {
    let ran = 0;
    for (;;) {
      const t = nextTimer();
      if (!t || t.due > now) break;
      timers.delete(t.id);
      ran++;
      try {
        if (typeof t.fn === 'function') t.fn.apply(null, t.args);
      } catch (err) {
        onError(err);
      }
    }
    return ran;
  }

  function advanceTo(time) {
    if (time > now) now = time;
  }

  return {
    setTimeout,
    clearTimeout,
    nextTimer,
    runDue,
    advanceTo,
    now: () => now,
    pending: () => timers.size,
  };
}

module.exports = { createClock };
