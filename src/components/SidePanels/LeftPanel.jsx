import { CHAT_MESSAGE_LIMIT, OFFLINE_SKIP_TIMEOUT, PRESENCE_OFFLINE_TIMEOUT } from '../../constants';
import { Icon, Icons } from '../Icons';

function lastActiveMillis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  return typeof value === 'number' ? value : 0;
}

export const LeftPanel = ({
  roomData,
  currentPlayerId,
  isHost,
  now,
  skipPlayer,
  actionPending,
  message,
  setMessage,
  submitMessage,
  chatEndRef,
}) => {
  const activeLastSeen = lastActiveMillis(roomData.players?.[currentPlayerId]?.lastActive);
  const maySkip = isHost && currentPlayerId && now - activeLastSeen >= OFFLINE_SKIP_TIMEOUT;
  return (
    <aside className="aop-left-panel">
      <section className="aop-player-ledger">
        <div className="aop-label">Tur Defteri</div>
        <h2 className="aop-title text-2xl mb-4">Komutanlar</h2>
        <div className="space-y-2">
          {roomData.turnOrder.map((playerId) => {
            const player = roomData.players[playerId];
            if (!player) return null;
            const active = playerId === currentPlayerId;
            const offline = now - lastActiveMillis(player.lastActive) >= PRESENCE_OFFLINE_TIMEOUT;
            return (
              <div key={playerId} className={`aop-player-row ${active ? 'is-active' : ''} ${offline ? 'is-offline' : ''}`}>
                <span className="aop-player-seal" style={{ backgroundColor: player.color }}>{player.name[0]}</span>
                <span className="min-w-0 flex-1"><strong>{player.name}</strong><small>{(player.money || 0).toLocaleString('tr-TR')} altın</small></span>
                {active && <b>SIRA</b>}
                {offline ? <Icon p={Icons.WifiOff} s={15}/> : null}
              </div>
            );
          })}
        </div>
        {maySkip && (
          <button onClick={skipPlayer} disabled={actionPending} className="aop-skip-button">
            Uzun Süredir Çevrimdışı, Sırayı Geç
          </button>
        )}
      </section>

      <section className="aop-chat-panel">
        <div className="aop-label px-4 pt-4">İstihbarat Hattı</div>
        <div className="aop-chat-messages custom-scrollbar">
          {(roomData.chat || []).map((chat, index) => (
            <div key={chat.id || `${chat.s}-${index}`} className="aop-chat-message">
              <strong style={{ color: chat.senderColor || chat.c }}>{chat.senderName || chat.s}</strong>
              <span>{chat.text || chat.t}</span>
            </div>
          ))}
          <div ref={chatEndRef}/>
        </div>
        <form onSubmit={submitMessage} className="aop-chat-form">
          <input
            className="aop-input"
            placeholder="Mesaj..."
            maxLength={CHAT_MESSAGE_LIMIT}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
          <button className="aop-button-secondary" aria-label="Mesaj gönder"><Icon p={Icons.Send} s={17}/></button>
        </form>
      </section>
    </aside>
  );
};
