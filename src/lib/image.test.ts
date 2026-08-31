import { describe, expect, it } from 'vitest';
import { imageErrorMessage } from './image';

describe('imageErrorMessage', () => {
  it('maps compress codes to Hebrew', () => {
    expect(imageErrorMessage(new Error('not-image'))).toMatch(/תמונה/);
    expect(imageErrorMessage(new Error('too-large'))).toMatch(/12MB/);
    expect(imageErrorMessage(new Error('too-heavy'))).toMatch(/לדחוס/);
    expect(imageErrorMessage(new Error('canvas'))).toMatch(/לקרוא/);
  });
});
