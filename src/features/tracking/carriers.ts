/** Marketplace the parcel was bought from. Drives the card badge and route hints. */
export type Source = 'aliexpress' | 'shein' | 'amazon' | 'temu' | 'ebay' | 'other';

export interface CarrierInfo {
  code: string;
  name: string;
  /** ISO-3166 alpha-2 of the carrier's home country, for the route arc. */
  country: string;
  /** True for the last-mile carrier inside Israel. */
  local?: boolean;
  trackingUrl?: (tn: string) => string;
}

export const CARRIERS: Record<string, CarrierInfo> = {
  cainiao: {
    code: 'cainiao',
    name: 'Cainiao',
    country: 'CN',
    trackingUrl: (tn) => `https://global.cainiao.com/detail.htm?mailNoList=${tn}`,
  },
  'china-post': { code: 'china-post', name: 'China Post', country: 'CN' },
  yanwen: { code: 'yanwen', name: 'Yanwen', country: 'CN' },
  '4px': { code: '4px', name: '4PX', country: 'CN' },
  yunexpress: { code: 'yunexpress', name: 'YunExpress', country: 'CN' },
  'sf-express': { code: 'sf-express', name: 'SF Express', country: 'CN' },
  'shein-express': { code: 'shein-express', name: 'SHEIN Express', country: 'CN' },
  'amazon-logistics': { code: 'amazon-logistics', name: 'Amazon Logistics', country: 'US' },
  ups: { code: 'ups', name: 'UPS', country: 'US' },
  fedex: { code: 'fedex', name: 'FedEx', country: 'US' },
  dhl: { code: 'dhl', name: 'DHL', country: 'DE' },
  usps: { code: 'usps', name: 'USPS', country: 'US' },
  'royal-mail': { code: 'royal-mail', name: 'Royal Mail', country: 'GB' },
  'israel-post': {
    code: 'israel-post',
    name: 'דואר ישראל',
    country: 'IL',
    local: true,
    trackingUrl: (tn) => `https://mypost.israelpost.co.il/itemtrace?itemcode=${tn}`,
  },
  'israel-ems': { code: 'israel-ems', name: 'דואר שליחים (EMS)', country: 'IL', local: true },
  'chita-delivery': { code: 'chita-delivery', name: 'צ׳יטה', country: 'IL', local: true },
  hfd: { code: 'hfd', name: 'HFD', country: 'IL', local: true },
  unknown: { code: 'unknown', name: 'שליח לא מזוהה', country: 'XX' },
};

export function carrierInfo(code?: string): CarrierInfo {
  return (code && CARRIERS[code]) || CARRIERS.unknown;
}

export const SOURCE_LABEL: Record<Source, string> = {
  aliexpress: 'AliExpress',
  shein: 'SHEIN',
  amazon: 'Amazon',
  temu: 'Temu',
  ebay: 'eBay',
  other: 'אחר',
};

/**
 * Fallback name for a package with no nickname.
 *
 * Hebrew attaches the "from" preposition directly to the following word, which
 * needs a hyphen before Latin script ("מ־AliExpress"); without it the letter
 * collides with the brand name and reads as a typo.
 *
 * With no recognised marketplace it falls back to the tracking number rather
 * than a bare "חבילה", because four cards all labelled "חבילה" are
 * indistinguishable — which is one of the problems this app exists to fix.
 */
export function defaultPackageTitle(source: Source, trackingNumber?: string) {
  if (source !== 'other') return `חבילה מ־${SOURCE_LABEL[source]}`;
  return trackingNumber ? trackingNumber.toUpperCase() : 'חבילה';
}

/**
 * Tracking-number shape detection, most specific pattern first.
 *
 * Deliberately conservative: a wrong guess is worse than no guess, because the
 * user sees the carrier name on the card and will lose trust if it is nonsense.
 * `null` is a perfectly good answer and the UI handles it.
 */
