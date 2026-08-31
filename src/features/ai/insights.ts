import { MS_DAY } from '../../lib/format';
import { detectCarrier, normalizeTrackingNumber, type Source } from '../tracking/carriers';
import { assessHealth as assessHealthLocally, estimateEta, hashEvents } from '../tracking/normalize';
import { stageMeta } from '../tracking/stages';
import type { AiInsight, EtaWindow, HealthState, TrackedPackage } from '../tracking/types';
import { GEMINI_MODEL, generateJson, isAiAvailable, Schema } from './gemini';
import { etaPrompt, explainPrompt, healthPrompt, parsePrompt } from './prompts';

/**
 * The AI layer.
 *
 * Every function here has a deterministic fallback and returns the same shape
 * either way, so the UI is identical with AI on or off. Results are cached
 * against a hash of the event log, which means a package costs tokens once per
 * genuine status change rather than once per render.
 */

// --- Schemas ---------------------------------------------------------------

const explainSchema = Schema.object({
  properties: {
    headline: Schema.string({ description: 'משפט אחד, עד 90 תווים' }),
    meaning: Schema.string({ description: 'שני משפטים' }),
    nextStep: Schema.string({ description: 'פעולה נדרשת, או מחרוזת ריקה' }),
  },
});

const etaSchema = Schema.object({
  properties: {
    fromDays: Schema.integer(),
    toDays: Schema.integer(),
    confidence: Schema.enumString({ enum: ['low', 'medium', 'high'] }),
    reasoning: Schema.string(),
  },
});

const healthSchema = Schema.object({
  properties: {
    state: Schema.enumString({ enum: ['normal', 'slow', 'stuck', 'problem'] }),
    advice: Schema.string(),
  },
});

const parseSchema = Schema.object({
  properties: {
    packages: Schema.array({
      items: Schema.object({
        properties: {
          trackingNumber: Schema.string(),
          carrierGuess: Schema.string(),
          source: Schema.enumString({ enum: ['aliexpress', 'shein', 'amazon', 'temu', 'ebay', 'other'] }),
          itemName: Schema.string(),
        },
      }),
    }),
  },
});

// --- explainStatus ---------------------------------------------------------

interface ExplainResult {
  headline: string;
  meaning: string;
  nextStep: string;
}

/**
 * Turns the raw event log into the headline card.
 *
 * Returns a complete insight even with AI unavailable, built from the stage
 * metadata and the deterministic health verdict.
 */
export async function buildInsight(pkg: TrackedPackage): Promise<AiInsight> {
  const eventsHash = hashEvents(pkg.events);
  const localHealth = assessHealthLocally(pkg);
  const meta = stageMeta(pkg.stage);

  const fallback: AiInsight = {
    eventsHash,
    headline: meta.headline,
    meaning: meta.plain,
    nextStep: localHealth.state === 'normal' ? undefined : localHealth.advice,
    eta: pkg.eta ?? estimateEta(pkg.stage, pkg.lastEventAt),
    health: { state: localHealth.state, advice: localHealth.advice },
    generatedAt: new Date().toISOString(),
    model: 'local',
  };

  if (!isAiAvailable() || pkg.events.length === 0) return fallback;

  // One call, not three: parallel explain+eta+health was 3× the timeout and
  // made the card sit on a skeleton until Gemini gave up. The deterministic
  // ETA and health verdicts are already good; Gemini's job is the headline.
  const explain = await generateJson<ExplainResult>(explainPrompt(pkg), explainSchema);

  if (!explain) return fallback;

  return {
    eventsHash,
    headline: explain.headline?.trim() || fallback.headline,
    meaning: explain.meaning?.trim() || fallback.meaning,
    nextStep: explain.nextStep?.trim() || fallback.nextStep,
    eta: fallback.eta,
    health: fallback.health,
    generatedAt: new Date().toISOString(),
    model: GEMINI_MODEL,
  };
}

/** True when the cached insight still matches the current event log. */
export function isInsightFresh(pkg: TrackedPackage) {
  if (!pkg.ai) return false;
  if (pkg.ai.eventsHash !== hashEvents(pkg.events)) return false;
  // A local fallback is retried, but not on every screen visit — that was
  // hanging the card on a 35s timeout three times a day.
  if (pkg.ai.model === 'local' && isAiAvailable()) {
    const age = Date.now() - Date.parse(pkg.ai.generatedAt);
    return Number.isFinite(age) && age < 30 * 60 * 1000;
  }
  return true;
}

// --- predictEta ------------------------------------------------------------

