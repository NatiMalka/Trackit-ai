import { carrierInfo } from './carriers';
import { isOnLadder, stageMeta, STAGE_META, type Stage } from './stages';
import type { HealthAssessment, TrackedPackage, TrackingEvent } from './types';
import { daysBetween, MS_DAY } from '../../lib/format';

/**
 * Raw carrier text to canonical stage.
 *
 * This is deliberately NOT an AI call. It runs instantly, offline, for free, and
 * it is deterministic — the same scan always produces the same stage, so the UI
 * never flickers between readings. Gemini's job is to *explain* the result, not
 * to produce it, which means the app stays fully usable with AI disabled.
 *
 * Order matters: the first matching rule wins, so terminal and exception
 * signals are tested before the generic in-transit vocabulary.
 */
interface Rule {
  stage: Stage;
  /** Lowercased substrings (English/Hebrew) or CJK fragments. */
  any: string[];
  /** If present, none of these may appear — guards against negated phrasing. */
  not?: string[];
}

const RULES: Rule[] = [
  // --- Returned ------------------------------------------------------------
  {
    stage: 'RETURNED',
    any: [
      'return to sender',
      'returned to sender',
      'returning to shipper',
      'return to shipper',
      'item returned',
      'sent back',
      '退回',
      '退件',
      '返回',
      'הוחזר לשולח',
      'חזר לשולח',
      'מוחזר לשולח',
    ],
  },

  // --- Delivered -----------------------------------------------------------
  {
    stage: 'DELIVERED',
    any: [
      'delivered',
      'delivery completed',
      'successfully delivered',
      'signed for by',
      'signed by',
      'handed to recipient',
      'left at',
      'received by customer',
      '已签收',
      '妥投',
      'נמסר',
      'נמסרה',
      'המשלוח נמסר',
      'נמסר לנמען',
    ],
    not: ['not delivered', 'failed', 'attempted', 'unsuccessful', 'undeliverable', 'לא נמסר', 'נכשל'],
  },

  // --- Awaiting pickup ----------------------------------------------------
  // Checked before LOCAL_DELIVERY because "available for pickup" also contains
  // delivery vocabulary, and this stage carries the return-to-sender clock.
  {
    stage: 'AWAITING_PICKUP',
    any: [
      'available for pickup',
      'ready for pickup',
      'awaiting collection',
      'available for collection',
      'held at post office',
      'at pickup point',
      'arrived at pickup point',
      'collect from',
      'notice left',
      'locker',
      '待取件',
      '自提',
      'ממתין לאיסוף',
      'ממתינה לאיסוף',
      'הגיע לנקודת איסוף',
      'הגיעה לסניף',
      'ממתין בסניף',
      'זמין לאיסוף',
      'לוקר',
    ],
  },

  // --- Exceptions ---------------------------------------------------------
  {
    stage: 'EXCEPTION',
    any: [
      'delivery failed',
      'failed delivery',
      'delivery attempt failed',
      'unsuccessful delivery',
      'attempted delivery',
      'undeliverable',
      'address unknown',
      'incorrect address',
      'refused',
      'damaged',
      'lost',
      'missing',
      'exception',
      'held by carrier',
      'delay',
      'delayed',
      '异常',
      '丢失',
      '延误',
      'מסירה נכשלה',
      'כתובת שגויה',
      'לא אותרה',
      'תקלה',
      'עיכוב',
    ],
  },

  // --- Customs ------------------------------------------------------------
  {
    stage: 'CUSTOMS',
    any: [
      'customs',
      'customs clearance',
      'held in customs',
      'customs inspection',
      'awaiting customs',
      'import clearance',
      'clearance processing',
      'duty',
      'vat',
      'tax payment',
      'presented to customs',
      '海关',
      '清关',
      '报关',
      'מכס',
      'בבדיקת מכס',
      'שוחרר מהמכס',
      'עוכב במכס',
      'מע״מ',
      'מעמ',
    ],
  },

  // --- Local delivery -----------------------------------------------------
  {
    stage: 'LOCAL_DELIVERY',
    any: [
      'out for delivery',
      'with delivery courier',
      'on vehicle for delivery',
      'courier assigned',
      'in delivery',
      'delivery in progress',
      'arrived at delivery facility',
      'handed to courier',
      'last mile',
      '派送中',
      '投递中',
      '正在派送',
      'יצא לחלוקה',
      'יצאה לחלוקה',
      'בחלוקה',
      'אצל השליח',
      'נמסר לשליח',
      'בדרך אליך',
    ],
  },

  // --- Arrived in destination country -------------------------------------
  {
    stage: 'ARRIVED_IL',
    any: [
      'arrived in destination country',
      'arrived at destination',
      'arrival at destination',
      'arrived in israel',
      'received in destination country',
      'import scan',
      'arrived at inbound',
      'arrived at local distribution',
      'arrived at sorting center in destination',
      'unloaded from flight',
      'flight arrived',
      '到达目的国',
      '到达以色列',
      'הגיע לישראל',
      'הגיעה לישראל',
      'נחת בישראל',
      'התקבל בישראל',
      'הגיע לבית מסחר',
    ],
  },

  // --- International leg --------------------------------------------------
  {
    stage: 'INTERNATIONAL',
    any: [
      'departed from country of origin',
      'left origin country',
      'departure from outward office of exchange',
      'departed facility in',
      'in transit to destination country',
      'flight departed',
      'loaded on flight',
      'handed over to airline',
      'export scan',
      'exported',
      'linehaul',
      'international shipment',
      'arrived at transit',
      'transit center',
      '已离开',
      '出口',
      '航班',
      '国际运输',
      'יצא ממדינת המקור',
      'בטיסה',
      'בדרך לישראל',
    ],
  },

  // --- Origin-country transit ---------------------------------------------
  {
    stage: 'ORIGIN_TRANSIT',
    any: [
      'in transit',
      'departed from sorting',
      'processing at sorting',
      'received by warehouse',
      'received by sorting',
      'sorting center of origin',
      'consolidation warehouse',
      'arrived at consolidation',
      'left sorting',
      'arrived at sorting center',
      'arrived at facility',
      'processed at',
      'processed through facility',
      'sorting complete',
      'left the warehouse',
      'departed from warehouse',
      'forwarded',
      'accepted by',
      'arrived at outward office of exchange',
      'posting/collection',
      '运输中',
      '已发出',
      '到达分拣中心',
      '离开',
      '转运',
      'במעבר',
      'במיון',
    ],
  },

  // --- Picked up ----------------------------------------------------------
  {
    stage: 'PICKED_UP',
    any: [
      'picked up',
      'pickup scan',
      'shipment picked up',
      'collected from seller',
      'seller has shipped',
      'dispatched from seller',
      'received by carrier',
      'received by logistics',
      'collected by carrier',
      'package collected',
      'arrived at warehouse',
      'inbound into warehouse',
      'acceptance',
      '已收件',
      '揽收',
      '已取件',
      'נאסף',
      'נאספה',
      'נמסר לחברת השילוח',
    ],
  },

  // --- Created ------------------------------------------------------------
  {
    stage: 'CREATED',
    any: [
      'label created',
      'shipping label created',
      'shipment information received',
      'info received',
      'order placed',
      'order confirmed',
      'awaiting pickup by carrier',
      'being prepared',
      'order has been created',
      "order's been created",
      'pre-shipment',
      'pre-advice',
      'manifest',
      '已下单',
      '等待揽收',
      '电子信息已上传',
      'נוצרה תווית',
      'המשלוח נרשם',
      'הזמנה בוצעה',
    ],
  },
];

