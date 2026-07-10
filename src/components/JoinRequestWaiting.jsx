import { useEffect, useState } from 'react';
import { valueMillis } from '../game/joinRequests';
import { Icon, Icons } from './Icons';

function remainingLabel(expiresAt, now) {
  const seconds = Math.max(0, Math.ceil((valueMillis(expiresAt) - now) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

export const JoinRequestWaiting = ({ roomCode, nickname, request, loading, onCancel, onExpire }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    if (request && valueMillis(request.expiresAt) <= now) onExpire();
  }, [now, onExpire, request]);

  return (
    <main className="aop-request-waiting aop-desk">
      <section className="aop-panel aop-request-waiting-card" aria-live="polite">
        <span className="aop-player-seal large"><Icon p={Icons.User} s={25}/></span>
        <div className="aop-label">Katılma İsteği Gönderildi</div>
        <h1 className="aop-title">Onay bekleniyor</h1>
        <dl>
          <div><dt>Komutan</dt><dd>{nickname}</dd></div>
          <div><dt>Oda Kodu</dt><dd>{roomCode}</dd></div>
          <div><dt>Kalan Süre</dt><dd>{request ? remainingLabel(request.expiresAt, now) : 'Bağlanıyor…'}</dd></div>
        </dl>
        <p>Katılma isteğin oyunculara gönderildi. Kurucu veya uygun komutanların oybirliği yanıtını bekliyorsun.</p>
        <button onClick={onCancel} disabled={loading} className="aop-button-secondary">
          {loading ? 'İptal ediliyor…' : 'Vazgeç'}
        </button>
      </section>
    </main>
  );
};
