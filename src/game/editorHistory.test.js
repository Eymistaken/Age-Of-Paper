import { describe, expect, it } from 'vitest';
import { createHistory, executeCommand, redo, undo } from './editorHistory';

describe('terrain editor history', () => {
  it('undoes and redoes one immutable editor command and truncates a redo branch', () => {
    let history = createHistory({ value: 1 });
    history = executeCommand(history, { value: 2 }, 'terrain');
    history = executeCommand(history, { value: 3 }, 'port');
    history = undo(history);
    expect(history.present.value).toBe(2);
    expect(redo(history).present.value).toBe(3);
    history = executeCommand(history, { value: 9 }, 'replacement');
    expect(redo(history)).toBe(history);
  });
});
