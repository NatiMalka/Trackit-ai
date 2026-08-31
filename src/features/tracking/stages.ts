/**
 * The canonical stage ladder.
 *
 * Every carrier invents its own vocabulary. Rather than surface that, we collapse
 * all of it into these nine ordered rungs plus three off-ladder states. The whole
 * UI reads from `Stage` and never from raw carrier text, which is what makes the
 * app understandable regardless of which courier is involved.
 */
export const STAGE_LADDER = [
  'CREATED',
  'PICKED_UP',
  'ORIGIN_TRANSIT',
  'INTERNATIONAL',
  'ARRIVED_IL',
  'CUSTOMS',
  'LOCAL_DELIVERY',
  'AWAITING_PICKUP',
  'DELIVERED',
] as const;

export const OFF_LADDER = ['EXCEPTION', 'RETURNED', 'UNKNOWN'] as const;

export type LadderStage = (typeof STAGE_LADDER)[number];
export type OffLadderStage = (typeof OFF_LADDER)[number];
export type Stage = LadderStage | OffLadderStage;

/** Semantic colour family. Mirrors the --color-st-* tokens. */
export type StageTone = 'idle' | 'transit' | 'arrived' | 'action' | 'done' | 'problem';

export interface StageMeta {
  /** Short label for chips, rings and the stage ladder. */
  label: string;
  /**
   * Answers "where is it" in one line. Used as the card headline whenever
   * Gemini's version is unavailable, so it has to stand on its own — and it has
   * to say something different from `plain`, which sits directly beneath it.
   */
  headline: string;
  /** Why that matters and what happens next, in plain Hebrew. */
  plain: string;
  tone: StageTone;
  /** lucide-react icon name, resolved in components/StageIcon. */
  icon: string;
  /** Position on the ladder; -1 for off-ladder states. */
  index: number;
  /** Typical days spent in this stage for a China-to-Israel route. Feeds the stuck detector. */
  typicalDays: number;
}

export const STAGE_META: Record<Stage, StageMeta> = {
  CREATED: {
    label: 'הוזמן',
    headline: 'המוכר עדיין לא שלח את החבילה',
    plain: 'תווית המשלוח הופקה, אבל החבילה עוד לא הועברה לשליח. זה השלב שבו כלום לא זז, ולרוב הוא נמשך 2–5 ימים.',
    tone: 'idle',
    icon: 'receipt',
    index: 0,
    typicalDays: 3,
  },
  PICKED_UP: {
    label: 'נאספה',
    headline: 'החבילה נאספה מהמוכר',
    plain: 'החבילה נמצאת במחסן היציאה ומחכה למיון לפני היציאה מהמדינה.',
    tone: 'transit',
    icon: 'package-check',
    index: 1,
    typicalDays: 3,
  },
  ORIGIN_TRANSIT: {
    label: 'בדרך במדינת המקור',
    headline: 'החבילה בדרך ליציאה ממדינת המקור',
    plain: 'היא עוברת בין מרכזי מיון לקראת הטיסה. בשלב הזה נורמלי לראות כמה עדכונים שנראים חוזרים על עצמם.',
    tone: 'transit',
    icon: 'truck',
    index: 2,
    typicalDays: 6,
  },
  INTERNATIONAL: {
    label: 'בדרך לישראל',
    headline: 'החבילה יצאה ממדינת המקור ובדרך לישראל',
    plain: 'זה השלב הארוך והשקט. שבועיים ללא שום עדכון הם דבר רגיל לחלוטין, כי בטיסה אין מי שיסרוק את החבילה.',
    tone: 'transit',
    icon: 'plane',
    index: 3,
    typicalDays: 12,
  },
  ARRIVED_IL: {
    label: 'נחתה בישראל',
    headline: 'החבילה נחתה בישראל',
    plain: 'היא בבית המסחר וממתינה לטיפול לפני העברה לחלוקה. בדרך כלל כמה ימים.',
    tone: 'arrived',
    icon: 'plane-landing',
    index: 4,
    typicalDays: 3,
  },
  CUSTOMS: {
    label: 'במכס',
    headline: 'החבילה בבדיקת מכס',
    plain: 'לרוב זה משתחרר מעצמו תוך כמה ימים. לפעמים נדרשת חשבונית או תשלום מע״מ כדי להמשיך.',
    tone: 'action',
    icon: 'shield-alert',
    index: 5,
    typicalDays: 4,
  },
  LOCAL_DELIVERY: {
    label: 'בחלוקה',
    headline: 'החבילה אצל השליח ובדרך אליך',
    plain: 'זה השלב האחרון. שווה לוודא שהטלפון והכתובת אצל השליח נכונים.',
    tone: 'transit',
    icon: 'bike',
    index: 6,
    typicalDays: 2,
  },
  AWAITING_PICKUP: {
    label: 'ממתין לאיסוף',
    headline: 'החבילה מחכה לך בנקודת איסוף',
    plain: 'יש חלון זמן מוגבל לאיסוף. אם הוא חולף, החבילה מוחזרת לשולח ותצטרך לבקש החזר.',
    tone: 'action',
    icon: 'store',
    index: 7,
    typicalDays: 5,
  },
  DELIVERED: {
    label: 'נמסרה',
    headline: 'החבילה נמסרה',
    plain: 'אין מה לעשות. אם לא קיבלת אותה בפועל, כדאי לפנות לשליח בהקדם.',
    tone: 'done',
    icon: 'check-check',
    index: 8,
    typicalDays: 0,
  },
  EXCEPTION: {
    label: 'תקלה',
    headline: 'משהו נתקע בדרך',
    plain: 'המסירה נכשלה או שהחבילה עוכבה. הסיבה הנפוצה היא כתובת או טלפון שגויים אצל השליח.',
    tone: 'problem',
    icon: 'triangle-alert',
    index: -1,
    typicalDays: 7,
  },
  RETURNED: {
    label: 'חזרה לשולח',
    headline: 'החבילה חוזרת לשולח',
    plain: 'היא לא תגיע אליך. אפשר לפתוח בקשת החזר כספי אצל המוכר על בסיס הסטטוס הזה.',
    tone: 'problem',
    icon: 'undo-2',
    index: -1,
    typicalDays: 0,
  },
  UNKNOWN: {
    label: 'ממתין למידע',
    headline: 'עדיין אין מידע מהשליח',
    plain: 'מספר המעקב נרשם, אבל השליח טרם דיווח עליו. לרוב העדכון הראשון מופיע 2–5 ימים אחרי ההזמנה.',
    tone: 'idle',
    icon: 'help-circle',
    index: -1,
    typicalDays: 5,
  },
};

