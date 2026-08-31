import { describe, expect, it } from 'vitest';
import {
  assessHealth,
  classifyEvent,
  countryFromLocation,
  currentStage,
  daysUntilDeadline,
  estimateEta,
  groupIntoLegs,
  hashEvents,
  maxLadderIndex,
  normalizeEvents,
  pickupDeadline,
  PICKUP_WINDOW_DAYS,
} from './normalize';
import { detectCarrier, extractTrackingNumbers, normalizeTrackingNumber } from './carriers';
import { daysBetween as calendarDaysBetween, MS_DAY } from '../../lib/format';
import type { TrackedPackage, TrackingEvent } from './types';

const daysAgo = (n: number) => new Date(Date.now() - n * MS_DAY).toISOString();

describe('classifyEvent', () => {
  it('maps AliExpress Selection Standard copy onto the ladder', () => {
    expect(classifyEvent('Package arrived at consolidation warehouse.')).toBe('ORIGIN_TRANSIT');
    expect(classifyEvent('Package left sorting center of origin.')).toBe('ORIGIN_TRANSIT');
    expect(classifyEvent('Package received by sorting center of origin.')).toBe('ORIGIN_TRANSIT');
    expect(classifyEvent('Package collected by carrier.')).toBe('PICKED_UP');
    expect(classifyEvent("Your order's been created")).toBe('CREATED');
  });

  it('maps the Ship24 Cainiao wording for the same AliExpress parcel', () => {
    expect(classifyEvent('Received by warehouse')).toBe('ORIGIN_TRANSIT');
    expect(classifyEvent('[Yiwu] Departed from sorting center')).toBe('ORIGIN_TRANSIT');
    expect(classifyEvent('[Yiwu] Processing at sorting center')).toBe('ORIGIN_TRANSIT');
    expect(classifyEvent('Received by logistics company')).toBe('PICKED_UP');
    expect(classifyEvent('Arrived at warehouse')).toBe('PICKED_UP');
  });

  it('maps English carrier vocabulary onto the ladder', () => {
    expect(classifyEvent('Shipping label created')).toBe('CREATED');
    expect(classifyEvent('Shipment picked up', 'Guangzhou, CN')).toBe('PICKED_UP');
    expect(classifyEvent('Arrived at sorting center', 'Guangzhou, CN')).toBe('ORIGIN_TRANSIT');
    expect(classifyEvent('Loaded on flight', 'Hong Kong, HK')).toBe('INTERNATIONAL');
    expect(classifyEvent('Arrived in destination country', 'Ben Gurion Airport, IL')).toBe('ARRIVED_IL');
    expect(classifyEvent('Held in customs', 'Modiin, IL')).toBe('CUSTOMS');
    expect(classifyEvent('Out for delivery', 'Tel Aviv, IL')).toBe('LOCAL_DELIVERY');
    expect(classifyEvent('Delivered', 'Tel Aviv, IL')).toBe('DELIVERED');
  });

  it('maps Chinese carrier vocabulary onto the ladder', () => {
    expect(classifyEvent('电子信息已上传', 'Guangzhou, CN')).toBe('CREATED');
    expect(classifyEvent('揽收成功', 'Guangzhou, CN')).toBe('PICKED_UP');
    expect(classifyEvent('运输中', 'Shenzhen, CN')).toBe('ORIGIN_TRANSIT');
    expect(classifyEvent('已签收')).toBe('DELIVERED');
    expect(classifyEvent('退回')).toBe('RETURNED');
  });

  it('maps Hebrew carrier vocabulary onto the ladder', () => {
    expect(classifyEvent('יצא לחלוקה', 'תל אביב, ישראל')).toBe('LOCAL_DELIVERY');
    expect(classifyEvent('ממתין לאיסוף בסניף', 'פתח תקווה, ישראל')).toBe('AWAITING_PICKUP');
    expect(classifyEvent('נמסר לנמען', 'חיפה, ישראל')).toBe('DELIVERED');
    expect(classifyEvent('הוחזר לשולח')).toBe('RETURNED');
  });

  it('does not read a failed attempt as a delivery', () => {
    expect(classifyEvent('Delivery attempt failed', 'Beer Sheva, IL')).toBe('EXCEPTION');
    expect(classifyEvent('Item not delivered — undeliverable')).toBe('EXCEPTION');
  });

  it('resolves ambiguous transit vocabulary using the country', () => {
    // The same phrase means origin handling in China and local handling in Israel.
    expect(classifyEvent('Arrived at facility', 'Guangzhou, CN')).toBe('ORIGIN_TRANSIT');
    expect(classifyEvent('Arrived at facility', 'מודיעין, ישראל')).toBe('ARRIVED_IL');
  });

  it('prefers awaiting-pickup over local delivery when both could match', () => {
    expect(classifyEvent('Available for pickup at post office', 'Tel Aviv, IL')).toBe('AWAITING_PICKUP');
  });

  it('falls back to UNKNOWN rather than guessing', () => {
    expect(classifyEvent('Administrative note 4471')).toBe('UNKNOWN');
  });
});

