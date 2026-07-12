import { describe, expect, it } from 'vitest';
import { revealEditorBounds } from './editorCamera';

describe('terrain editor viewBox reveal', () => {
  const world = { x: 100, y: 50, width: 1000, height: 500 };

  it('preserves the exact camera object when target bounds are already visible', () => {
    const camera = { x: 200, y: 100, width: 400, height: 200 };
    expect(revealEditorBounds(camera, { x: 250, y: 130, width: 60, height: 40 }, world)).toBe(camera);
  });

  it('centers an outside target in viewBox space while preserving zoom and clamping', () => {
    const camera = { x: 100, y: 50, width: 300, height: 150 };
    const revealed = revealEditorBounds(camera, { x: 1010, y: 450, width: 40, height: 30 }, world);
    expect(revealed.width).toBe(camera.width);
    expect(revealed.height).toBe(camera.height);
    expect(revealed.x).toBe(800);
    expect(revealed.y).toBe(390);
  });
});
