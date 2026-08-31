import { MS_DAY } from '../../lib/format';
import { detectCarrier, normalizeTrackingNumber, type Source } from './carriers';
import { normalizeEvents } from './normalize';
import type { ProviderResult, TrackingProvider } from './provider';

/**
 * Offline tracking provider.
 *
 * Generates a plausible multi-leg journey from the tracking number itself, so
 * the whole app — normalizer, stage ladder, stuck detector, AI prompts — can be
 * built and demoed with no API key and no cost. Output is deterministic: the
 * same number always yields the same journey, and because events are emitted on
 * a real timeline, refreshing days later genuinely reveals new scans.
 *
 * Scenarios are chosen to cover the failure modes real trackers handle badly:
 * silent international legs, customs holds, and pickup deadlines.
 */

interface RawStep {
  /** Days after shipment start. */
  day: number;
  text: string;
  location?: string;
  carrier?: string;
}

interface Scenario {
  id: string;
  label: string;
  source: Source;
  carrier: string;
  steps: RawStep[];
  /** Where on the timeline a package using this scenario starts out. */
  ageDays: number;
}

const IL_LAST_MILE = 'israel-post';

const SCENARIOS: Scenario[] = [
  {
    id: 'ali-happy',
    label: 'AliExpress — מסלול תקין עד מסירה',
    source: 'aliexpress',
    carrier: 'cainiao',
    ageDays: 34,
    steps: [
      { day: 0, text: '电子信息已上传 / Shipment information received', location: 'Guangzhou, CN', carrier: 'cainiao' },
      { day: 1, text: '揽收成功 / Picked up by carrier', location: 'Guangzhou, CN', carrier: 'cainiao' },
      { day: 2, text: 'Arrived at sorting center', location: 'Guangzhou Sorting Center, CN', carrier: 'cainiao' },
      { day: 4, text: 'Departed from sorting center', location: 'Guangzhou, CN', carrier: 'cainiao' },
      { day: 6, text: 'Export customs clearance completed', location: 'Shenzhen, CN', carrier: 'cainiao' },
      { day: 7, text: 'Loaded on flight / 航班已起飞', location: 'Hong Kong, HK', carrier: 'cainiao' },
      { day: 19, text: 'Arrived in destination country', location: 'Ben Gurion Airport, IL', carrier: IL_LAST_MILE },
      { day: 21, text: 'Presented to customs', location: 'בית מסחר מודיעין, ישראל', carrier: IL_LAST_MILE },
      { day: 23, text: 'שוחרר מהמכס', location: 'בית מסחר מודיעין, ישראל', carrier: IL_LAST_MILE },
      { day: 25, text: 'הגיע לסניף הדואר בעיר היעד', location: 'תל אביב, ישראל', carrier: IL_LAST_MILE },
      { day: 26, text: 'יצא לחלוקה', location: 'תל אביב, ישראל', carrier: IL_LAST_MILE },
      { day: 26.4, text: 'נמסר לנמען', location: 'תל אביב, ישראל', carrier: IL_LAST_MILE },
    ],
  },
  {
    id: 'ali-customs',
    label: 'AliExpress — מעוכב במכס',
    source: 'aliexpress',
    carrier: 'cainiao',
    ageDays: 24,
    steps: [
      { day: 0, text: 'Shipment information received', location: 'Yiwu, CN', carrier: 'cainiao' },
      { day: 2, text: '揽收 / Parcel collected from seller', location: 'Yiwu, CN', carrier: 'cainiao' },
      { day: 3, text: 'Arrived at facility', location: 'Yiwu Hub, CN', carrier: 'cainiao' },
      { day: 5, text: 'Departed facility in Shanghai', location: 'Shanghai, CN', carrier: 'cainiao' },
      { day: 6, text: 'Handed over to airline', location: 'Shanghai PVG, CN', carrier: 'cainiao' },
      { day: 17, text: 'Flight arrived, unloaded from flight', location: 'Ben Gurion Airport, IL', carrier: IL_LAST_MILE },
      { day: 18, text: 'Held in customs — import clearance pending', location: 'בית מסחר מודיעין, ישראל', carrier: IL_LAST_MILE },
      { day: 19, text: 'נדרשת חשבונית לצורך שחרור מהמכס', location: 'בית מסחר מודיעין, ישראל', carrier: IL_LAST_MILE },
    ],
  },
  {
    id: 'ali-blackhole',
    label: 'AliExpress — שקט ארוך בטיסה',
    source: 'aliexpress',
    carrier: 'cainiao',
    ageDays: 27,
    steps: [
      { day: 0, text: '已下单，等待揽收', location: 'Dongguan, CN', carrier: 'cainiao' },
      { day: 2, text: 'Seller has shipped the item', location: 'Dongguan, CN', carrier: 'cainiao' },
      { day: 4, text: 'Arrived at sorting center', location: 'Shenzhen, CN', carrier: 'cainiao' },
      { day: 6, text: '已离开中国 / Departed from country of origin', location: 'Shenzhen, CN', carrier: 'cainiao' },
    ],
  },
  {
    id: 'shein-pickup',
    label: 'SHEIN — ממתין לאיסוף בנקודת חלוקה',
    source: 'shein',
    carrier: 'shein-express',
    ageDays: 17,
    steps: [
      { day: 0, text: 'Order confirmed, label created', location: 'Foshan, CN', carrier: 'shein-express' },
      { day: 1, text: 'Package picked up', location: 'Foshan, CN', carrier: 'shein-express' },
      { day: 3, text: 'In transit — processed through facility', location: 'Guangzhou, CN', carrier: 'shein-express' },
      { day: 5, text: 'Export scan, loaded on flight', location: 'Guangzhou CAN, CN', carrier: 'shein-express' },
      { day: 12, text: 'Arrived in destination country', location: 'Ben Gurion Airport, IL', carrier: 'chita-delivery' },
      { day: 13, text: 'Customs clearance completed', location: 'מודיעין, ישראל', carrier: 'chita-delivery' },
      { day: 14, text: 'הגיעה לנקודת איסוף — ממתינה לאיסוף', location: 'נקודת חלוקה, רמת גן, ישראל', carrier: 'chita-delivery' },
    ],
  },
  {
    id: 'amazon-lastmile',
    label: 'Amazon — יצא לחלוקה',
    source: 'amazon',
    carrier: 'amazon-logistics',
    ageDays: 8,
    steps: [
      { day: 0, text: 'Shipping label created', location: 'Leipzig, DE', carrier: 'amazon-logistics' },
      { day: 1, text: 'Package left the warehouse', location: 'Leipzig, DE', carrier: 'amazon-logistics' },
      { day: 2, text: 'In transit to destination country', location: 'Leipzig, DE', carrier: 'amazon-logistics' },
      { day: 5, text: 'Arrived at destination', location: 'Ben Gurion Airport, IL', carrier: 'hfd' },
      { day: 6, text: 'Customs clearance completed', location: 'לוד, ישראל', carrier: 'hfd' },
      { day: 7, text: 'Out for delivery', location: 'חיפה, ישראל', carrier: 'hfd' },
    ],
  },
  {
    id: 'label-only',
    label: 'המוכר טרם שלח',
    source: 'aliexpress',
    carrier: 'cainiao',
    ageDays: 6,
    steps: [{ day: 0, text: 'Shipping label created / 电子信息已上传', location: 'Hangzhou, CN', carrier: 'cainiao' }],
  },
  {
    id: 'failed-delivery',
    label: 'ניסיון מסירה נכשל',
    source: 'temu',
    carrier: 'yanwen',
    ageDays: 21,
    steps: [
      { day: 0, text: 'Shipment information received', location: 'Guangzhou, CN', carrier: 'yanwen' },
      { day: 2, text: 'Picked up', location: 'Guangzhou, CN', carrier: 'yanwen' },
      { day: 5, text: 'Departed from country of origin', location: 'Guangzhou, CN', carrier: 'yanwen' },
      { day: 15, text: 'Arrived in destination country', location: 'Ben Gurion Airport, IL', carrier: IL_LAST_MILE },
      { day: 17, text: 'יצא לחלוקה', location: 'באר שבע, ישראל', carrier: IL_LAST_MILE },
      { day: 18, text: 'Delivery attempt failed — address unknown', location: 'באר שבע, ישראל', carrier: IL_LAST_MILE },
    ],
  },
  {
    id: 'returned',
    label: 'הוחזר לשולח',
    source: 'aliexpress',
    carrier: 'china-post',
    ageDays: 48,
    steps: [
      { day: 0, text: 'Shipment information received', location: 'Beijing, CN', carrier: 'china-post' },
      { day: 3, text: 'Acceptance', location: 'Beijing, CN', carrier: 'china-post' },
      { day: 8, text: 'Departure from outward office of exchange', location: 'Beijing, CN', carrier: 'china-post' },
      { day: 22, text: 'Arrived in destination country', location: 'Ben Gurion Airport, IL', carrier: IL_LAST_MILE },
      { day: 24, text: 'ממתין לאיסוף בסניף', location: 'פתח תקווה, ישראל', carrier: IL_LAST_MILE },
      { day: 39, text: 'לא נאסף בזמן — הוחזר לשולח', location: 'פתח תקווה, ישראל', carrier: IL_LAST_MILE },
    ],
  },
];

