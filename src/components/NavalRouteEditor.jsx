import { useMemo, useState } from 'react';
import { listNavalRoutes } from '../game/navalRoutes';
import { MapViewer } from './MapViewer';

export function NavalRouteEditor({ roomData, roomCode, onEdit, loading }) {
  const [active, setActive] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [firstId, setFirstId] = useState(null);
  const [confirmUnmark, setConfirmUnmark] = useState(false);
  const regions = roomData.mapDefinition?.regionsById || {};
  const selected = selectedId ? regions[selectedId] : null;
  const routes = useMemo(() => listNavalRoutes(roomData.mapDefinition), [roomData.mapDefinition]);

  const clear = () => {
    setSelectedId(null);
    setFirstId(null);
    setConfirmUnmark(false);
  };
  const toggleCoastal = async (removeRoutes = false) => {
    if (!selected) return;
    const result = await onEdit({
      type: 'coastal',
      regionId: selected.id,
      coastal: !selected.coastal,
      removeRoutes,
    });
    if (result) setConfirmUnmark(false);
  };
  const chooseEndpoint = async () => {
    if (!selected) return;
    if (!firstId) {
      setFirstId(selected.id);
      return;
    }
    if (firstId === selected.id) {
      setFirstId(null);
      return;
    }
    const result = await onEdit({ type: 'route', firstId, secondId: selected.id, connected: true });
    if (result) {
      setFirstId(null);
      setSelectedId(null);
    }
  };

  return (
    <section className="aop-naval-editor aop-panel" aria-label="Deniz rotası yapılandırması">
      <header className="aop-naval-editor-header">
        <div>
          <div className="aop-label">Harita Altyapısı</div>
          <h3 className="aop-title text-2xl">Deniz Rotaları</h3>
        </div>
        <button className="aop-button-secondary px-3" onClick={() => { setActive((value) => !value); clear(); }}>
          {active ? 'Düzenlemeyi Kapat' : 'Rotaları Düzenle'}
        </button>
      </header>
      {!active ? (
        <p className="aop-validation-note">{routes.length} çift yönlü rota, {Object.values(regions).filter((region) => region.coastal).length} kıyı bölgesi yapılandırıldı.</p>
      ) : (
        <div className="aop-naval-editor-grid">
          <div className="aop-lobby-map-wrap">
            <MapViewer
              roomData={roomData}
              roomCode={roomCode}
              selectedId={selectedId}
              setSelectedId={(id) => { setSelectedId(id); setConfirmUnmark(false); }}
              hideHud
              navalConfigActive
              showNavalRoutes
              highlightSourceIds={firstId ? [firstId] : []}
              className="aop-lobby-map"
            />
          </div>
          <div className="aop-naval-controls">
            <p className="aop-validation-note">
              {firstId ? `İlk uç: ${regions[firstId]?.name || firstId}. İkinci bölgeyi seç.` : 'Haritadan bir bölge seç. Kıyı durumunu veya rota uçlarını metinli kontrollerle düzenle.'}
            </p>
            {selected ? (
              <>
                <dl className="aop-region-facts">
                  <div><dt>Bölge</dt><dd>{selected.name}</dd></div>
                  <div><dt>Kıyı</dt><dd>{selected.coastal ? 'Evet' : 'Hayır'}</dd></div>
                  <div><dt>Rota</dt><dd>{selected.seaNeighbors.length}</dd></div>
                </dl>
                {!confirmUnmark ? (
                  <button
                    className="aop-button-secondary w-full px-3"
                    disabled={loading}
                    onClick={() => selected.coastal && selected.seaNeighbors.length ? setConfirmUnmark(true) : toggleCoastal()}
                  >
                    {selected.coastal ? 'Kıyı İşaretini Kaldır' : 'Kıyı Olarak İşaretle'}
                  </button>
                ) : (
                  <div className="aop-route-confirm" role="alert">
                    <p>Bu işlem bölgenin {selected.seaNeighbors.length} rotasını da kaldırır.</p>
                    <div><button onClick={() => toggleCoastal(true)} disabled={loading}>Kıyıyı ve Rotaları Kaldır</button><button onClick={() => setConfirmUnmark(false)}>Vazgeç</button></div>
                  </div>
                )}
                <button className="aop-button w-full px-3" disabled={loading} onClick={chooseEndpoint}>
                  {!firstId ? 'Rota Başlangıcı Seç' : firstId === selected.id ? 'Başlangıcı İptal Et' : 'Çift Yönlü Rotayı Ekle'}
                </button>
              </>
            ) : null}
            <div className="aop-route-list" aria-label="Yapılandırılmış rotalar">
              {routes.length ? routes.map(([first, second]) => (
                <div key={`${first}:${second}`}>
                  <span>{regions[first]?.name || first} ↔ {regions[second]?.name || second}</span>
                  <button disabled={loading} onClick={() => onEdit({ type: 'route', firstId: first, secondId: second, connected: false })}>Rotayı Kaldır</button>
                </div>
              )) : <p>Henüz deniz rotası yok. Kara oyunu yine başlatılabilir.</p>}
            </div>
            <button className="aop-button-secondary w-full px-3" onClick={clear}>Seçimi Sıfırla</button>
          </div>
        </div>
      )}
    </section>
  );
}
