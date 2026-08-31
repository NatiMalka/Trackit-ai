import type { Stage } from './stages';
import type { Source } from './carriers';

/** A single scan from a carrier, after normalization. */
export interface TrackingEvent {
  /** ISO-8601 instant of the scan. */
  at: string;
  /** Carrier text exactly as received. Always kept so the user can verify us. */
  rawText: string;
  /** Free-text location as the carrier reported it. */
  location?: string;
  /** ISO-3166 alpha-2, resolved from the location where possible. */
  countryCode?: string;
  /** Carrier code responsible for this leg. */
  carrier?: string;
  /** The rung this scan maps to. */
  stage: Stage;
}

export interface EtaWindow {
  from: string;
  to: string;
  confidence: 'low' | 'medium' | 'high';
}

export type HealthState = 'normal' | 'slow' | 'stuck' | 'problem';

export interface HealthAssessment {
  state: HealthState;
  daysSilent: number;
  typicalDaysForStage: number;
  /** Plain-Hebrew advice. Deterministic by default, upgraded by Gemini. */
  advice: string;
}

/** Cached Gemini output. Keyed by eventsHash so tokens are only spent on change. */
export interface AiInsight {
  eventsHash: string;
  headline: string;
  meaning: string;
  nextStep?: string;
  eta?: EtaWindow;
  health?: Pick<HealthAssessment, 'state' | 'advice'>;
  generatedAt: string;
  model: string;
}

export interface TrackedPackage {
  id: string;
  trackingNumber: string;
  carrier: string;
  source: Source;
  /** User-given name. Solves "which of my eight packages is this?". */
  nickname?: string;
  /** What is inside, either typed by the user or inferred from pasted text. */
  itemName?: string;
  /**
   * Product photo so the list is recognizable at a glance.
   * Data URL from the camera/gallery, or a CDN URL from an AliExpress import.
   */
  itemImage?: string;
  /** AliExpress order id, when the card was imported from a connected account. */
  aliexpressOrderId?: string;
  /** Token key from PACKAGE_COLORS, used for the card accent. */
  colorTag?: string;
  stage: Stage;
  /** Highest ladder index ever reached, so a late exception does not rewind the ring. */
  maxLadderIndex: number;
  events: TrackingEvent[];
  createdAt: string;
  lastEventAt?: string;
  /** Last time a provider was polled, regardless of whether anything changed. */
  lastCheckedAt?: string;
  /** Return-to-sender deadline while AWAITING_PICKUP. */
  deadlineAt?: string;
  eta?: EtaWindow;
  archived?: boolean;
  ai?: AiInsight;
  /** Ship24 tracker ids created for this number, so delete can unsubscribe them. */
  ship24TrackerIds?: string[];
  /**
   * True until the user opens the package. Set when new tracking events arrive
   * so the list can show a dot even if the notification was missed.
   */
  unread?: boolean;
  /** Dedupe keys of alerts already sent, so the same update is never notified twice. */
  notified?: string[];
}

/** New-package payload before it has ever been polled. */
export type PackageDraft = Pick<TrackedPackage, 'trackingNumber' | 'carrier' | 'source'> &
  Partial<Pick<TrackedPackage, 'nickname' | 'itemName' | 'itemImage' | 'aliexpressOrderId' | 'colorTag'>>;

export const PACKAGE_COLORS = ['blue', 'orange', 'violet', 'emerald', 'rose', 'cyan'] as const;
export type PackageColor = (typeof PACKAGE_COLORS)[number];

export const COLOR_SWATCH: Record<PackageColor, string> = {
  blue: '#2e7dff',
  orange: '#ff7a29',
  violet: '#8b5cf6',
  emerald: '#34d399',
  rose: '#fb7185',
  cyan: '#22d3ee',
};