describe('countryFromLocation', () => {
  it('resolves Hebrew and English place names', () => {
    expect(countryFromLocation('תל אביב, ישראל')).toBe('IL');
    expect(countryFromLocation('Guangzhou, CN')).toBe('CN');
    expect(countryFromLocation('Leipzig, DE')).toBe('DE');
  });

  it('falls back to a trailing country code', () => {
    expect(countryFromLocation('Somewhere Nobody Lists, SG')).toBe('SG');
  });

  it('returns undefined when there is nothing to go on', () => {
    expect(countryFromLocation(undefined)).toBeUndefined();
    expect(countryFromLocation('Facility 12')).toBeUndefined();
  });
});

describe('normalizeEvents', () => {
  it('sorts newest first and resolves countries', () => {
    const events = normalizeEvents([
      { at: daysAgo(5), rawText: 'Picked up', location: 'Guangzhou, CN' },
      { at: daysAgo(1), rawText: 'Out for delivery', location: 'תל אביב, ישראל' },
      { at: daysAgo(3), rawText: 'Loaded on flight', location: 'Hong Kong, HK' },
    ]);

    expect(events.map((e) => e.stage)).toEqual(['LOCAL_DELIVERY', 'INTERNATIONAL', 'PICKED_UP']);
    expect(events[0].countryCode).toBe('IL');
  });
});

describe('currentStage', () => {
  const build = (specs: Array<[days: number, text: string, loc?: string]>): TrackingEvent[] =>
    normalizeEvents(specs.map(([d, rawText, location]) => ({ at: daysAgo(d), rawText, location })));

  it('ignores a trailing administrative scan', () => {
    // Carriers routinely append a meaningless scan after a real status change;
    // taking the literal newest event would wipe out the stage.
    const events = build([
      [2, 'Out for delivery', 'תל אביב, ישראל'],
      [1, 'Administrative note 4471'],
    ]);
    expect(events[0].stage).toBe('UNKNOWN');
    expect(currentStage(events)).toBe('LOCAL_DELIVERY');
  });

  it('treats delivery as terminal regardless of later noise', () => {
    const events = build([
      [4, 'Delivered', 'חיפה, ישראל'],
      [1, 'Arrived at facility', 'מודיעין, ישראל'],
    ]);
    expect(currentStage(events)).toBe('DELIVERED');
  });

  it('reports UNKNOWN with no events', () => {
    expect(currentStage([])).toBe('UNKNOWN');
  });
});

describe('maxLadderIndex', () => {
  it('remembers the furthest rung reached even after an exception', () => {
    const events = normalizeEvents([
      { at: daysAgo(6), rawText: 'Out for delivery', location: 'באר שבע, ישראל' },
      { at: daysAgo(2), rawText: 'Delivery attempt failed', location: 'באר שבע, ישראל' },
    ]);
    expect(currentStage(events)).toBe('EXCEPTION');
    // LOCAL_DELIVERY is index 6, so the progress ring must not rewind to zero.
    expect(maxLadderIndex(events)).toBe(6);
  });
});

