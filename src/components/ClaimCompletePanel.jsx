import { calculateIncome } from '../game/economy';
import { CopyBtn } from './CopyBtn';
import { Icon, Icons } from './Icons';

export const ClaimCompletePanel = ({ roomData, roomCode, leaveRoom, isHost, onStart, actionPending, actionError }) => {
  const players = (roomData.turnOrder || Object.keys(roomData.players || {}))
    .map((id) => roomData.players[id])
    .filter(Boolean);
  return (
    <main className="aop-complete-screen aop-desk">
      <section className="aop-complete-sheet">
        <div className="aop-label">Harita Kaydı Mühürlendi</div>
        <h1 className="aop-title">Toprak edinme evresi tamamlandı</h1>
        <p className="aop-complete-copy">
          Haritadaki bütün oynanabilir bölgeler paylaşıldı. Edinme emirleri donduruldu. Kurucu özeti kontrol edip seferberliği başlatacak.
        </p>

        <div className="aop-complete-room">
          <span>Oda {roomCode}</span><CopyBtn code={roomCode}/>
        </div>

        <div className="aop-result-ledger">
          <div className="aop-result-header"><span>Komutan</span><span>Bölge</span><span>Tur Geliri</span><span>Hazine</span></div>
          {players.map((player) => {
            const regionCount = Object.values(roomData.claims || {}).filter((claim) => claim.ownerId === player.id).length;
            const income = Number.isFinite(player.income)
              ? player.income
              : calculateIncome(roomData.mapDefinition, roomData.claims, player.id);
            return (
              <div className="aop-result-row" key={player.id}>
                <span className="aop-result-player"><i style={{ backgroundColor: player.color }}/>{player.name}</span>
                <strong>{regionCount}</strong>
                <strong>+{income.toLocaleString('tr-TR')}</strong>
                <strong>{(player.money || 0).toLocaleString('tr-TR')}</strong>
              </div>
            );
          })}
        </div>

        {isHost ? (
          <button onClick={onStart} disabled={actionPending} className="aop-button aop-complete-start">
            {actionPending ? 'Sefer emri işleniyor…' : 'Seferberliği Başlat'}
          </button>
        ) : (
          <p className="aop-validation-note aop-complete-wait">Kurucunun “Seferberliği Başlat” emri vermesi bekleniyor.</p>
        )}
        {actionError && <p className="aop-inline-error" role="alert">{actionError}</p>}
        <button onClick={leaveRoom} className="aop-button-secondary aop-complete-leave">
          <Icon p={Icons.LogOut} s={18}/> Odadan Ayrıl
        </button>
      </section>
    </main>
  );
};
