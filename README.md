# Page tool (המכלול)

גאדג'ט MediaWiki למכלול: השוואת ערך מול המקור בוויקיפדיה, כרטיסי פעולה (העברה, מחיקה, הפיכה להפניה), "מאז הייבוא", חלון תיקון קישורים והפניות מוויקיפדיה.

**נקודת הפתיחה: [`START_HERE.md`](START_HERE.md)**, עם המצב הנוכחי, סדר ההדבקה לאתר וכללי העבודה.

## קבצי הייצור
שמות הקבצים תואמים לשמות הדפים באתר (`MediaWiki:Gadget-Page tool.js` וכו'), ולכן הם נשמרו כמות שהם, כולל `%20`.

| קובץ | תפקיד |
|---|---|
| `Gadget%20page%20tool.js` | הקובץ הראשי: השער, הטוען והכרטיס הבסיסי |
| `Gadget%20page%20tool.core.js` | מנוע ההכרעה |
| `Gadget%20page%20tool.card.js` | מנוע הכרטיסים והפעולות |
| `Gadget%20page%20tool.details.js` | פאנל הפרטים ועץ המקשרים (טעינה עצלה) |
| `Gadget%20page%20tool.preview.js` | תצוגה מקדימה בריחוף (טעינה עצלה) |
| `Gadget%20page%20tool.messages.js` | המלל |
| `Gadget%20page%20tool.css` | העיצוב |
| `Gadget%20page%20tool.update.js` | "מאז הייבוא" |
| `Gadget%20page%20tool.links.js` | חלון תיקון הקישורים (טעינה עצלה, לקבוצת `bot`) |
| `Gadget%20page%20tool.redirects.js` | הפניות מוויקיפדיה ודף שאינו קיים (טעינה עצלה) |
| `הפניות.js` | הסקריפט הישן, מקוצר |

## הרצת הבדיקות
נדרש Node.js 18 ומעלה.

```bash
npm ci --prefix card-tests      # גם update-tests משתמש בתלויות האלה
npm ci --prefix links-tests

node contract-tests/run.js      # מנוע ההכרעה
node update-tests/run.js        # "מאז הייבוא"
node links-tests/run.js         # חלון תיקון הקישורים
node card-tests/run.js          # כרטיסים ופעולות, מול תמונות הייחוס
```

`update-tests/browser_integration.py` היא בדיקת דפדפן אמיתי (Playwright) ואינה רצה ב-CI.

## CI
`.github/workflows/tests.yml` מריץ בכל push את בדיקת ה-checksums ואת `contract`, `update` ו-`links`. גם `card-tests` רץ, אבל כרגע לא חוסם: תמונות הייחוס לא עודכנו בכוונה עד הבדיקה החיה.