/** Lets anyone force a specific journey by prefixing the number, e.g. DEMOCUSTOMS1. */
const FORCED: Array<[keyword: string, scenarioId: string]> = [
  ['HAPPY', 'ali-happy'],
  ['CUSTOMS', 'ali-customs'],
  ['STUCK', 'ali-blackhole'],
  ['PICKUP', 'shein-pickup'],
  ['DELIVERY', 'amazon-lastmile'],
  ['NEW', 'label-only'],
  ['FAIL', 'failed-delivery'],
  ['RETURN', 'returned'],
];

function hash(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickScenario(tn: string): { scenario: Scenario; forced: boolean } {
  for (const [keyword, id] of FORCED) {
    if (tn.startsWith(`DEMO${keyword}`)) {
      const found = SCENARIOS.find((s) => s.id === id);
      if (found) return { scenario: found, forced: true };
    }
  }
  const detected = detectCarrier(tn);
  const h = hash(tn);

  // Bias towards a scenario matching the detected carrier, so a real-looking
  // SHEIN number does not come back as an Amazon journey.
  if (detected?.source) {
    const matching = SCENARIOS.filter((s) => s.source === detected.source);
    if (matching.length > 0) return { scenario: matching[h % matching.length], forced: false };
  }
  return { scenario: SCENARIOS[h % SCENARIOS.length], forced: false };
}

export const mockProvider: TrackingProvider = {
  id: 'mock',
  label: 'נתוני הדגמה (ללא חיבור לשליח)',

  async track(trackingNumber: string, carrier?: string): Promise<ProviderResult> {
    const tn = normalizeTrackingNumber(trackingNumber);

    // Network-ish latency so skeletons and spinners are exercised honestly.
    await new Promise((r) => setTimeout(r, 260 + (hash(tn) % 420)));

    // A stable slice of numbers report as unknown, because real providers do.
    if (/^0{4,}/.test(tn) || tn === 'NOTFOUND') {
      return { trackingNumber: tn, events: [], notFound: true };
    }

    const { scenario, forced } = pickScenario(tn);
    // Jitter the age per-number so two packages on the same scenario sit at
    // different points in the journey. A DEMO number is exempt: its whole
    // purpose is to reproduce one specific end state on demand, and jitter can
    // cut the journey short before it gets there.
    const age = forced ? scenario.ageDays : scenario.ageDays - (hash(`${tn}:age`) % 7);
    const startedAt = Date.now() - age * MS_DAY;

    // Only steps whose time has already passed are visible. This is what makes
    // a later refresh genuinely surface new scans.
    const visible = scenario.steps.filter((s) => startedAt + s.day * MS_DAY <= Date.now());

    const events = normalizeEvents(
      visible.map((s) => ({
        at: new Date(startedAt + s.day * MS_DAY).toISOString(),
        rawText: s.text,
        location: s.location,
        carrier: s.carrier,
      })),
    );

    return {
      trackingNumber: tn,
      carrier: carrier ?? visible.at(-1)?.carrier ?? scenario.carrier,
      source: scenario.source,
      events,
    };
  },
};

/** Shown in Settings so anyone can reproduce a given journey on demand. */
export const MOCK_SCENARIO_HINTS = FORCED.map(([keyword, id]) => {
  const scenario = SCENARIOS.find((s) => s.id === id)!;
  return {
    id,
    label: scenario.label,
    example: `DEMO${keyword}${String(hash(id) % 1000).padStart(3, '0')}`,
  };
});
