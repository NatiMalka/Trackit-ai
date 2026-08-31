import { describe, expect, it } from 'vitest';
import { stripUndefinedDeep } from './repository';

describe('stripUndefinedDeep', () => {
  it('drops undefined on nested tracking events so Firestore will accept the write', () => {
    const cleaned = stripUndefinedDeep({
      stage: 'ORIGIN_TRANSIT',
      deadlineAt: undefined,
      events: [
        {
          at: '2026-08-30T04:52:38.000Z',
          rawText: 'Received by warehouse',
          location: undefined,
          countryCode: undefined,
          carrier: 'cainiao',
          stage: 'ORIGIN_TRANSIT',
        },
      ],
    });

    expect(cleaned).toEqual({
      stage: 'ORIGIN_TRANSIT',
      events: [
        {
          at: '2026-08-30T04:52:38.000Z',
          rawText: 'Received by warehouse',
          carrier: 'cainiao',
          stage: 'ORIGIN_TRANSIT',
        },
      ],
    });
  });
});
