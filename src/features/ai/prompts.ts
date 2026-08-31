import { carrierInfo, SOURCE_LABEL } from '../tracking/carriers';
import { countryName } from '../tracking/normalize';
import { stageMeta } from '../tracking/stages';
import type { TrackedPackage } from '../tracking/types';
import { daysBetween, formatDate } from '../../lib/format';

/**
 * Builds the grounding block every prompt shares.
 *
 * Only the newest 18 scans are included: older ones add tokens without changing
 * the interpretation, and the whole point of the cache is to keep calls cheap.
 */
export function packageContext(pkg: TrackedPackage, limit = 18) {
  const events = pkg.events.slice(0, limit);
  const lines = events.map((e) => {
    const days = daysBetween(e.at);
    const where = e.location ? ` | מקום: ${e.location} (${countryName(e.countryCode)})` : '';
    const who = e.carrier ? ` | שליח: ${carrierInfo(e.carrier).name}` : '';
    return `- ${formatDate(e.at)} (לפני ${days} ימים)${where}${who} | טקסט מקורי: "${e.rawText}" | שלב מזוהה: ${stageMeta(e.stage).label}`;
  });

  const silent = pkg.lastEventAt ? daysBetween(pkg.lastEventAt) : null;

  return [
    `מספר מעקב: ${pkg.trackingNumber}`,
    `זירת קנייה: ${SOURCE_LABEL[pkg.source]}`,
    `שליח נוכחי: ${carrierInfo(pkg.carrier).name}`,
    pkg.itemName ? `תוכן החבילה לפי המשתמש: ${pkg.itemName}` : null,
    `שלב נוכחי לפי המנוע הפנימי: ${stageMeta(pkg.stage).label}`,
    silent !== null ? `ימים מאז העדכון האחרון: ${silent}` : 'טרם התקבלו עדכונים',
    `משך טיפוסי בשלב הזה במסלול סין–ישראל: ${stageMeta(pkg.stage).typicalDays} ימים`,
    '',
    events.length > 0 ? 'רשומות המעקב, מהחדשה לישנה:' : 'אין רשומות מעקב כלל.',
    ...lines,
  ]
    .filter(Boolean)
    .join('\n');
}

export function explainPrompt(pkg: TrackedPackage) {
  return `
${packageContext(pkg)}

הסבר למשתמש מה קורה עם החבילה הזאת עכשיו.

- headline: משפט אחד קצר (עד 90 תווים) שאומר איפה החבילה ומה המצב. זה הטקסט
  הראשי שהמשתמש רואה בכרטיס, לכן הוא חייב להיות מובן בלי שום ידע לוגיסטי.
- meaning: שני משפטים שמסבירים מה הרשומה האחרונה אומרת בפועל ומה קורה בשלב הבא.
- nextStep: רק אם המשתמש חייב לעשות משהו בעצמו (לאסוף, לשלם מע"מ, לשלוח מסמך,
  לפתוח מחלוקת). אם אין מה לעשות — החזר מחרוזת ריקה.
`.trim();
}

export function etaPrompt(pkg: TrackedPackage) {
  return `
${packageContext(pkg)}

העריך מתי החבילה תגיע ליעד, על בסיס הקצב שנצפה ברשומות ובמסלול הזה.

- fromDays / toDays: מספר ימים מהיום ועד תחילת וסוף חלון ההגעה המשוער.
  fromDays חייב להיות קטן או שווה ל-toDays. אם החבילה כבר נמסרה החזר 0 ו-0.
- confidence: high רק אם החבילה כבר בישראל ובחלוקה. medium אם היא בישראל.
  low אם היא עוד בדרך בינלאומית או שאין עדכונים.
- reasoning: משפט אחד שמסביר על מה ההערכה מבוססת.
`.trim();
}

export function healthPrompt(pkg: TrackedPackage) {
  return `
${packageContext(pkg)}

קבע אם החבילה מתקדמת כרגיל או שיש בעיה.

- state: normal אם הקצב תקין לשלב הזה. slow אם איטי מהרגיל אבל עוד סביר.
  stuck אם השקט חריג ומצדיק פנייה. problem אם יש תקלה, כשל מסירה או החזרה.
- advice: משפט אחד או שניים. אם המצב normal — הרגע את המשתמש והסבר למה השקט
  הזה צפוי. אם לא — אמור בדיוק מה כדאי לעשות ומתי.

חשוב: שקט בשלב "בדרך לישראל" הוא נורמלי לחלוטין ויכול להימשך שבועיים ויותר.
אל תסמן stuck רק בגלל היעדר עדכונים בשלב הזה.
`.trim();
}

export function parsePrompt(text: string) {
  return `
המשתמש הדביק טקסט חופשי — מייל מהמוכר, הודעת SMS, או צילום מסך של דף הזמנה.
חלץ ממנו את כל החבילות שניתן לזהות.

לכל חבילה:
- trackingNumber: מספר המעקב באותיות גדולות, בלי רווחים ובלי מקפים.
- carrierGuess: שם השליח אם הוא מוזכר או ניתן להסקה מהפורמט, אחרת מחרוזת ריקה.
- source: אחד מהערכים aliexpress, shein, amazon, temu, ebay, other.
- itemName: שם המוצר בעברית, קצר (עד 40 תווים), אם הוא מופיע בטקסט. אחרת ריק.

אל תמציא מספרי מעקב. מספרי הזמנה, מספרי חשבונית, סכומים ותאריכים אינם מספרי
מעקב — אל תחזיר אותם. אם לא זיהית שום מספר מעקב, החזר מערך ריק.

הטקסט:
"""
${text.slice(0, 6000)}
"""
`.trim();
}

export function chatSystemPrompt(pkg: TrackedPackage) {
  return `
${packageContext(pkg, 30)}

המשתמש ישאל שאלות על החבילה הזאת. ענה רק על בסיס הרשומות שלמעלה ועל ידע כללי
על משלוחים בינלאומיים לישראל. אם התשובה לא נמצאת ברשומות, אמור זאת במקום לנחש.
ענה בקצרה — שני-שלושה משפטים לכל היותר, בלי כותרות ובלי רשימות.
`.trim();
}
