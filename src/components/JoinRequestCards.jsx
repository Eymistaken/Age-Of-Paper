import { getJoinVoteSummary, valueMillis } from '../game/joinRequests';

function requestAge(request, now) {
  const remaining = Math.max(0, Math.ceil((valueMillis(request.expiresAt) - now) / 60000));
  return remaining > 0 ? `${remaining} dk kaldı` : 'Süresi doluyor';
}

export const JoinRequestCards = ({
  requests,
  roomData,
  userId,
  isHost,
  now,
  actionPending,
  onApprove,
  onReject,
  compact = false,
}) => (
  <section className={`aop-join-requests ${compact ? 'is-compact' : ''}`} aria-label="Katılma istekleri">
    <span className="sr-only" aria-live="polite">
      {requests.length ? `${requests.length} bekleyen katılma isteği var.` : 'Bekleyen katılma isteği yok.'}
    </span>
    {!requests.length && compact && <p className="aop-request-empty">Bekleyen katılma isteği yok.</p>}
    {requests.map((request) => {
      const summary = getJoinVoteSummary(roomData, request);
      const approved = request.approvals?.[userId] === true;
      const rejected = request.rejections?.[userId] === true;
      return (
        <article key={request.uid} className="aop-request-card">
          <div className="aop-request-heading">
            <span className="aop-player-seal">{request.name?.[0] || '?'}</span>
            <div><strong>{request.name}</strong><small>Oyuna katılmak istiyor · {requestAge(request, now)}</small></div>
          </div>
          <div className="aop-request-votes">
            <span>{summary.approvedCount}/{summary.requiredCount} kabul</span>
            {summary.rejections.length > 0 && <span>{summary.rejections.length} ret</span>}
          </div>
          {isHost && <p>Kurucu kabulü komutanı hemen oyuna alır.</p>}
          <div className="aop-request-actions">
            <button
              onClick={() => onApprove(request.uid)}
              disabled={actionPending || (!isHost && approved)}
              className="aop-action aop-action-success"
            >{isHost ? 'Kabul Et' : (approved ? 'Kabul Edildi' : 'Kabul')}</button>
            <button
              onClick={() => onReject(request.uid)}
              disabled={actionPending || (!isHost && rejected)}
              className="aop-button-secondary"
            >{isHost ? 'İsteği Reddet' : (rejected ? 'Reddedildi' : 'Reddet')}</button>
          </div>
        </article>
      );
    })}
  </section>
);
