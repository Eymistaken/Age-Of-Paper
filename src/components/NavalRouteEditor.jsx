import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { listNavalRoutes } from '../game/navalRoutes';
import { MapViewer } from './MapViewer';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function regionName(regions, regionId) {
  return regions[regionId]?.name || regionId;
}

export function NavalRouteEditor({
  roomData,
  roomCode,
  onEdit,
  onClose,
  returnFocusRef,
  isHost,
  loading = false,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const blockedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const pendingRef = useRef(false);
  const [selectedId, setSelectedId] = useState(null);
  const [routeMode, setRouteMode] = useState(false);
  const [firstId, setFirstId] = useState(null);
  const [candidateId, setCandidateId] = useState(null);
  const [confirmUnmark, setConfirmUnmark] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const regions = useMemo(() => roomData.mapDefinition?.regionsById || {}, [roomData.mapDefinition]);
  const selected = selectedId ? regions[selectedId] : null;
  const routes = useMemo(() => listNavalRoutes(roomData.mapDefinition), [roomData.mapDefinition]);
  const blocked = pending || loading || confirmUnmark;
  blockedRef.current = blocked;
  onCloseRef.current = onClose;

  useEffect(() => {
    const returnFocusElement = returnFocusRef?.current;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    closeRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (!blockedRef.current) onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...(dialogRef.current?.querySelectorAll(FOCUSABLE_SELECTOR) || [])];
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      returnFocusElement?.focus();
    };
  }, [returnFocusRef]);

  useEffect(() => {
    if (selectedId && !regions[selectedId]) setSelectedId(null);
    if (firstId && !regions[firstId]) setFirstId(null);
    if (candidateId && !regions[candidateId]) setCandidateId(null);
  }, [candidateId, firstId, regions, selectedId]);

  const clearAll = () => {
    setSelectedId(null);
    setRouteMode(false);
    setFirstId(null);
    setCandidateId(null);
    setConfirmUnmark(false);
    setFeedback(null);
  };

  const cancelEndpoint = () => {
    setFirstId(null);
    setCandidateId(null);
    setSelectedId(null);
    setFeedback({ type: 'status', message: 'Rota uç seçimi iptal edildi.' });
  };

  const runEdit = async (edit, successMessage) => {
    if (!isHost || pendingRef.current || loading) return false;
    pendingRef.current = true;
    blockedRef.current = true;
    setPending(true);
    setFeedback(null);
    try {
      const result = await onEdit(edit);
      if (!result?.ok) {
        setFeedback({ type: 'error', message: result?.reason || 'Deniz altyapısı kaydedilemedi.' });
        return false;
      }
      setFeedback({ type: 'success', message: successMessage(result) });
      return true;
    } catch (error) {
      setFeedback({ type: 'error', message: error?.message || 'Deniz altyapısı kaydedilemedi.' });
      return false;
    } finally {
      pendingRef.current = false;
      blockedRef.current = loading || confirmUnmark;
      setPending(false);
    }
  };

  const selectRegion = (regionId) => {
    if (pending || loading) return;
    setConfirmUnmark(false);
    setFeedback(null);
    if (!isHost || !routeMode) {
      setSelectedId(regionId);
      return;
    }
    if (!firstId) {
      setFirstId(regionId);
      setCandidateId(null);
      setSelectedId(regionId);
      return;
    }
    if (firstId === regionId) {
      cancelEndpoint();
      return;
    }
    setCandidateId(regionId);
    setSelectedId(regionId);
  };

  const startRoute = () => {
    setRouteMode(true);
    setFirstId(null);
    setCandidateId(null);
    setSelectedId(null);
    setConfirmUnmark(false);
    setFeedback({ type: 'status', message: '1. adım: Haritadan başlangıç bölgesini seç.' });
  };

  const confirmRoute = async () => {
    if (!firstId || !candidateId) return;
    const firstName = regionName(regions, firstId);
    const secondName = regionName(regions, candidateId);
    const saved = await runEdit(
      { type: 'create_route', firstId, secondId: candidateId },
      (result) => result.autoMarkedCoastal
        ? `${firstName} ↔ ${secondName} rotası oluşturuldu; gerekli bölgeler kıyı olarak işaretlendi.`
        : `${firstName} ↔ ${secondName} rotası oluşturuldu.`,
    );
    if (saved) {
      setRouteMode(false);
      setFirstId(null);
      setCandidateId(null);
      setSelectedId(null);
    }
  };

  const toggleCoastal = async (removeRoutes = false) => {
    if (!selected) return;
    const nextCoastal = !selected.coastal;
    const saved = await runEdit(
      { type: 'coastal', regionId: selected.id, coastal: nextCoastal, removeRoutes },
      () => nextCoastal
        ? `${selected.name} kıyı ve liman kurulabilir bölge olarak işaretlendi.`
        : `${selected.name} kıyı işaretinden çıkarıldı${removeRoutes ? '; bağlı rotaları kaldırıldı.' : '.'}`,
    );
    if (saved) setConfirmUnmark(false);
  };

  const removeRoute = async (first, second) => {
    await runEdit(
      { type: 'remove_route', firstId: first, secondId: second },
      () => `${regionName(regions, first)} ↔ ${regionName(regions, second)} rotası kaldırıldı.`,
    );
  };

  const instruction = !routeMode
    ? 'Yeni bir bağlantı için rota oluşturma modunu başlat.'
    : !firstId
      ? '1. Başlangıç bölgesini seç.'
      : !candidateId
        ? `2. ${regionName(regions, firstId)} başlangıç seçildi. Şimdi varış bölgesini seç.`
        : `3. ${regionName(regions, firstId)} ↔ ${regionName(regions, candidateId)} rotasını doğrula.`;

  return createPortal(
    <div
      className="aop-naval-backdrop"
      data-testid="naval-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !blocked) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="aop-naval-dialog aop-desk"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <header className="aop-naval-dialog-header">
          <div>
            <div className="aop-label">Deniz Altyapısı</div>
            <h2 id={titleId} className="aop-title">{isHost ? 'Deniz Bağlantılarını Ayarla' : 'Deniz Bağlantılarını Gör'}</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="aop-button-secondary aop-naval-close"
            aria-label="Deniz bağlantıları penceresini kapat"
            disabled={pending || loading || confirmUnmark}
            onClick={() => !confirmUnmark && onClose()}
          >
            <span aria-hidden="true">×</span><span>Kapat</span>
          </button>
        </header>

        <div className="aop-naval-dialog-layout">
          <div className="aop-lobby-map-wrap">
            <MapViewer
              roomData={roomData}
              roomCode={roomCode}
              selectedId={selectedId}
              setSelectedId={selectRegion}
              hideHud
              navalConfigActive={isHost}
              showNavalRoutes
              previewNavalRoute={firstId && candidateId ? [firstId, candidateId] : null}
              highlightSourceIds={firstId ? [firstId] : []}
              highlightTargetIds={candidateId ? [candidateId] : []}
              className="aop-lobby-map"
            />
          </div>

          <div className="aop-naval-controls" data-testid="naval-controls-scroll">
            <div id={descriptionId} className="aop-naval-explainer">
              <p>Deniz rotaları, gemilerin hangi kıyı bölgeleri arasında asker taşıyabileceğini belirler.</p>
              <ul>
                <li>Deniz nakli veya deniz saldırısı yalnızca doğrudan yapılandırılmış bir rota üzerinden yapılabilir.</li>
                <li>Kaynak bölgede liman ve yeterli gemi kapasitesi gerekir.</li>
                <li>Rota kurulmaması oyunu engellemez; deniz harekâtı devre dışı kalır.</li>
                {isHost && <li>Yapılan değişiklikler anında odaya kaydedilir.</li>}
              </ul>
            </div>

            {isHost && (
              <section className={`aop-route-builder ${routeMode ? 'is-active' : ''}`} aria-label="Yeni deniz rotası">
                <div className="aop-route-builder-heading">
                  <div><div className="aop-label">Yeni Bağlantı</div><strong>{instruction}</strong></div>
                  {!routeMode && <button type="button" className="aop-button px-3" disabled={pending || loading} onClick={startRoute}>Yeni Rota Oluştur</button>}
                </div>
                <ol className="aop-route-steps">
                  <li className={routeMode ? 'is-current' : ''}>Başlangıç bölgesini seç</li>
                  <li className={firstId ? 'is-current' : ''}>Varış bölgesini seç</li>
                  <li className={candidateId ? 'is-current' : ''}>Rotayı oluştur</li>
                </ol>
                {routeMode && (
                  <div className="aop-route-builder-actions">
                    {firstId && <button type="button" className="aop-button-secondary" disabled={pending || loading} onClick={cancelEndpoint}>Seçimi İptal Et</button>}
                    {candidateId && <button type="button" className="aop-button" disabled={pending || loading} onClick={confirmRoute}>Çift Yönlü Rotayı Oluştur</button>}
                  </div>
                )}
              </section>
            )}

            {selected && (
              <section className="aop-selected-region" aria-label="Seçili bölge">
                <div className="aop-label">Seçili Bölge</div>
                <dl className="aop-region-facts">
                  <div><dt>Bölge</dt><dd>{selected.name}</dd></div>
                  <div><dt>Kıyı</dt><dd>{selected.coastal ? 'Evet' : 'Hayır'}</dd></div>
                  <div><dt>Rota</dt><dd>{selected.seaNeighbors?.length || 0}</dd></div>
                </dl>
                {isHost && !routeMode && (
                  !confirmUnmark ? (
                    <button
                      type="button"
                      className="aop-button-secondary w-full px-3"
                      disabled={pending || loading}
                      onClick={() => selected.coastal && selected.seaNeighbors?.length ? setConfirmUnmark(true) : toggleCoastal()}
                    >
                      {selected.coastal ? 'Kıyı İşaretini Kaldır' : 'Kıyı Olarak İşaretle'}
                    </button>
                  ) : (
                    <div className="aop-route-confirm" role="alertdialog" aria-label="Kıyı ve rota kaldırma onayı">
                      <p>Bu işlem {selected.name} bölgesinin {selected.seaNeighbors.length} rotasını da kaldırır.</p>
                      <div>
                        <button type="button" onClick={() => toggleCoastal(true)} disabled={pending || loading}>Kıyıyı ve Rotaları Kaldır</button>
                        <button type="button" onClick={() => setConfirmUnmark(false)} disabled={pending}>Vazgeç</button>
                      </div>
                    </div>
                  )
                )}
              </section>
            )}

            {feedback && (
              <p className={`aop-naval-feedback is-${feedback.type}`} role={feedback.type === 'error' ? 'alert' : 'status'}>
                {feedback.message}
              </p>
            )}
            {pending && <p className="aop-validation-note" role="status">Değişiklik odaya kaydediliyor…</p>}

            <section className="aop-route-directory" aria-label="Yapılandırılmış rotalar">
              <div className="aop-route-directory-heading">
                <div><div className="aop-label">Mevcut Bağlantılar</div><strong>{routes.length} çift yönlü rota</strong></div>
              </div>
              <div className="aop-route-list">
                {routes.length ? routes.map(([first, second]) => (
                  <div key={`${first}:${second}`} data-testid="naval-route-item">
                    <span>{regionName(regions, first)} ↔ {regionName(regions, second)}</span>
                    {isHost && <button type="button" disabled={pending || loading} onClick={() => removeRoute(first, second)}>Rotayı Kaldır</button>}
                  </div>
                )) : (
                  <p>Deniz rotası yok — oyun yalnızca kara harekâtıyla devam edebilir.</p>
                )}
              </div>
            </section>

            {isHost && (
              <button type="button" className="aop-button-secondary w-full px-3" disabled={pending || loading} onClick={clearAll}>
                Tüm Seçimi Temizle
              </button>
            )}
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
