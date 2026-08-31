import { getAI, getGenerativeModel, GoogleAIBackend, Schema, ThinkingLevel, type GenerativeModel } from 'firebase/ai';
import { getFirebaseApp, isFirebaseConfigured } from '../../lib/firebase';

/**
 * Firebase AI Logic wiring.
 *
 * Uses the Gemini Developer API backend, which has a no-cost tier and does not
 * require the Blaze plan. The model is reached through Firebase rather than a
 * raw Gemini key so App Check can attest requests — from 2026-11-02 that
 * enforcement is mandatory for Firebase AI Logic.
 */

const MODEL = import.meta.env.VITE_GEMINI_MODEL ?? 'gemini-3.6-flash';

const SYSTEM_INSTRUCTION = `
אתה המנוע ההסברתי של TrackIt AI, אפליקציית מעקב חבילות לקהל ישראלי.

תפקידך: לקחת רשומות מעקב גולמיות של שליחים — לרוב באנגלית או בסינית, בשפה
לוגיסטית מקצועית — ולהסביר אותן בעברית פשוטה למי שרק רוצה לדעת איפה החבילה,
אם משהו נתקע, ומתי היא תגיע.

כללים מחייבים:
- כתוב עברית בלבד, בגוף שני, בטון ענייני ורגוע. בלי אימוג'ים.
- אל תמציא עובדות. אם המידע לא מופיע ברשומות, אמור שאין מידע.
- אל תבטיח תאריך מסירה מדויק. תמיד דבר בטווח או בהערכה.
- הימנע ממונחים לוגיסטיים באנגלית. אם אתה חייב להזכיר שם שליח, כתוב אותו כמו שהוא.
- קצר. משפט אחד או שניים לכל שדה, אלא אם נאמר אחרת.
- הקשר ישראלי: מעל 75 דולר יש מע"מ, מעל 500 דולר יש גם מכס. חבילה שממתינה
  לאיסוף בסניף דואר מוחזרת לשולח אחרי כ-14 יום.
`.trim();

let cachedModel: GenerativeModel | null = null;
let cachedModelKey = '';

/** True when a Gemini call can even be attempted. */
export function isAiAvailable() {
  return isFirebaseConfigured && navigator.onLine;
}

interface ModelOptions {
  responseSchema?: object;
  temperature?: number;
  json?: boolean;
}

function model(opts: ModelOptions = {}): GenerativeModel {
  const key = JSON.stringify(opts);
  if (cachedModel && cachedModelKey === key) return cachedModel;

  const ai = getAI(getFirebaseApp(), { backend: new GoogleAIBackend() });
  cachedModel = getGenerativeModel(ai, {
    model: MODEL,
    systemInstruction: SYSTEM_INSTRUCTION,
    generationConfig: {
      temperature: opts.temperature ?? 0.25,
      maxOutputTokens: 900,
      // Gemini 3 thinks by default; that burns the output budget on internal
      // reasoning and the structured JSON never arrives. MINIMAL is the 3.x
      // knob (thinkingBudget: 0 is for 2.5 and 400s this model).
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      ...(opts.json
        ? {
            responseMimeType: 'application/json',
            ...(opts.responseSchema ? { responseSchema: opts.responseSchema as never } : {}),
          }
        : {}),
    },
  });
  cachedModelKey = key;
  return cachedModel;
}

export { MODEL as GEMINI_MODEL, Schema, model as geminiModel };

/** Runs a structured-output prompt and parses the JSON, or returns null on any failure. */
export async function generateJson<T>(prompt: string, responseSchema: object, temperature = 0.25): Promise<T | null> {
  if (!isAiAvailable()) return null;
  try {
    const result = await Promise.race([
      model({ json: true, responseSchema, temperature }).generateContent(prompt),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('gemini-timeout')), 35_000);
      }),
    ]);
    const text = result.response.text().trim();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch (err) {
    // AI is strictly an enhancement here: every caller has a deterministic
    // fallback, so a failed call must never surface as an error to the user.
    console.warn('[trackit] gemini call failed, falling back to deterministic output', err);
    return null;
  }
}