export const LADDER_LENGTH = STAGE_LADDER.length;

export function stageMeta(stage: Stage): StageMeta {
  return STAGE_META[stage] ?? STAGE_META.UNKNOWN;
}

export function isOnLadder(stage: Stage): stage is LadderStage {
  return STAGE_META[stage]?.index >= 0;
}

export function isTerminal(stage: Stage) {
  return stage === 'DELIVERED' || stage === 'RETURNED';
}

/** Stages where the user has something to do, which drives the "דורש טיפול" filter. */
export function needsAction(stage: Stage) {
  return stage === 'CUSTOMS' || stage === 'AWAITING_PICKUP' || stage === 'EXCEPTION';
}

/**
 * How far along the ladder we are, 0..1. Off-ladder states fall back to the
 * furthest ladder rung reached so the ring never collapses to zero on a problem.
 */
export function ladderProgress(stage: Stage, fallbackIndex = 0) {
  const idx = STAGE_META[stage]?.index ?? -1;
  const effective = idx >= 0 ? idx : fallbackIndex;
  return Math.min(1, Math.max(0, effective / (LADDER_LENGTH - 1)));
}

export const TONE_CLASS: Record<StageTone, { fg: string; bg: string; border: string; stroke: string }> = {
  idle: { fg: 'text-st-idle', bg: 'bg-st-idle-soft', border: 'border-st-idle/30', stroke: 'stroke-st-idle' },
  transit: {
    fg: 'text-st-transit',
    bg: 'bg-st-transit-soft',
    border: 'border-st-transit/30',
    stroke: 'stroke-st-transit',
  },
  arrived: {
    fg: 'text-st-arrived',
    bg: 'bg-st-arrived-soft',
    border: 'border-st-arrived/30',
    stroke: 'stroke-st-arrived',
  },
  action: {
    fg: 'text-st-action',
    bg: 'bg-st-action-soft',
    border: 'border-st-action/30',
    stroke: 'stroke-st-action',
  },
  done: { fg: 'text-st-done', bg: 'bg-st-done-soft', border: 'border-st-done/30', stroke: 'stroke-st-done' },
  problem: {
    fg: 'text-st-problem',
    bg: 'bg-st-problem-soft',
    border: 'border-st-problem/30',
    stroke: 'stroke-st-problem',
  },
};

export function toneClass(stage: Stage) {
  return TONE_CLASS[stageMeta(stage).tone];
}
