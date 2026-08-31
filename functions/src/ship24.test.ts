import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchTracking, releaseTracking } from './ship24';

/**
 * The Ship24 response mapping is the one seam where a third party's shape meets
 * ours, so it is worth pinning: a silent change here would show up as "no
 * events" or "שליח לא מזוהה" on a real package with no error anywhere.
 */

function respond(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function tracking(events: unknown[], courierCode?: string[]) {
  return {
    data: {
      trackings: [
        {
          tracker: { trackingNumber: 'LP00123456789012', courierCode },
          events,
        },
      ],
    },
  };
}

describe('fetchTracking', () => {
  it('maps events to the normalized shape, newest first', async () => {
    vi.stubGlobal(
      'fetch',
      respond(
        tracking([
          { occurrenceDatetime: '2026-03-01T08:00:00Z', status: 'Shipment picked up', location: 'Shenzhen' },
          { occurrenceDatetime: '2026-03-05T11:30:00Z', status: 'Arrived at destination country' },
        ]),
      ),
    );

    const result = await fetchTracking('k', 'LP00123456789012');

    expect(result.notFound).toBeFalsy();
    expect(result.events.map((e) => e.rawText)).toEqual([
      'Arrived at destination country',
      'Shipment picked up',
    ]);
    expect(result.events[0]?.at).toBe('2026-03-05T11:30:00.000Z');
    expect(result.events[1]?.location).toBe('Shenzhen');
  });

  it('translates Ship24 courier slugs into our own carrier ids', async () => {
    vi.stubGlobal(
      'fetch',
      respond(
        tracking([{ datetime: '2026-03-01T08:00:00Z', status: 'Accepted', courierCode: 'IL-ISRAELPOST' }], [
          'cn-cainiao',
        ]),
      ),
    );

    const result = await fetchTracking('k', 'LP00123456789012');

    expect(result.carrier).toBe('cainiao');
    // Case-insensitive, because Ship24 is not consistent about it.
    expect(result.events[0]?.carrier).toBe('israel-post');
  });

  it('leaves the carrier undefined for a slug we do not know, rather than guessing', async () => {
    vi.stubGlobal('fetch', respond(tracking([{ datetime: '2026-03-01T08:00:00Z', status: 'Accepted' }], ['xx-mystery'])));

    const result = await fetchTracking('k', 'LP00123456789012');

    expect(result.carrier).toBeUndefined();
  });

  it('drops events with no usable timestamp or no raw text', async () => {
    vi.stubGlobal(
      'fetch',
      respond(
        tracking([
          { occurrenceDatetime: 'not-a-date', status: 'Broken' },
          { occurrenceDatetime: '2026-03-01T08:00:00Z' },
          { occurrenceDatetime: '2026-03-02T08:00:00Z', status: 'Good' },
        ]),
      ),
    );

    const result = await fetchTracking('k', 'LP00123456789012');

    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.rawText).toBe('Good');
  });

  it('reports an unknown number as not found instead of throwing', async () => {
    vi.stubGlobal('fetch', respond({ errors: [{ message: 'no tracker' }] }, 404));

    const result = await fetchTracking('k', 'ZZ999999999ZZ');

    expect(result).toEqual({ trackingNumber: 'ZZ999999999ZZ', events: [], notFound: true });
  });

  it('reports a tracker with no scans yet as not found, so the UI can say "no updates"', async () => {
    vi.stubGlobal('fetch', respond(tracking([])));

    const result = await fetchTracking('k', 'LP00123456789012');

    expect(result.notFound).toBe(true);
  });

  it('throws on an upstream failure, so the caller can decide per package', async () => {
    vi.stubGlobal('fetch', respond({ errors: [{ message: 'rate limited' }] }, 429));

    await expect(fetchTracking('k', 'LP00123456789012')).rejects.toThrow(/429/);
  });

  it('hints Cainiao + Israel when the number is an AliExpress AP code', async () => {
    const fetchMock = respond(tracking([{ datetime: '2026-03-01T08:00:00Z', status: 'Accepted' }]));
    vi.stubGlobal('fetch', fetchMock);

    await fetchTracking('k', 'AP00838844708015');

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({
      trackingNumber: 'AP00838844708015',
      destinationCountryCode: 'IL',
      courierCode: ['cainiao'],
    });
  });

  it('falls back to an existing tracker that already has scans', async () => {
    const empty = respond(tracking([]));
    const found = respond(
      tracking([{ datetime: '2026-08-30T05:40:00Z', status: 'Package arrived at consolidation warehouse' }], [
        'cainiao',
      ]),
    );
    const fetchMock = vi
      .fn()
      .mockImplementationOnce((...args: unknown[]) => empty(...args))
      .mockImplementationOnce((...args: unknown[]) => found(...args));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchTracking('k', 'AP00838844708015');

    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/trackers/search/AP00838844708015/results');
    expect(result.notFound).toBeFalsy();
    expect(result.carrier).toBe('cainiao');
    expect(result.events[0]?.rawText).toMatch(/consolidation warehouse/i);
  });
});

describe('releaseTracking', () => {
  it('unsubscribes every Ship24 tracker for the number', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            trackings: [
              { tracker: { trackerId: 'empty-id', trackingNumber: 'AP00838844708015' }, events: [] },
              {
                tracker: { trackerId: 'cainiao-id', trackingNumber: 'AP00838844708015', courierCode: ['cainiao'] },
                events: [{ datetime: '2026-08-30T05:40:00Z', status: 'Arrived' }],
              },
            ],
          },
        }),
        text: async () => '',
      })
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({}), text: async () => '' });
    vi.stubGlobal('fetch', fetchMock);

    await releaseTracking('k', 'AP00838844708015');

    const patched = fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'PATCH');
    expect(patched).toHaveLength(2);
    expect(patched.map((c) => String(c[0]))).toEqual(
      expect.arrayContaining([
        expect.stringContaining('/trackers/empty-id'),
        expect.stringContaining('/trackers/cainiao-id'),
      ]),
    );
    expect(JSON.parse(String((patched[0]?.[1] as RequestInit).body))).toEqual({ isSubscribed: false });
  });

  it('still unsubscribes stored ids when search finds nothing', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({}),
        text: async () => '',
      })
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({}), text: async () => '' });
    vi.stubGlobal('fetch', fetchMock);

    await releaseTracking('k', 'AP00838844708015', ['known-id']);

    const patched = fetchMock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'PATCH');
    expect(String(patched?.[0])).toContain('/trackers/known-id');
  });
});
