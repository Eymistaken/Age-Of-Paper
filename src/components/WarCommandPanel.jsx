import { PHASES } from '../game/phases';
import { resolveDeterministicCombat } from '../game/warCombat';
import { SOLDIER_BATCH } from '../game/warConstants';
import { getWarPlanEligibility, WAR_INTERACTION_MODES } from '../game/warUiState';
import { getPlayerNavalCapability, isFinalCoastalLand } from '../game/navalPolicy';

function formatNumber(value) {
  return Number(value || 0).toLocaleString('tr-TR');
}

export function WarCommandPanel({
  roomData,
  me,
  currentPlayer,
  isMyTurn,
  selectedRegion,
  selectedClaim,
  selectedOwner,
  plan,
  setPlan,
  beginPlan,
  cancelPlan,
  actionPending,
  actionError,
  onRecruit,
  onBuildPort,
  onBuyShips,
  onReady,
  onExecuteOperation,
  onEndTurn,
  compact = false,
}) {
  const phase = roomData.phase;
  const logistics = [PHASES.MOBILIZATION, PHASES.WAR].includes(phase);
  const canCommand = isMyTurn && !me.eliminated;
  const sourceClaim = plan.sourceId ? roomData.claims?.[plan.sourceId] : null;
  const source = plan.sourceId ? roomData.mapDefinition?.regionsById?.[plan.sourceId] : null;
  const target = plan.targetId ? roomData.mapDefinition?.regionsById?.[plan.targetId] : null;
  const targetClaim = plan.targetId ? roomData.claims?.[plan.targetId] : null;
  const eligibility = getWarPlanEligibility(roomData, me.id, plan);
  const combat = plan.operation === 'attack' && targetClaim
    ? resolveDeterministicCombat(plan.amount, targetClaim.soldiers || 0)
    : null;
  const selecting = plan.mode !== WAR_INTERACTION_MODES.IDLE;
  const ownedSelection = selectedClaim?.ownerId === me.id;
  const regionMax = sourceClaim?.soldiers || selectedClaim?.soldiers || SOLDIER_BATCH;
  const navalCapability = getPlayerNavalCapability(roomData, me.id);
  const selectedEligibleCoast = isFinalCoastalLand(selectedRegion) && selectedRegion?.portAllowed !== false;

  return (
    <section className={`aop-war-orders ${compact ? 'is-compact' : ''}`}>
      <div>
        <div className="aop-label">{phase === PHASES.MOBILIZATION ? 'Seferberlik, Lojistik' : canCommand ? 'Sıra Sende, Lojistik + 1 Harekât' : `Aktif: ${currentPlayer?.name || 'Bekleniyor'}`}</div>
        <h2 className="aop-title text-2xl">{selectedRegion?.name || 'Bölge seç'}</h2>
      </div>
      {selectedRegion ? (
        <>
          <dl className="aop-war-facts">
            <div><dt>Sahibi</dt><dd>{selectedOwner?.name || 'Tarafsız'}</dd></div>
            <div><dt>Asker</dt><dd>{formatNumber(selectedClaim?.soldiers)}</dd></div>
            {navalCapability.showNavalSection && <div><dt>Kıyı</dt><dd>{isFinalCoastalLand(selectedRegion) ? 'Evet' : 'Hayır'}</dd></div>}
            {navalCapability.showNavalSection && <div><dt>Liman</dt><dd>{selectedClaim?.hasPort ? 'Var' : 'Yok'}</dd></div>}
            {navalCapability.showNavalSection && navalCapability.hasPort && <div><dt>Gemi</dt><dd>{formatNumber(selectedClaim?.ships)}</dd></div>}
            <div><dt>Gelir</dt><dd>+{formatNumber(selectedRegion.income)}</dd></div>
          </dl>
          {logistics && (
            <div className="aop-logistics-actions" aria-label="Lojistik emirleri">
              <button disabled={!canCommand || !ownedSelection || actionPending} onClick={onRecruit} title={!ownedSelection ? 'Asker yalnızca kendi bölgen için alınabilir.' : ''}>+1K Asker<br/><small>10.000 altın</small></button>
              {navalCapability.showNavalSection && !navalCapability.hasPort && selectedEligibleCoast && (
                <button disabled={!canCommand || !ownedSelection || selectedClaim?.hasPort || actionPending} onClick={onBuildPort}>Liman Kur<br/><small>30.000 altın</small></button>
              )}
              {navalCapability.showNavalSection && navalCapability.hasPort && selectedEligibleCoast && !selectedClaim?.hasPort && (
                <button disabled={!canCommand || !ownedSelection || actionPending} onClick={onBuildPort}>Liman Kur<br/><small>30.000 altın</small></button>
              )}
              {navalCapability.showNavalSection && navalCapability.hasPort && selectedClaim?.hasPort && (
                <button disabled={!canCommand || !ownedSelection || actionPending} onClick={onBuyShips}>+1 Gemi<br/><small>20.000 altın</small></button>
              )}
            </div>
          )}
        </>
      ) : <p className="aop-claim-reason">Sahiplik ve askerî durumu görmek için haritadan bir bölge seç.</p>}

      {phase === PHASES.WAR && (
        <>
          <div className="aop-operation-picker" aria-label="Harekât seçimi">
            <button disabled={!canCommand || actionPending} onClick={() => beginPlan('move', 'land')}>Kara Nakli</button>
            {navalCapability.showNavalSection && navalCapability.hasPort && <button disabled={!canCommand || actionPending} onClick={() => beginPlan('move', 'naval')}>Deniz Nakli</button>}
            <button disabled={!canCommand || actionPending} onClick={() => beginPlan('attack', 'land')}>Kara Saldırısı</button>
            {navalCapability.showNavalSection && navalCapability.hasPort && <button disabled={!canCommand || actionPending} onClick={() => beginPlan('attack', 'naval')}>Deniz Saldırısı</button>}
          </div>
          {selecting && (
            <div className="aop-operation-draft">
              <div className="aop-operation-route">
                <span><small>Kaynak</small><strong>{source?.name || 'Haritadan seç'}</strong></span>
                <b>→</b>
                <span><small>Hedef</small><strong>{target?.name || (source ? 'Haritadan seç' : 'Önce kaynak')}</strong></span>
              </div>
              <label className="aop-amount-control">
                <span>Asker Sayısı</span>
                <input
                  type="number"
                  min={SOLDIER_BATCH}
                  max={Math.max(SOLDIER_BATCH, regionMax)}
                  step={SOLDIER_BATCH}
                  value={plan.amount}
                  onChange={(event) => setPlan({ ...plan, amount: Number(event.target.value) })}
                />
              </label>
              <p className={`aop-claim-reason ${eligibility.legal ? 'is-legal' : ''}`}>{eligibility.reason || 'Harekât hazır.'}</p>
              {combat && (
                <div className="aop-attack-confirm" role="status">
                  <strong>Saldırı Onayı</strong>
                  <span>{source?.name} → {target?.name}, {formatNumber(plan.amount)} asker</span>
                  <span>Beklenen sonuç: {combat.captured ? `${target?.name} ele geçirilir, ${formatNumber(combat.attackersRemaining)} asker kalır.` : `Savunma sürer, ${formatNumber(combat.defendersRemaining)} asker kalır.`}</span>
                </div>
              )}
              <div className="aop-draft-actions">
                <button className="aop-button-secondary" onClick={cancelPlan}>Seçimi İptal Et</button>
                <button className="aop-button" disabled={!eligibility.legal || actionPending} onClick={onExecuteOperation}>
                  {actionPending ? 'Emir uygulanıyor…' : plan.operation === 'attack' ? 'Saldırıyı Onayla, Turu Bitir' : 'Nakli Uygula, Turu Bitir'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {actionError && <p className="aop-inline-error" role="alert">{actionError}</p>}
      {phase === PHASES.MOBILIZATION ? (
        <button className="aop-button aop-war-end" disabled={!canCommand || actionPending} onClick={onReady}>Hazırım, Seferberlik Turunu Bitir</button>
      ) : (
        <button className="aop-button-secondary aop-war-end" disabled={!canCommand || actionPending} onClick={onEndTurn}>Harekât Yapmadan Turu Bitir</button>
      )}
      <p className="aop-operation-warning">Lojistik turu bitirmez. Nakil, saldırı, hazır veya turu bitir emri turu tam bir kez ilerletir.</p>
    </section>
  );
}
