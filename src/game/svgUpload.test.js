import { describe, expect, it } from 'vitest';
import { MAX_SVG_FILE_SIZE, validateSvgFile } from './svgUpload';

function file(overrides = {}) {
  return { name: 'map.svg', type: 'image/svg+xml', size: 100, ...overrides };
}

describe('SVG upload validation', () => {
  it('accepts one SVG file for the shared import pipeline', () => {
    expect(validateSvgFile(file()).name).toBe('map.svg');
  });

  it('rejects the wrong file type', () => {
    expect(() => validateSvgFile(file({ name: 'map.png', type: 'image/png' }))).toThrow('Yalnızca SVG');
  });

  it('rejects an oversized SVG', () => {
    expect(() => validateSvgFile(file({ size: MAX_SVG_FILE_SIZE + 1 }))).toThrow('en fazla');
  });
});