describe('pickupDeadline', () => {
  it('starts a 14-day clock from the pickup scan', () => {
    const events = normalizeEvents([
      { at: daysAgo(4), rawText: 'ממתין לאיסוף בסניף', location: 'פתח תקווה, ישראל' },
    ]);
    const deadline = pickupDeadline(events, 'AWAITING_PICKUP');
    expect(deadline).toBeDefined();
    expect(daysUntilDeadline(deadline)).toBe(PICKUP_WINDOW_DAYS - 4);
  });

  it('produces no deadline for other stages', () => {
    const events = normalizeEvents([{ at: daysAgo(1), rawText: 'Out for delivery', location: 'תל אביב, ישראל' }]);
    expect(pickupDeadline(events, 'LOCAL_DELIVERY')).toBeUndefined();
  });
});

describe('assessHealth', () => {
  const pkg = (stage: TrackedPackage['stage'], silentDays: number) => ({
    stage,
    events: [],
    lastEventAt: daysAgo(silentDays),
  });

  it('calls a fresh package normal', () => {
    expect(assessHealth(pkg('ORIGIN_TRANSIT', 1)).state).toBe('normal');
  });

  it('tolerates long silence on the international leg', () => {
    // The single most common false alarm in other trackers.
    expect(assessHealth(pkg('INTERNATIONAL', 14)).state).toBe('normal');
  });

  it('escalates through slow to stuck', () => {
    expect(assessHealth(pkg('ORIGIN_TRANSIT', 9)).state).toBe('slow');
    expect(assessHealth(pkg('ORIGIN_TRANSIT', 22)).state).toBe('stuck');
  });

  it('treats a returned package as a problem, not as silence', () => {
    const health = assessHealth(pkg('RETURNED', 1));
    expect(health.state).toBe('problem');
    expect(health.advice).toContain('החזר');
  });

  it('never flags a delivered package', () => {
    expect(assessHealth(pkg('DELIVERED', 400)).state).toBe('normal');
  });
});

describe('estimateEta', () => {
  it('produces an ordered future window while in transit', () => {
    const eta = estimateEta('INTERNATIONAL', daysAgo(3));
    expect(eta).toBeDefined();
    expect(Date.parse(eta!.from)).toBeLessThanOrEqual(Date.parse(eta!.to));
    expect(Date.parse(eta!.from)).toBeGreaterThan(Date.now());
  });

  it('shrinks the window as the package gets closer', () => {
    const far = estimateEta('ORIGIN_TRANSIT', daysAgo(1))!;
    const near = estimateEta('LOCAL_DELIVERY', daysAgo(1))!;
    expect(Date.parse(near.to)).toBeLessThan(Date.parse(far.to));
  });

  it('gives no ETA once the parcel has stopped moving on its own', () => {
    expect(estimateEta('DELIVERED', daysAgo(1))).toBeUndefined();
    expect(estimateEta('RETURNED', daysAgo(1))).toBeUndefined();
    // Waiting in a pickup point: the deadline is the date that matters, not an
    // arrival estimate.
    expect(estimateEta('AWAITING_PICKUP', daysAgo(1))).toBeUndefined();
  });

  it('does not count the pickup branch as a mandatory extra leg', () => {
    // AWAITING_PICKUP is an alternative to LOCAL_DELIVERY, so including its
    // five typical days would inflate every estimate.
    const eta = estimateEta('LOCAL_DELIVERY', daysAgo(0))!;
    expect(calendarDaysBetween(Date.now(), eta.to)).toBeLessThanOrEqual(4);
  });
});

describe('hashEvents', () => {
  it('is stable for identical logs and changes when the log does', () => {
    const at = daysAgo(2);
    const a = normalizeEvents([{ at, rawText: 'Picked up', location: 'Guangzhou, CN' }]);
    const b = normalizeEvents([{ at, rawText: 'Picked up', location: 'Guangzhou, CN' }]);
    expect(hashEvents(a)).toBe(hashEvents(b));

    const c = normalizeEvents([
      { at: daysAgo(2), rawText: 'Picked up', location: 'Guangzhou, CN' },
      { at: daysAgo(1), rawText: 'Loaded on flight', location: 'Hong Kong, HK' },
    ]);
    expect(hashEvents(c)).not.toBe(hashEvents(a));
  });

  it('distinguishes an empty log', () => {
    expect(hashEvents([])).not.toBe(hashEvents(normalizeEvents([{ at: daysAgo(1), rawText: 'Picked up' }])));
  });
});

