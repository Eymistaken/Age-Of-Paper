const SEEN_LIMIT = 200;

function messageId(message, index) {
  return message?.id || `${message?.senderId || message?.s || 'unknown'}:${message?.createdAt || index}`;
}

export function unreadStorageKey(roomCode, userId) {
  return `age-of-paper:unread:${roomCode}:${userId}`;
}

export function initializeUnreadState(stored, messages = []) {
  if (stored && Array.isArray(stored.seenIds)) {
    return { seenIds: stored.seenIds.slice(-SEEN_LIMIT), unread: Math.max(0, Number(stored.unread) || 0) };
  }
  return { seenIds: messages.map(messageId).slice(-SEEN_LIMIT), unread: 0 };
}

export function updateUnreadState(state, messages = [], userId, chatVisible) {
  const seen = new Set(state?.seenIds || []);
  let unread = chatVisible ? 0 : Math.max(0, state?.unread || 0);
  messages.forEach((message, index) => {
    const id = messageId(message, index);
    if (seen.has(id)) return;
    seen.add(id);
    const senderId = message.senderId || message.uid;
    if (!chatVisible && senderId && senderId !== userId) unread += 1;
  });
  return { seenIds: [...seen].slice(-SEEN_LIMIT), unread };
}

export function readStoredUnread(storage, key, messages) {
  try {
    const raw = storage?.getItem(key);
    return initializeUnreadState(raw ? JSON.parse(raw) : null, messages);
  } catch {
    return initializeUnreadState(null, messages);
  }
}

export function writeStoredUnread(storage, key, state) {
  try {
    storage?.setItem(key, JSON.stringify(state));
  } catch {
    // Storage can be disabled in private browsing; unread state remains in memory.
  }
}
