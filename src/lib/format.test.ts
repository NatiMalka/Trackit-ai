import { describe, expect, it } from 'vitest';
import { dayCount, daysBetween, formatEtaRange, packageCount, prettyTracking, relativeDays } from './format';
import { MS_DAY } from './format';

const daysAgo = (n: number) => new Date(Date.now() - n * MS_DAY);
const daysAhead = (n: number) => new Date(Date.now() + n * MS_DAY);

describe('daysBetween', () => {
  it('ignores time of day', () => {
    expect(daysBetween(daysAgo(0))).toBe(0);
    expect(daysBetween(daysAgo(1))).toBe(1);
    expect(daysBetween(daysAgo(30))).toBe(30);
  });
});

describe('dayCount', () => {
  it('uses the Hebrew dual form', () => {
    expect(dayCount(0)).toBe('היום');
    expect(dayCount(1)).toBe('יום אחד');
    expect(dayCount(2)).toBe('יומיים');
    expect(dayCount(5)).toBe('5 ימים');
  });
});

describe('packageCount', () => {
  it('never produces "1 חבילות"', () => {
    // Hebrew puts the numeral after the noun for one and has a dual form, so a
    // naive template reads as machine output.
    expect(packageCount(1)).toBe('חבילה אחת');
    expect(packageCount(2)).toBe('שתי חבילות');
    expect(packageCount(7)).toBe('7 חבילות');
  });
});

describe('relativeDays', () => {
  it('prefers the phrasing people scan fastest', () => {
    expect(relativeDays(daysAgo(0))).toBe('היום');
    expect(relativeDays(daysAgo(1))).toBe('אתמול');
    expect(relativeDays(daysAgo(2))).toBe('לפני יומיים');
    expect(relativeDays(daysAgo(4))).toBe('לפני 4 ימים');
    expect(relativeDays(daysAgo(10))).toBe('לפני שבוע');
    expect(relativeDays(daysAgo(21))).toBe('לפני 3 שבועות');
  });
});

describe('formatEtaRange', () => {
  it('collapses a same-day window', () => {
    expect(formatEtaRange(daysAhead(0), daysAhead(0))).toBe('היום');
    expect(formatEtaRange(daysAhead(0), daysAhead(1))).toBe('היום או מחר');
  });

  it('adds a day count for a near window', () => {
    expect(formatEtaRange(daysAhead(2), daysAhead(5))).toContain('בעוד 2–5 ימים');
  });

  it('flags a window that has already passed', () => {
    expect(formatEtaRange(daysAgo(9), daysAgo(4))).toBe('חלף התאריך המשוער');
  });

  it('omits the day count for a distant window', () => {
    expect(formatEtaRange(daysAhead(20), daysAhead(40))).not.toContain('בעוד');
  });
});

describe('prettyTracking', () => {
  it('leaves the number intact so it can be compared character by character', () => {
    expect(prettyTracking(' lp00123456789012 ')).toBe('LP00123456789012');
  });
});