const PATTERNS: Array<{ re: RegExp; carrier: string; source?: Source }> = [
  // Cainiao / AliExpress Standard Shipping
  { re: /^LP\d{14,16}$/i, carrier: 'cainiao', source: 'aliexpress' },
  { re: /^AE\d{10,}[A-Z]{0,2}$/i, carrier: 'cainiao', source: 'aliexpress' },
  { re: /^AP\d{10,}$/i, carrier: 'cainiao', source: 'aliexpress' },
  // UPU S10: two letters + 9 digits + 2-letter country code
  { re: /^[A-Z]{2}\d{9}CN$/i, carrier: 'china-post' },
  { re: /^[A-Z]{2}\d{9}IL$/i, carrier: 'israel-post' },
  { re: /^[A-Z]{2}\d{9}US$/i, carrier: 'usps' },
  { re: /^[A-Z]{2}\d{9}GB$/i, carrier: 'royal-mail' },
  { re: /^[A-Z]{2}\d{9}[A-Z]{2}$/i, carrier: 'unknown' },
  // SHEIN
  { re: /^SH\d{10,}$/i, carrier: 'shein-express', source: 'shein' },
  // Yanwen / YunExpress / 4PX
  { re: /^UN\d{10,}$/i, carrier: 'yanwen' },
  { re: /^YT\d{13,}$/i, carrier: 'yunexpress' },
  { re: /^4PX\d+$/i, carrier: '4px' },
  { re: /^SF\d{10,}$/i, carrier: 'sf-express' },
  // Amazon: TBA + 9-12 digits
  { re: /^TBA\d{9,12}$/i, carrier: 'amazon-logistics', source: 'amazon' },
  // UPS 1Z
  { re: /^1Z[0-9A-Z]{16}$/i, carrier: 'ups' },
  // FedEx: 12 or 15 digits
  { re: /^\d{12}$|^\d{15}$/, carrier: 'fedex' },
  // DHL eCommerce / Express
  { re: /^GM\d{10,}$/i, carrier: 'dhl' },
  { re: /^JJD\d{10,}$/i, carrier: 'dhl' },
  { re: /^\d{10}$/, carrier: 'dhl' },
  // Israel Post domestic
  { re: /^(RR|RA|CP|EE|RC)\d{9}IL$/i, carrier: 'israel-post' },
];

export interface CarrierGuess {
  carrier: string;
  source?: Source;
  confidence: 'high' | 'medium' | 'low';
}

export function normalizeTrackingNumber(input: string) {
  return input.replace(/[\s\u200f\u200e-]/g, '').toUpperCase();
}

export function detectCarrier(trackingNumber: string): CarrierGuess | null {
  const tn = normalizeTrackingNumber(trackingNumber);
  if (tn.length < 6) return null;

  for (const { re, carrier, source } of PATTERNS) {
    if (!re.test(tn)) continue;
    // Bare digit runs match several couriers, so we never claim high confidence.
    const confidence = /^\d+$/.test(tn) ? 'low' : carrier === 'unknown' ? 'medium' : 'high';
    return { carrier, source, confidence };
  }
  return null;
}

/** Pulls candidate tracking numbers out of pasted text (email, SMS, order page). */
export function extractTrackingNumbers(text: string): string[] {
  const candidates = text.toUpperCase().match(/\b[A-Z0-9]{8,35}\b/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of candidates) {
    const tn = normalizeTrackingNumber(raw);
    if (seen.has(tn)) continue;
    // Must contain a digit and not be a date, price or order-total artefact.
    if (!/\d/.test(tn)) continue;
    if (/^\d{4}[-/]\d{2}/.test(tn)) continue;
    const recognised = detectCarrier(tn);
    // Keep anything a pattern recognises, plus long mixed strings that look
    // like tracking numbers even when no pattern matched.
    if (recognised || (tn.length >= 12 && /[A-Z]/.test(tn) && /\d/.test(tn))) {
      seen.add(tn);
      out.push(tn);
    }
  }
  return out.slice(0, 12);
}
