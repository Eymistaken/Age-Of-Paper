import { readFileSync } from 'node:fs';
import { cwd } from 'node:process';
import { describe, expect, it } from 'vitest';

const css = readFileSync(`${cwd()}/src/index.css`, 'utf8');
const waitingRoom = readFileSync(`${cwd()}/src/components/WaitingRoom.jsx`, 'utf8');

describe('naval route responsive layout contracts', () => {
  it('makes the lobby the single viewport-constrained page scroll owner', () => {
    expect(css).toMatch(/\.aop-lobby-shell\s*\{[^}]*height:\s*100dvh;[^}]*overflow-y:\s*auto;/s);
    expect(css).toMatch(/body\s*\{[^}]*overflow:\s*hidden;/s);
    expect(waitingRoom).toContain('data-testid="lobby-scroll-owner"');
    expect(waitingRoom).not.toContain('aop-naval-editor');
  });

  it('constrains the desktop dialog to the visual viewport with one controls scroller', () => {
    expect(css).toMatch(/\.aop-naval-dialog\s*\{[^}]*height:\s*min\(94dvh,[^}]*max-height:\s*calc\(100dvh - 32px\);[^}]*overflow:\s*hidden;/s);
    expect(css).toMatch(/\.aop-naval-dialog-layout\s*\{[^}]*grid-template-columns:[^}]*overflow:\s*hidden;/s);
    expect(css).toMatch(/\.aop-naval-controls\s*\{[^}]*overflow-y:\s*auto;/s);
    expect(css).toMatch(/\.aop-route-list\s*\{\s*display:\s*grid;\s*gap:/s);
  });

  it('uses a 100dvh mobile dialog with a bounded map and one scrollable lower section', () => {
    const mobile = css.slice(css.indexOf('@media (max-width: 800px)'));
    expect(mobile).toMatch(/\.aop-naval-dialog\s*\{[^}]*height:\s*100dvh;[^}]*max-height:\s*100dvh;/s);
    expect(mobile).toMatch(/grid-template-rows:\s*minmax\(220px, 44dvh\) minmax\(0, 1fr\)/);
    expect(mobile).toContain('env(safe-area-inset-bottom)');
    const landscape = css.slice(css.indexOf('@media (max-height: 600px) and (orientation: landscape) and (max-width: 900px)'));
    expect(landscape).toMatch(/\.aop-naval-dialog\s*\{[^}]*height:\s*100dvh;[^}]*max-height:\s*100dvh;/s);
  });
});
