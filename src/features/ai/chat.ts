import { getAI, getGenerativeModel, GoogleAIBackend, ThinkingLevel, type ChatSession } from 'firebase/ai';
import { getFirebaseApp } from '../../lib/firebase';
import { GEMINI_MODEL, isAiAvailable } from './gemini';
import { chatSystemPrompt } from './prompts';
import type { TrackedPackage } from '../tracking/types';

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

/**
 * Grounded chat about one package.
 *
 * The package's own event log goes into the system instruction, so answers are
 * tied to that parcel rather than to general shipping trivia. History is kept in
 * the session, which means follow-ups like "and if it doesn't?" work.
 */
export function startPackageChat(pkg: TrackedPackage, history: ChatMessage[] = []): ChatSession {
  const ai = getAI(getFirebaseApp(), { backend: new GoogleAIBackend() });
  const chatModel = getGenerativeModel(ai, {
    model: GEMINI_MODEL,
    systemInstruction: chatSystemPrompt(pkg),
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 500,
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
    },
  });

  return chatModel.startChat({
    history: history.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
  });
}

/** Streams a reply token-by-token so the answer starts appearing immediately. */
export async function* streamReply(session: ChatSession, message: string): AsyncGenerator<string> {
  if (!isAiAvailable()) {
    yield 'אין חיבור לאינטרנט, ולכן אי אפשר לשאול שאלות כרגע. שאר הפרטים על החבילה זמינים גם ללא חיבור.';
    return;
  }

  try {
    const result = await session.sendMessageStream(message);
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) yield text;
    }
  } catch (err) {
    console.warn('[trackit] chat stream failed', err);
    yield 'משהו לא עבד בצד שלנו. נסה לשאול שוב בעוד רגע.';
  }
}

/** Openers that match the questions people actually have about a stuck parcel. */
export function suggestedQuestions(pkg: TrackedPackage): string[] {
  const base = ['למה זה לוקח כל כך הרבה זמן?', 'מתי זה יגיע בפועל?'];

  switch (pkg.stage) {
    case 'CUSTOMS':
      return ['למה החבילה נתקעה במכס?', 'אני צריך לשלם משהו?', 'כמה זמן זה בדרך כלל לוקח?'];
    case 'AWAITING_PICKUP':
      return ['עד מתי אני חייב לאסוף?', 'מה קורה אם לא אאסוף בזמן?', 'מה צריך להביא לאיסוף?'];
    case 'INTERNATIONAL':
      return ['למה אין עדכונים כבר שבועיים?', 'זה נורמלי או שהחבילה אבודה?', 'מתי זה יגיע?'];
    case 'EXCEPTION':
      return ['מה בדיוק קרה?', 'איך אני מקבל את החבילה בכל זאת?', 'כדאי לפתוח מחלוקת?'];
    case 'RETURNED':
      return ['איך אני מקבל את הכסף בחזרה?', 'למה החבילה הוחזרה?'];
    case 'DELIVERED':
      return ['איפה בדיוק החבילה נמסרה?', 'מה עושים אם לא קיבלתי אותה בפועל?'];
    case 'UNKNOWN':
      return ['למה אין שום מידע?', 'תוך כמה זמן אמור להופיע עדכון ראשון?'];
    default:
      return base;
  }
}
