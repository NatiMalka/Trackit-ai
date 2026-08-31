import type { Stage } from '../tracking/stages';
import { stageMeta } from '../tracking/stages';

/**
 * Lives here rather than in `prefs.ts` so this module stays free of React and
 * browser globals: the Cloud Function scheduler imports these same rules.
 */
export interface NotificationPrefs {
  /**
   * When true, skip routine warehouse scans and only send the events that
   * change what you'd do (landed, customs, out for delivery, pickup, stuck).
   * Default is off: every new status is news.
   */
  milestonesOnly: boolean;
  /** The return-to-sender countdown. The single highest-value alert in Israel. */
  pickupReminders: boolean;
  stuckAlerts: boolean;
  /** Bumped when the product default changes, so old localStorage is migrated. */
  prefsVersion?: number;
  /** FCM registration token, written back so the scheduler can target this device. */
  token?: string;
}

export const PREFS_VERSION = 2;

export const DEFAULT_PREFS: NotificationPrefs = {
  milestonesOnly: false,
  pickupReminders: true,
  stuckAlerts: true,
  prefsVersion: PREFS_VERSION,
};

/**
 * Transitions that change what a person would actually do. Used only when
 * `milestonesOnly` is on.
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

export interface NotificationCandidate {
  packageId: string;
  title: string;
  previousStage: Stage;
  stage: Stage;
  /** New scans even when the stage label did not move. */
  eventsChanged?: boolean;
  eventsHash?: string;
  latestEventText?: string;
  daysUntilDeadline?: number;
  daysSilent?: number;
  healthState?: 'normal' | 'slow' | 'stuck' | 'problem';
}

function copyFor(stage: Stage): { title: string; body: string } {
  const special = STAGE_COPY[stage];
  if (special) return special;
  const meta = stageMeta(stage);
  return { title: `עדכון: ${meta.label}`, body: meta.headline };
}

/**
 * Decides what, if anything, to send for one package. Pure and side-effect free
 * so the same rules run identically in the client and in the Cloud Function.
 */
export function decideNotifications(c: NotificationCandidate, prefs: NotificationPrefs): NotificationDecision[] {
  const out: NotificationDecision[] = [];
  const url = `/p/${c.packageId}`;
  const stageMoved = c.stage !== c.previousStage;
  const news = stageMoved || Boolean(c.eventsChanged);

  if (news) {
    const milestone = stageMoved && MILESTONE_STAGES.includes(c.stage);
    if (!prefs.milestonesOnly || milestone) {
      const copy = copyFor(c.stage);
      const eventBit = c.latestEventText?.trim().slice(0, 140);
      out.push({
        kind: 'stage',
        title: stageMoved ? `${c.title} — ${copy.title}` : `${c.title} — עדכון חדש`,
        body: !stageMoved && eventBit ? eventBit : copy.body,
        url,
        dedupeKey: c.eventsHash ? `${c.packageId}:events:${c.eventsHash}` : `${c.packageId}:stage:${c.stage}`,
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

/** Skip the "just added, first poll filled in" case — that is not news. */
const FIRST_FILL_GRACE_MS = 1000 * 60 * 5;

export function shouldAnnounceUpdate(
  createdAt: string,
  previousEventCount: number,
  nextEventCount: number,
  changed: boolean,
): boolean {
  if (!changed) return false;
  const firstSighting = previousEventCount === 0 && nextEventCount > 0;
  if (!firstSighting) return true;
  return Date.now() - Date.parse(createdAt) > FIRST_FILL_GRACE_MS;
}