interface EtaResult {
  fromDays: number;
  toDays: number;
  confidence: 'low' | 'medium' | 'high';
  reasoning: string;
}

export async function predictEta(pkg: TrackedPackage): Promise<EtaWindow | undefined> {
  // Matches estimateEta: no arrival window once the parcel has stopped moving.
  if (pkg.stage === 'DELIVERED' || pkg.stage === 'RETURNED' || pkg.stage === 'AWAITING_PICKUP') {
    return undefined;
  }

  const result = await generateJson<EtaResult>(etaPrompt(pkg), etaSchema);
  if (!result) return estimateEta(pkg.stage, pkg.lastEventAt);

  // Guard against an inverted or absurd window; a wrong ETA erodes trust faster
  // than a vague one.
  const from = Math.max(0, Math.min(result.fromDays, result.toDays));
  const to = Math.min(120, Math.max(result.fromDays, result.toDays, from + 1));

  return {
    from: new Date(Date.now() + from * MS_DAY).toISOString(),
    to: new Date(Date.now() + to * MS_DAY).toISOString(),
    confidence: result.confidence,
  };
}

// --- assessHealth ----------------------------------------------------------

export async function assessHealthWithAi(
  pkg: TrackedPackage,
): Promise<{ state: HealthState; advice: string } | undefined> {
  const local = assessHealthLocally(pkg);
  const result = await generateJson<{ state: HealthState; advice: string }>(healthPrompt(pkg), healthSchema);
  if (!result?.advice) return { state: local.state, advice: local.advice };

  // The deterministic verdict wins on hard facts: a delivered or returned
  // package is not open to interpretation.
  const state = local.state === 'problem' ? 'problem' : result.state;
  return { state, advice: result.advice.trim() };
}

// --- parseAnything ---------------------------------------------------------

export interface ParsedPackage {
  trackingNumber: string;
  carrier: string;
  source: Source;
  itemName?: string;
  /** True when only the regex extractor found it, so the UI can flag uncertainty. */
  local?: boolean;
}

interface ParseResult {
  packages: Array<{
    trackingNumber: string;
    carrierGuess: string;
    source: Source;
    itemName: string;
  }>;
}

/**
 * Extracts packages from pasted text.
 *
 * The regex extractor runs first and always: it is instant and catches the
 * common case of a bare tracking number. Gemini then adds the things a regex
 * cannot do — reading the item name out of prose and picking the right
 * marketplace out of a long email. A paste that is only numbers skips Gemini
 * entirely, so add-package never waits on a 20s timeout for nothing.
 */
/**
 * True when the paste is just tracking numbers (maybe commas/whitespace), so
 * Gemini has nothing extra to extract and must not be waited on.
 */
function isBareTrackingPaste(text: string, numbers: string[]): boolean {
  let leftover = text;
  for (const n of numbers) leftover = leftover.replace(new RegExp(n, 'ig'), '');
  return leftover.replace(/[\s,;:.\-_/]/g, '').length < 8;
}

export async function parseAnything(
  text: string,
  localExtract: (t: string) => string[],
): Promise<ParsedPackage[]> {
  const localNumbers = localExtract(text);
  const localResults: ParsedPackage[] = localNumbers.map((tn) => {
    const guess = detectCarrier(tn);
    return {
      trackingNumber: tn,
      carrier: guess?.carrier ?? 'unknown',
      source: guess?.source ?? 'other',
      local: true,
    };
  });

  if (!isAiAvailable() || text.trim().length < 12) return localResults;

  // A paste that is only tracking numbers does not need Gemini — the regex
  // already has the answer, and waiting 35s for a timeout is the whole bug.
  if (localResults.length > 0 && isBareTrackingPaste(text, localNumbers)) return localResults;

  const result = await generateJson<ParseResult>(parsePrompt(text), parseSchema, 0.1);
  if (!result?.packages?.length) return localResults;

  const merged = new Map<string, ParsedPackage>();
  for (const local of localResults) merged.set(local.trackingNumber, local);

  for (const item of result.packages) {
    const tn = normalizeTrackingNumber(item.trackingNumber ?? '');
    if (tn.length < 6) continue;

    const guess = detectCarrier(tn);
    const existing = merged.get(tn);
    merged.set(tn, {
      trackingNumber: tn,
      // A pattern match beats the model's guess, since patterns are exact.
      carrier: guess?.carrier ?? existing?.carrier ?? 'unknown',
      source: guess?.source ?? item.source ?? existing?.source ?? 'other',
      itemName: item.itemName?.trim() || existing?.itemName,
      local: false,
    });
  }

  return [...merged.values()];
}