/** Locations to country codes, so the timeline can group by leg and show flags. */
const LOCATION_COUNTRIES: Array<[RegExp, string]> = [
  [/israel|ישראל|tel aviv|תל אביב|jerusalem|ירושלים|modi|מודיעין|haifa|חיפה|ben gurion|נתב״ג|natbag/i, 'IL'],
  [/china|shenzhen|guangzhou|yiwu|shanghai|hangzhou|beijing|dongguan|hong kong|סין/i, 'CN'],
  [/united states|usa|\bus\b|california|new york|chicago|memphis|isc /i, 'US'],
  [/germany|leipzig|frankfurt|köln|cologne/i, 'DE'],
  [/netherlands|amsterdam|schiphol/i, 'NL'],
  [/belgium|liege|liège|brussels/i, 'BE'],
  [/united kingdom|\buk\b|london|heathrow/i, 'GB'],
  [/turkey|istanbul|türkiye/i, 'TR'],
  [/poland|warsaw/i, 'PL'],
  [/france|paris|roissy/i, 'FR'],
  [/spain|madrid|barcelona/i, 'ES'],
  [/italy|milan|rome/i, 'IT'],
  [/korea|seoul|incheon/i, 'KR'],
  [/japan|tokyo|osaka/i, 'JP'],
  [/singapore/i, 'SG'],
  [/uae|dubai|emirates/i, 'AE'],
];

