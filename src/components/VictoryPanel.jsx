import { calculateIncome } from '../game/economy';
import { CopyBtn } from './CopyBtn';
import { Icon, Icons } from './Icons';

export function VictoryPanel({ roomData, roomCode, leaveRoom, message, setMessage, submitMessage, chatEndRef }) {
  const winner = roomData.players?.[roomData.winnerId];
  const standings = Object.values(roomData.players || {}).sort((first, second) => {
    const regionDifference = (second.regionIds?.length || 0) - (first.regionIds?.length || 0);
    return regionDifference || (second.money || 0) - (first.money || 0);
  });
  return (
    <main className="aop-complete-screen aop-desk">
      <section className="aop-complete-sheet aop-victory-sheet">
        <div className="aop-label">Sefer Tamamlandı</div>
        <h1 className="aop-title">{winner?.name || 'Komutan'} zafer kazandı</h1>
        <p className="aop-complete-copy">Son etkin bölge sahibi savaş masasını mühürledi. Sonuçlar ve istihbarat hattı bütün seyircilere açık kalır.</p>
        <div className="aop-complete-room"><span>Oda {roomCode}</span><CopyBtn code={roomCode}/></div>
        <div className="aop-result-ledger">
          <div className="aop-result-header"><span>Komutan</span><span>Durum</span><span>Bölge</span><span>Tur Geliri</span></div>
          {standings.map((player) => (
            <div className="aop-result-row" key={player.id}>
              <span className="aop-result-player"><i style={{ backgroundColor: player.color }}/>{player.name}</span>
              <strong>{player.id === roomData.winnerId ? 'GALİP' : player.eliminated ? 'ELENDİ' : 'SEYİRCİ'}</strong>
              <strong>{player.regionIds?.length || 0}</strong>
              <strong>+{calculateIncome(roomData.mapDefinition, roomData.claims, player.id).toLocaleString('tr-TR')}</strong>
            </div>
          ))}
        </div>
        <section className="aop-victory-chat" aria-label="Zafer sonrası istihbarat hattı">
          <div className="aop-label">İstihbarat Hattı</div>
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
            <input className="aop-input" maxLength={160} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Mesaj…" aria-label="Zafer sonrası mesaj"/>
            <button className="aop-button-secondary" aria-label="Mesaj gönder">Gönder</button>
          </form>
        </section>
        <button onClick={leaveRoom} className="aop-button-secondary aop-complete-leave"><Icon p={Icons.LogOut} s={18}/> Odadan Ayrıl</button>
      </section>
    </main>
  );
}
