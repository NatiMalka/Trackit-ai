import { detectCarrier, extractTrackingNumbers, normalizeTrackingNumber } from '../tracking/carriers';

/**
 * One AliExpress line we can turn into a TrackIt card.
 *
 * Status is intentionally absent: Ship24 is the only source of stage and
 * timeline. This payload is discovery metadata only.
 */
export interface AeOrderCandidate {
  trackingNumber: string;
  itemName?: string;
  itemImage?: string;
  aliexpressOrderId?: string;
}

const CDN = /alicdn\.com|ae-pic-|ae01\.alicdn/i;
const ORDER_ID = /\b(\d{16,19})\b/;

function absUrl(src: string): string | undefined {
  const trimmed = src.trim().replace(/^\/\//, 'https://');
  if (!trimmed) return undefined;
  if (trimmed.startsWith('http')) return trimmed.split('?')[0];
  return undefined;
}

function pickImage(html: string): string | undefined {
  const matches = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)];
  for (const m of matches) {
    const url = absUrl(m[1] ?? '');
    if (url && CDN.test(url) && !/icon|flag|logo|avatar|sprite/i.test(url)) return url;
  }
  return undefined;
}

function pickTitle(html: string): string | undefined {
  const attr = html.match(/alt=["']([^"']{4,80})["']/i)?.[1];
  if (attr && !/aliexpress|logo|icon/i.test(attr)) return attr.trim();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // First reasonably long run that is not a tracking number.
  const chunk = text
    .split(/Tracking number|מספר מעקב|Order ID|מספר הזמנה/i)[0]
    ?.trim();
  if (chunk && chunk.length >= 4 && chunk.length <= 80 && !extractTrackingNumbers(chunk).length) {
    return chunk;
  }
  return undefined;
}

function pickOrderId(html: string): string | undefined {
  return html.match(ORDER_ID)?.[1];
}

function splitOrderBlocks(html: string): string[] {
  const parts = html.split(/<(?:li|div|section|article)[^>]*(?:order-item|order-card|order-list-item|orderItem)[^>]*>/i);
  if (parts.length > 1) return parts.slice(1).map((p) => p.slice(0, 8000));
  return [html];
}

/**
 * Reads tracking numbers, titles and photos out of an AliExpress order-list
 * HTML page the user already loaded in the in-app browser.
 */
export function parseOrdersFromHtml(html: string): AeOrderCandidate[] {
  const byNumber = new Map<string, AeOrderCandidate>();

  for (const block of splitOrderBlocks(html)) {
    const numbers = extractTrackingNumbers(block);
    if (numbers.length === 0) continue;
    const image = pickImage(block);
    const title = pickTitle(block);
    const orderId = pickOrderId(block);
    for (const trackingNumber of numbers) {
      const guess = detectCarrier(trackingNumber);
      if (guess?.source && guess.source !== 'aliexpress' && guess.source !== 'other') continue;
      const existing = byNumber.get(trackingNumber);
      byNumber.set(trackingNumber, {
        trackingNumber: normalizeTrackingNumber(trackingNumber),
        itemName: title || existing?.itemName,
        itemImage: image || existing?.itemImage,
        aliexpressOrderId: orderId || existing?.aliexpressOrderId,
      });
    }
  }

  return [...byNumber.values()];
}

export function mergeCandidates(pages: AeOrderCandidate[][]): AeOrderCandidate[] {
  const byNumber = new Map<string, AeOrderCandidate>();
  for (const page of pages) {
    for (const item of page) {
      const existing = byNumber.get(item.trackingNumber);
      byNumber.set(item.trackingNumber, {
        trackingNumber: item.trackingNumber,
        itemName: item.itemName || existing?.itemName,
        itemImage: item.itemImage || existing?.itemImage,
        aliexpressOrderId: item.aliexpressOrderId || existing?.aliexpressOrderId,
      });
    }
  }
  return [...byNumber.values()];
}

/**
 * Runs inside the AliExpress WebView. Returns JSON of { html } so the app
 * parses with the same TypeScript function we unit-test — the page only
 * serialises what the user can already see.
 */
export const CAPTURE_PAGE_SCRIPT = `(function(){
  return JSON.stringify({
    href: location.href,
    html: document.documentElement ? document.documentElement.outerHTML : '',
    title: document.title || ''
  });
})()`;

export const CLICK_NEXT_SCRIPT = `(function(){
  var sel = [
    'button[aria-label="Next"]',
    'a[aria-label="Next"]',
    '[class*="pagination"] [class*="next"]',
    '[class*="Pagination"] [class*="next"]',
    'button.next-pagination-item.next-next'
  ];
  for (var i = 0; i < sel.length; i++) {
    var el = document.querySelector(sel[i]);
    if (!el) continue;
    var disabled = el.getAttribute('disabled') != null || /disabled|is-disabled/.test(el.className || '');
    if (disabled) continue;
    el.click();
    return 'next';
  }
  return 'end';
})()`;

export function isLoginUrl(href: string): boolean {
  return /login|passport|signin|register/i.test(href);
}

export function isOrderListUrl(href: string): boolean {
  return /\/p\/order|order_list|order\/index|myorders|orderList/i.test(href);
}