export function countryFromLocation(location?: string): string | undefined {
  if (!location) return undefined;
  for (const [re, code] of LOCATION_COUNTRIES) {
    if (re.test(location)) return code;
  }
  // "…, CN" / "…, IL" suffix used by several aggregators.
  const suffix = location.trim().match(/[,\s]([A-Z]{2})$/);
  return suffix?.[1];
}

/**
 * Two-letter country code for display.
 *
 * Deliberately not a flag emoji: Windows renders regional-indicator pairs as
 * bare letters rather than flags, so the emoji approach shows a broken-looking
 * "CN" to a large share of users. A styled code badge renders identically
 * everywhere.
 */
export function countryCode(code?: string) {
  if (!code || code.length !== 2 || code === 'XX') return '';
  return code.toUpperCase();
}

const COUNTRY_NAMES: Record<string, string> = {
  IL: 'ישראל',
  CN: 'סין',
  US: 'ארה״ב',
  DE: 'גרמניה',
  NL: 'הולנד',
  BE: 'בלגיה',
  GB: 'בריטניה',
  TR: 'טורקיה',
  PL: 'פולין',
  FR: 'צרפת',
  ES: 'ספרד',
  IT: 'איטליה',
  KR: 'קוריאה',
  JP: 'יפן',
  SG: 'סינגפור',
  AE: 'איחוד האמירויות',
  HK: 'הונג קונג',
};

export function countryName(code?: string) {
  if (!code) return 'לא ידוע';
  return COUNTRY_NAMES[code.toUpperCase()] ?? code.toUpperCase();
}

/**
 * Classifies one raw scan. `hintCountry` lets an otherwise-ambiguous phrase like
 * "arrived at sorting center" resolve correctly: in Israel it is local handling,
 * in China it is still origin transit.
 */
export function classifyEvent(rawText: string, location?: string, carrier?: string): Stage {
  const text = `${rawText} ${location ?? ''}`.toLowerCase();
  const country = countryFromLocation(location);
  const isLocalCarrier = carrierInfo(carrier).local === true;

  for (const rule of RULES) {
    if (rule.not?.some((n) => text.includes(n))) continue;
    if (!rule.any.some((k) => text.includes(k))) continue;

    // Generic transit vocabulary means something different once the parcel is
    // in the destination country.
    if (rule.stage === 'ORIGIN_TRANSIT' && (country === 'IL' || isLocalCarrier)) {
      return 'ARRIVED_IL';
    }
    if (rule.stage === 'PICKED_UP' && country === 'IL') {
      return 'ARRIVED_IL';
    }
    return rule.stage;
  }

  if (country === 'IL' || isLocalCarrier) return 'ARRIVED_IL';
  return 'UNKNOWN';
}

