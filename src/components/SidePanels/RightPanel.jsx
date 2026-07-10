import { Icon, Icons } from '../Icons';

export const RightPanel = ({
  me,
  currentIncome,
  currentPlayer,
  isMyTurn,
  selectedRegion,
  selectedOwner,
  eligibility,
  actionError,
  actionPending,
  buySelected,
  finishTurn,
}) => (
  <aside className="aop-right-panel">
    <section className="aop-command-summary">
      <span className="aop-player-seal large" style={{ backgroundColor: me.color }}>{me.name[0]}</span>
      <div className="aop-label">Komutan</div>
      <h2 className="aop-title text-2xl">{me.name}</h2>
      <div className="aop-treasury"><Icon p={Icons.Coins} s={18}/>{(me.money || 0).toLocaleString('tr-TR')} altın</div>
      <div className="aop-income">+{currentIncome.toLocaleString('tr-TR')} tur başı gelir</div>
    </section>

    <section className={`aop-order-sheet ${isMyTurn ? 'is-my-turn' : ''}`}>
      <div className="aop-label">{isMyTurn ? 'Hamle Sırası Sende' : `Aktif: ${currentPlayer?.name || 'Bekleniyor'}`}</div>
      <h3 className="aop-title text-2xl mt-1">{selectedRegion?.name || 'Bölge seçilmedi'}</h3>
      {selectedRegion ? (
        <>
          <dl className="aop-region-facts">
            <div><dt>Sahibi</dt><dd>{selectedOwner?.name || 'Tarafsız'}</dd></div>
            <div><dt>Fiyat</dt><dd>{selectedRegion.price.toLocaleString('tr-TR')}</dd></div>
            <div><dt>Gelir</dt><dd>+{selectedRegion.income.toLocaleString('tr-TR')}</dd></div>
          </dl>
          <p className={`aop-claim-reason ${eligibility.legal ? 'is-legal' : ''}`}>{eligibility.reason}</p>
          <button onClick={buySelected} disabled={!eligibility.legal || actionPending} className="aop-action aop-action-success aop-primary-order">
            {actionPending ? 'İşleniyor...' : 'Satın Al'}
          </button>
        </>
      ) : (
        <p className="aop-claim-reason">Haritadaki işaretli yasal bölgelerden birini seç.</p>
      )}
      {actionError && <p className="aop-inline-error" role="alert">{actionError}</p>}
      <button onClick={finishTurn} disabled={!isMyTurn || actionPending} className="aop-button aop-end-turn">
        Turu Bitir
        <small>Gelir üretmez, sırayı ilerletir</small>
      </button>
    </section>
  </aside>
);