describe('groupIntoLegs', () => {
  it('groups consecutive scans by country', () => {
    const events = normalizeEvents([
      { at: daysAgo(9), rawText: 'Picked up', location: 'Guangzhou, CN' },
      { at: daysAgo(7), rawText: 'Arrived at facility', location: 'Shenzhen, CN' },
      { at: daysAgo(3), rawText: 'Arrived in destination country', location: 'Ben Gurion Airport, IL' },
      { at: daysAgo(1), rawText: 'יצא לחלוקה', location: 'תל אביב, ישראל' },
    ]);
    const legs = groupIntoLegs(events);
    expect(legs.map((l) => l.countryCode)).toEqual(['IL', 'CN']);
    expect(legs[0].events).toHaveLength(2);
    expect(legs[1].events).toHaveLength(2);
  });

  it('treats Cainiao scans with no city as China, not an unknown leg', () => {
    const events = normalizeEvents([
      { at: daysAgo(1), rawText: 'Received by warehouse', carrier: 'cainiao' },
      { at: daysAgo(1.1), rawText: '[Yiwu] Departed from sorting center', carrier: 'cainiao' },
    ]);
    expect(events.every((e) => e.countryCode === 'CN')).toBe(true);
    expect(groupIntoLegs(events).map((l) => l.countryCode)).toEqual(['CN']);
  });
});

describe('detectCarrier', () => {
  it('recognises marketplace-specific formats', () => {
    expect(detectCarrier('LP00123456789012')).toMatchObject({ carrier: 'cainiao', source: 'aliexpress' });
    expect(detectCarrier('AP00838844708015')).toMatchObject({ carrier: 'cainiao', source: 'aliexpress' });
    expect(detectCarrier('TBA123456789')).toMatchObject({ carrier: 'amazon-logistics', source: 'amazon' });
    expect(detectCarrier('1Z999AA10123456784')).toMatchObject({ carrier: 'ups' });
  });

  it('reads the country code out of a UPU S10 number', () => {
    expect(detectCarrier('RR123456789CN')).toMatchObject({ carrier: 'china-post' });
    expect(detectCarrier('RR123456789IL')).toMatchObject({ carrier: 'israel-post' });
  });

  it('refuses to claim high confidence on a bare digit run', () => {
    expect(detectCarrier('1234567890')?.confidence).toBe('low');
  });

  it('returns null rather than guessing wildly', () => {
    expect(detectCarrier('abc')).toBeNull();
  });

  it('tolerates spaces and dashes', () => {
    expect(normalizeTrackingNumber(' lp0012-3456 789012 ')).toBe('LP00123456789012');
    expect(detectCarrier(' lp0012-3456 789012 ')).toMatchObject({ carrier: 'cainiao' });
  });
});

describe('extractTrackingNumbers', () => {
  it('pulls a tracking number out of surrounding prose', () => {
    const found = extractTrackingNumbers('Your order has shipped. Tracking: LP00123456789012. Thanks!');
    expect(found).toContain('LP00123456789012');
  });

  it('recognises an AliExpress AP number on its own', () => {
    expect(extractTrackingNumbers('AP00838844708015')).toEqual(['AP00838844708015']);
  });

  it('ignores dates and short noise', () => {
    const found = extractTrackingNumbers('Ordered 2026-03-14, total 129.90, order ref A1');
    expect(found).not.toContain('2026-03-14');
    expect(found.every((f) => f.length >= 8)).toBe(true);
  });

  it('deduplicates repeats', () => {
    const found = extractTrackingNumbers('LP00123456789012 ... again LP00123456789012');
    expect(found.filter((f) => f === 'LP00123456789012')).toHaveLength(1);
  });
});