/** Normalizes and sorts a batch of raw scans into TrackingEvents (newest first). */
export function normalizeEvents(
  raw: Array<{ at: string; rawText: string; location?: string; carrier?: string }>,
): TrackingEvent[] {
  return raw
    .map((e) => {
      const countryCode =
        countryFromLocation(e.location) ??
        countryFromLocation(e.rawText) ??
        (e.carrier && carrierInfo(e.carrier).country !== 'XX' ? carrierInfo(e.carrier).country : undefined);
      return {
        at: new Date(e.at).toISOString(),
        rawText: e.rawText.trim(),
        location: e.location?.trim() || undefined,
        countryCode,
        carrier: e.carrier,
        stage: classifyEvent(e.rawText, e.location, e.carrier),
      };
    })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/**
 * The package's current stage.
 *
 * Uses the newest *meaningful* scan rather than simply the newest one, because
 * carriers routinely append an UNKNOWN-mapping administrative scan after a real
 * status change and that would otherwise wipe out the stage.
 */
export function currentStage(events: TrackingEvent[]): Stage {
  if (events.length === 0) return 'UNKNOWN';

  const terminal = events.find((e) => e.stage === 'DELIVERED' || e.stage === 'RETURNED');
  if (terminal) return terminal.stage;

  const meaningful = events.find((e) => e.stage !== 'UNKNOWN');
  return meaningful?.stage ?? 'UNKNOWN';
}

/** Furthest ladder rung ever reached, so a late exception cannot rewind the ring. */
export function maxLadderIndex(events: TrackingEvent[]): number {
  return events.reduce((max, e) => {
    const idx = STAGE_META[e.stage]?.index ?? -1;
    return idx > max ? idx : max;
  }, 0);
}

/** Israel Post holds a parcel ~14 days before returning it to the sender. */
export const PICKUP_WINDOW_DAYS = 14;

export function pickupDeadline(events: TrackingEvent[], stage: Stage): string | undefined {
  if (stage !== 'AWAITING_PICKUP') return undefined;
  const arrival = events.find((e) => e.stage === 'AWAITING_PICKUP');
  if (!arrival) return undefined;
  return new Date(Date.parse(arrival.at) + PICKUP_WINDOW_DAYS * MS_DAY).toISOString();
}

export function daysUntilDeadline(deadlineAt?: string) {
  if (!deadlineAt) return undefined;
  return daysBetween(Date.now(), deadlineAt);
}

/**
 * Deterministic stuck detection.
 *
 * The single most common complaint about tracking apps is silence with no
 * interpretation. We compare days-since-last-scan against what is typical for
 * the current stage, so the app can say "12 quiet days is normal here" instead
 * of leaving the user to guess. Gemini refines the wording; the verdict itself
 * works offline.
 */
export function assessHealth(pkg: Pick<TrackedPackage, 'stage' | 'events' | 'lastEventAt'>): HealthAssessment {
  const meta = stageMeta(pkg.stage);
  const last = pkg.lastEventAt ?? pkg.events[0]?.at;
  const daysSilent = last ? Math.max(0, daysBetween(last)) : 0;
  const typical = meta.typicalDays;

  if (pkg.stage === 'DELIVERED') {
    return { state: 'normal', daysSilent, typicalDaysForStage: 0, advice: 'החבילה נמסרה. אין מה לעשות.' };
  }

  if (pkg.stage === 'EXCEPTION' || pkg.stage === 'RETURNED') {
    return {
      state: 'problem',
      daysSilent,
      typicalDaysForStage: typical,
      advice:
        pkg.stage === 'RETURNED'
          ? 'החבילה בדרך חזרה לשולח. פתח בקשת החזר כספי אצל המוכר.'
          : 'דווח על תקלה. כדאי לפנות לשליח או לפתוח מחלוקת אצל המוכר.',
    };
  }

  if (pkg.stage === 'AWAITING_PICKUP') {
    return {
      state: 'normal',
      daysSilent,
      typicalDaysForStage: typical,
      advice: 'צריך לאסוף את החבילה מנקודת האיסוף לפני תום חלון הזמן.',
    };
  }

  // Two thresholds: "slower than usual" and "well past anything normal".
  const slowAt = Math.max(typical + 3, Math.ceil(typical * 1.5));
  const stuckAt = Math.max(typical + 10, typical * 2 + 4);

  if (daysSilent >= stuckAt) {
    return {
      state: 'stuck',
      daysSilent,
      typicalDaysForStage: typical,
      advice: `${daysSilent} ימים ללא עדכון — חריג לשלב הזה. כדאי לפנות למוכר או לפתוח מחלוקת לפני שחלון ההגנה נסגר.`,
    };
  }

  if (daysSilent >= slowAt) {
    return {
      state: 'slow',
      daysSilent,
      typicalDaysForStage: typical,
      advice: `${daysSilent} ימים ללא עדכון — איטי מהרגיל, אבל עדיין קורה. שווה לבדוק שוב בעוד כמה ימים.`,
    };
  }

  return {
    state: 'normal',
    daysSilent,
    typicalDaysForStage: typical,
    advice:
      pkg.stage === 'INTERNATIONAL'
        ? 'שקט בשלב הזה הוא נורמלי — חבילות בטיסה לרוב לא מדווחות עד הנחיתה.'
        : 'הכל מתקדם בקצב הרגיל.',
  };
}

/** Rungs every parcel must pass through. AWAITING_PICKUP (7) is an alternative
 *  branch to LOCAL_DELIVERY, not an extra step, so counting it would inflate
 *  every estimate by five days. */
const LAST_MANDATORY_STAGE_INDEX = 6;

/**
 * Deterministic ETA fallback: sums the typical duration of every remaining rung.
 * Gemini produces a better window from the actual route, but this keeps an
 * honest estimate on screen when AI is off or offline.
 */
export function estimateEta(stage: Stage, lastEventAt?: string) {
  // No arrival estimate once the parcel has stopped moving on its own: it is
  // either done, coming back, or sitting in a pickup point waiting for the user,
  // and in that last case the pickup deadline is the date that matters.
  if (stage === 'DELIVERED' || stage === 'RETURNED' || stage === 'AWAITING_PICKUP') return undefined;
  const meta = stageMeta(stage);
  const startIndex = isOnLadder(stage) ? meta.index : 2;

  let remaining = 0;
  for (const s of Object.values(STAGE_META)) {
    if (s.index > startIndex && s.index <= LAST_MANDATORY_STAGE_INDEX) remaining += s.typicalDays;
  }
  // Time already spent in the current stage counts against its own budget.
  const elapsed = lastEventAt ? Math.max(0, daysBetween(lastEventAt)) : 0;
  const remainingInStage = Math.max(0, meta.typicalDays - elapsed);
  const centre = remaining + remainingInStage;

  const from = new Date(Date.now() + Math.max(1, Math.round(centre * 0.75)) * MS_DAY);
  const to = new Date(Date.now() + Math.max(2, Math.round(centre * 1.4)) * MS_DAY);

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    confidence: 'low' as const,
  };
}

