import type { Stage } from '../tracking/stages';

/**
 * Lives here rather than in `prefs.ts` so this module stays free of React and
 * browser globals: the Cloud Function scheduler imports these same rules.
 */
export interface NotificationPrefs {
  /** Suppress routine scans; only send the events that change what you'd do. */
  milestonesOnly: boolean;
  /** The return-to-sender countdown. The single highest-value alert in Israel. */
  pickupReminders: boolean;
  stuckAlerts: boolean;
  /** FCM registration token, written back so the scheduler can target this device. */
  token?: string;
}

export const DEFAULT_PREFS: NotificationPrefs = {
  milestonesOnly: true,
  pickupReminders: true,
  stuckAlerts: true,
};

/**
 * Which events are worth interrupting someone for.
 *
 * The reason existing trackers get muted is that they notify on every scan —
 * "processed at facility" seven times in a row. These are the only transitions
 * that change what a person would actually do.
 */
export const MILESTONE_STAGES: readonly Stage[] = [
  'ARRIVED_IL',
  'CUSTOMS',
  'LOCAL_DELIVERY',
  'AWAITING_PICKUP',
  'DELIVERED',
  'EXCEPTION',
  'RETURNED',
] as const;

export type NotificationKind = 'stage' | 'pickup-deadline' | 'stuck';

export interface NotificationDecision {
  kind: NotificationKind;
  title: string;
  body: string;
  /** Deep link, so tapping lands on the package rather than the list. */
  url: string;
  /** Dedupe key. The scheduler stores it so the same alert is never sent twice. */
  dedupeKey: string;
}

const STAGE_COPY: Partial<Record<Stage, { title: string; body: string }>> = {
  ARRIVED_IL: { title: 'החבילה נחתה בישראל', body: 'עוד כמה ימים של טיפול מקומי ואז חלוקה.' },
  CUSTOMS: { title: 'החבילה נכנסה למכס', body: 'לרוב משתחרר מעצמו. אם נדרשת חשבונית — נעדכן.' },
  LOCAL_DELIVERY: { title: 'החבילה יצאה לחלוקה', body: 'אמורה להגיע אליך בימים הקרובים.' },
  AWAITING_PICKUP: { title: 'החבילה מחכה לאיסוף', body: 'יש חלון זמן מוגבל לפני החזרה לשולח.' },
  DELIVERED: { title: 'החבילה נמסרה', body: 'זה הכל. אפשר לסמן שהתקבלה.' },
  EXCEPTION: { title: 'יש בעיה עם החבילה', body: 'המסירה לא הצליחה. כדאי לבדוק מה קרה.' },
  RETURNED: { title: 'החבילה חוזרת לשולח', body: 'כדאי לפתוח בקשת החזר כספי.' },
};

interface Candidate {
  packageId: string;
  title: string;
  previousStage: Stage;
  stage: Stage;
  daysUntilDeadline?: number;
  daysSilent?: number;
  healthState?: 'normal' | 'slow' | 'stuck' | 'problem';
}

/**
 * Decides what, if anything, to send for one package. Pure and side-effect free
 * so the same rules run identically in the client and in the Cloud Function.
 */
export function decideNotifications(c: Candidate, prefs: NotificationPrefs): NotificationDecision[] {
  const out: NotificationDecision[] = [];
  const url = `/p/${c.packageId}`;

  // A milestone crossing, and only on the way up — a re-scan into the same stage
  // is not news.
  if (c.stage !== c.previousStage && MILESTONE_STAGES.includes(c.stage)) {
    const copy = STAGE_COPY[c.stage];
    if (copy && (!prefs.milestonesOnly || MILESTONE_STAGES.includes(c.stage))) {
      out.push({
        kind: 'stage',
        title: `${c.title} — ${copy.title}`,
        body: copy.body,
        url,
        dedupeKey: `${c.packageId}:stage:${c.stage}`,
      });
    }
  }

  // The return-to-sender clock. Three escalating reminders, no more.
  if (prefs.pickupReminders && c.stage === 'AWAITING_PICKUP' && c.daysUntilDeadline !== undefined) {
    const d = c.daysUntilDeadline;
    if (d === 3 || d === 1 || d === 0) {
      out.push({
        kind: 'pickup-deadline',
        title: d === 0 ? `${c.title} — היום היום האחרון לאיסוף` : `${c.title} — נותרו ${d === 1 ? 'יום' : '3 ימים'} לאיסוף`,
        body:
          d === 0
            ? 'אחרי היום החבילה מוחזרת לשולח.'
            : 'אחרי התאריך הזה החבילה מוחזרת לשולח ותצטרך לבקש החזר.',
        url,
        dedupeKey: `${c.packageId}:pickup:${d}`,
      });
    }
  }

  // Gone quiet for longer than the stage justifies.
  if (prefs.stuckAlerts && c.healthState === 'stuck' && c.daysSilent !== undefined) {
    out.push({
      kind: 'stuck',
      title: `${c.title} — נראה שהחבילה תקועה`,
      body: `${c.daysSilent} ימים ללא עדכון. כדאי לפנות למוכר לפני שחלון ההגנה נסגר.`,
      url,
      // Bucketed by week so a genuinely stuck parcel nags weekly, not daily.
      dedupeKey: `${c.packageId}:stuck:${Math.floor(c.daysSilent / 7)}`,
    });
  }

  return out;
}
