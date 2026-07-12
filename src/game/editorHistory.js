export function createHistory(document) {
  return { past: [], present: document, future: [] };
}

export function executeCommand(history, nextDocument, label = 'Düzenleme') {
  if (nextDocument === history.present) return history;
  return {
    past: [...history.past, { document: history.present, label }],
    present: nextDocument,
    future: [],
  };
}

export function undo(history) {
  const previous = history.past.at(-1);
  if (!previous) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous.document,
    future: [{ document: history.present, label: previous.label }, ...history.future],
  };
}

export function redo(history) {
  const next = history.future[0];
  if (!next) return history;
  return {
    past: [...history.past, { document: history.present, label: next.label }],
    present: next.document,
    future: history.future.slice(1),
  };
}
