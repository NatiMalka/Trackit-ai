import { describe, expect, it } from 'vitest';
import { decideNotifications } from './rules';
import { DEFAULT_PREFS } from './prefs';

const base = {
  packageId: 'abc123',
  title: 'אוזניות',
  previousStage: 'INTERNATIONAL' as const,
  stage: 'INTERNATIONAL' as const,
};

describe('decideNotifications', () => {
  it('stays silent when nothing changed', () => {
    expect(decideNotifications(base, DEFAULT_PREFS)).toHaveLength(0);
  });

  it('stays silent on routine transit scans', () => {
    // The reason people mute other trackers: a notification per facility scan.
    const decisions = decideNotifications(
      { ...base, previousStage: 'PICKED_UP', stage: 'ORIGIN_TRANSIT' },
      DEFAULT_PREFS,
    );
    expect(decisions).toHaveLength(0);
  });

  it('announces arrival in Israel', () => {
    const [decision] = decideNotifications({ ...base, stage: 'ARRIVED_IL' }, DEFAULT_PREFS);
    expect(decision.kind).toBe('stage');
    expect(decision.title).toContain('נחתה בישראל');
    expect(decision.url).toBe('/p/abc123');
  });

  it('deep-links to the package', () => {
    const [decision] = decideNotifications({ ...base, stage: 'DELIVERED' }, DEFAULT_PREFS);
    expect(decision.url).toBe('/p/abc123');
  });

  it('sends exactly three escalating pickup reminders', () => {
    const forDay = (daysUntilDeadline: number) =>
      decideNotifications(
        { ...base, previousStage: 'AWAITING_PICKUP', stage: 'AWAITING_PICKUP', daysUntilDeadline },
        DEFAULT_PREFS,
      ).filter((d) => d.kind === 'pickup-deadline');

    expect(forDay(5)).toHaveLength(0);
    expect(forDay(3)).toHaveLength(1);
    expect(forDay(2)).toHaveLength(0);
    expect(forDay(1)).toHaveLength(1);
    expect(forDay(0)).toHaveLength(1);
    expect(forDay(0)[0].body).toContain('מוחזרת לשולח');
  });

  it('respects the pickup-reminder toggle', () => {
    const decisions = decideNotifications(
      { ...base, previousStage: 'AWAITING_PICKUP', stage: 'AWAITING_PICKUP', daysUntilDeadline: 1 },
      { ...DEFAULT_PREFS, pickupReminders: false },
    );
    expect(decisions.filter((d) => d.kind === 'pickup-deadline')).toHaveLength(0);
  });

  it('alerts on a stuck package but only once a week', () => {
    const at = (daysSilent: number) =>
      decideNotifications({ ...base, healthState: 'stuck', daysSilent }, DEFAULT_PREFS).find(
        (d) => d.kind === 'stuck',
      );

    const first = at(21);
    const sameWeek = at(23);
    const nextWeek = at(28);

    expect(first?.dedupeKey).toBe(sameWeek?.dedupeKey);
    expect(first?.dedupeKey).not.toBe(nextWeek?.dedupeKey);
  });

  it('does not alert on a healthy package', () => {
    const decisions = decideNotifications({ ...base, healthState: 'normal', daysSilent: 12 }, DEFAULT_PREFS);
    expect(decisions.filter((d) => d.kind === 'stuck')).toHaveLength(0);
  });

  it('gives every decision a distinct dedupe key', () => {
    const decisions = decideNotifications(
      {
        ...base,
        previousStage: 'ARRIVED_IL',
        stage: 'AWAITING_PICKUP',
        daysUntilDeadline: 1,
        healthState: 'stuck',
        daysSilent: 20,
      },
      DEFAULT_PREFS,
    );
    const keys = decisions.map((d) => d.dedupeKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBe(3);
  });
});