/** Stable hash of the event log. The AI cache key — no change, no token spend. */
export function hashEvents(events: TrackingEvent[]): string {
  const seed = events.map((e) => `${e.at}|${e.stage}|${e.rawText}`).join('~');
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < seed.length; i++) {
    const ch = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h2 >>> 0).toString(36)}${(h1 >>> 0).toString(36)}-${events.length}`;
}

/** Recomputes every derived field after new scans arrive. */
export function derivePackageState(events: TrackingEvent[], previousMax = 0) {
  const stage = currentStage(events);
  const reached = Math.max(previousMax, maxLadderIndex(events));
  return {
    stage,
    maxLadderIndex: reached,
    lastEventAt: events[0]?.at,
    deadlineAt: pickupDeadline(events, stage),
  };
}

/** Groups the timeline by country leg, which is how people actually reason about a journey. */
export interface TimelineLeg {
  countryCode?: string;
  events: TrackingEvent[];
}

export function groupIntoLegs(events: TrackingEvent[]): TimelineLeg[] {
  const legs: TimelineLeg[] = [];
  for (const event of events) {
    const last = legs[legs.length - 1];
    // Scans with no resolvable country belong to whichever leg they sit in.
    const code = event.countryCode ?? last?.countryCode;
    if (last && last.countryCode === code) {
      last.events.push(event);
    } else {
      legs.push({ countryCode: code, events: [event] });
    }
  }
  return legs;
}
