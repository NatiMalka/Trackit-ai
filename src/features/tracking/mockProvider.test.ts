import { describe, expect, it } from 'vitest';
import { mockProvider, MOCK_SCENARIO_HINTS } from './mockProvider';
import { currentStage, derivePackageState } from './normalize';

describe('mockProvider', () => {
  it('is deterministic for a given tracking number', async () => {
    const a = await mockProvider.track('LP00123456789012');
    const b = await mockProvider.track('LP00123456789012');
    expect(a.events.map((e) => e.rawText)).toEqual(b.events.map((e) => e.rawText));
    expect(a.carrier).toBe(b.carrier);
  });

  it('reports not-found for the reserved numbers', async () => {
    const result = await mockProvider.track('00000000');
    expect(result.notFound).toBe(true);
    expect(result.events).toHaveLength(0);
  });

  it('only emits scans whose time has already passed', async () => {
    const { events } = await mockProvider.track('LP00987654321098');
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(Date.parse(event.at)).toBeLessThanOrEqual(Date.now() + 1000);
    }
  });

  it('matches the scenario to a recognised marketplace format', async () => {
    const result = await mockProvider.track('SH1234567890');
    expect(result.source).toBe('shein');
  });

  describe.each(MOCK_SCENARIO_HINTS)('forced scenario $example', ({ example, id }) => {
    it('produces the journey it advertises', async () => {
      const { events } = await mockProvider.track(example);
      const stage = currentStage(events);

      // DEMO numbers skip the age jitter, so each one lands on exactly one stage.
      const expected: Record<string, string> = {
        'ali-happy': 'DELIVERED',
        'ali-customs': 'CUSTOMS',
        // The silent-flight scenario sits on the international leg by design.
        'ali-blackhole': 'INTERNATIONAL',
        'shein-pickup': 'AWAITING_PICKUP',
        'amazon-lastmile': 'LOCAL_DELIVERY',
        'label-only': 'CREATED',
        'failed-delivery': 'EXCEPTION',
        returned: 'RETURNED',
      };

      expect(stage).toBe(expected[id]);
    });
  });

  it('never rewinds the progress ring on the failed-delivery scenario', async () => {
    const forced = MOCK_SCENARIO_HINTS.find((s) => s.id === 'failed-delivery')!;
    const { events } = await mockProvider.track(forced.example);
    const derived = derivePackageState(events);
    expect(derived.stage).toBe('EXCEPTION');
    expect(derived.maxLadderIndex).toBeGreaterThanOrEqual(4);
  });

  it('sets a pickup deadline on the awaiting-pickup scenario', async () => {
    const forced = MOCK_SCENARIO_HINTS.find((s) => s.id === 'shein-pickup')!;
    const { events } = await mockProvider.track(forced.example);
    const derived = derivePackageState(events);
    expect(derived.stage).toBe('AWAITING_PICKUP');
    expect(derived.deadlineAt).toBeDefined();
  });
});
