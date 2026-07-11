import { useRef, useState } from 'react';
import { MAX_PLAYERS } from '../constants';
import { listNavalRoutes } from '../game/navalRoutes';
import { CopyBtn } from './CopyBtn';
import { Icon, Icons } from './Icons';
import { NavalRouteEditor } from './NavalRouteEditor';

function ValidationSummary({ validation }) {
  if (!validation?.regionCount) {
    return <p className="aop-validation-note">Henüz oynanabilir bir harita yüklenmedi.</p>;
  }
  const pricing = validation.pricingSummary;
  const formatGold = (value) => Number(value).toLocaleString('tr-TR');
  return (
    <div className="space-y-3">
      <div className="aop-map-verdict">
        <span>{validation.regionCount} oynanabilir bölge</span>
        <strong className={validation.valid ? 'is-valid' : 'is-invalid'}>
          {validation.valid ? 'Doğrulandı' : 'Başlatılamaz'}
        </strong>
      </div>
      {validation.valid && pricing && (
        <div className="aop-pricing-ledger" aria-label="Harita ekonomisi özeti">
          <span>
            <small>Fiyat Aralığı</small>
            <strong>{formatGold(pricing.minPrice)}–{formatGold(pricing.maxPrice)}</strong>
          </span>
          <span>
            <small>Medyan</small>
            <strong>{formatGold(pricing.medianPrice)}</strong>
          </span>
          <span>
            <small>Gelir Aralığı</small>
            <strong>{formatGold(pricing.minIncome)}–{formatGold(pricing.maxIncome)}</strong>
          </span>
        </div>
      )}
      {validation.errors?.map((item, index) => (
        <p key={`${item.code}-${index}`} className="aop-validation-note is-error">{item.message}</p>
      ))}
      {validation.warnings?.map((item, index) => (
        <p key={`${item.code}-${index}`} className="aop-validation-note is-warning">{item.message}</p>
      ))}
    </div>
  );
}

function NavalInfrastructureSummary({ roomData }) {
  const regions = Object.values(roomData.mapDefinition?.regionsById || {});
  const coastalCount = regions.filter((region) => region.coastal).length;
  const routeCount = listNavalRoutes(roomData.mapDefinition).length;
  return (
    <div className="aop-naval-summary" aria-label="Deniz altyapısı özeti">
      <div className="aop-label">Deniz Altyapısı</div>
      <strong>{coastalCount} kıyı bölgesi · {routeCount} çift yönlü rota</strong>
      {!routeCount && <p>Deniz rotası yok — oyun yalnızca kara harekâtıyla devam edebilir.</p>}
    </div>
  );
}

export const WaitingRoom = ({
  roomCode,
  players,
  roomData,
  isHost,
  handleMapUpload,
  handleMapFile,
  startGame,
  editNavalMap,
  leaveRoom,
  resetApp,
  loading,
  error,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [navalOpen, setNavalOpen] = useState(false);
  const dragDepth = useRef(0);
  const fileInput = useRef(null);
  const navalButton = useRef(null);
  const hasValidMap = Boolean(roomData.mapValidation?.valid && roomData.mapSvg && roomData.mapDefinition);
  const preventFileNavigation = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const onDragEnter = (event) => {
    preventFileNavigation(event);
    if (loading) return;
    dragDepth.current += 1;
    setDragActive(true);
  };
  const onDragLeave = (event) => {
    preventFileNavigation(event);
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (!dragDepth.current) setDragActive(false);
  };
  const onDrop = (event) => {
    preventFileNavigation(event);
    dragDepth.current = 0;
    setDragActive(false);
    if (loading) return;
    const files = [...(event.dataTransfer?.files || [])];
    if (files.length !== 1) {
      handleMapFile(null, 'Tek bir SVG dosyası bırakın.');
      return;
    }
    handleMapFile(files[0]);
  };

  return (
  <div className={`aop-lobby-shell aop-desk text-[var(--aop-text)] ${navalOpen ? 'is-dialog-open' : ''}`} data-testid="lobby-scroll-owner">
    <div className="aop-lobby-content" inert={navalOpen ? '' : undefined} aria-hidden={navalOpen || undefined}>
    <header className="aop-lobby-header">
      <div className="flex items-center gap-3">
        <Icon p={Icons.Map} c="text-[var(--aop-gold)]" />
        <div>
          <h1 className="aop-title text-2xl md:text-3xl leading-none">Age of Paper</h1>
          <div className="aop-label">Harita Meclisi</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={resetApp} className="aop-button-secondary min-h-11 px-3 text-xs"><Icon p={Icons.Trash} s={13}/></button>
        <button onClick={leaveRoom} className="aop-button-secondary min-h-11 px-3 text-xs flex items-center gap-2">
          <Icon p={Icons.LogOut} s={15}/> <span className="hidden sm:inline">Ayrıl</span>
        </button>
      </div>
    </header>

    <main className="w-full max-w-6xl mx-auto px-4 md:px-8 py-8 md:py-10">
      <section className="text-center mb-8">
        <div className="aop-label mb-2">Toprak edinme hazırlığı</div>
        <h2 className="aop-title text-4xl md:text-6xl">Komutan Masası</h2>
        <div className="aop-room-code mt-5">
          <span className="aop-label">Oda Kodu</span>
          <span className="aop-serif text-2xl font-bold text-[var(--aop-paper-light)]">{roomCode}</span>
          <CopyBtn code={roomCode} />
        </div>
      </section>

      {error && <div className="aop-inline-error mb-5" role="alert">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6">
        <section className="aop-panel p-5 md:p-7">
          <div className="flex items-end justify-between gap-4 mb-6 pb-3 border-b aop-divider">
            <div><div className="aop-label">Masadakiler</div><h3 className="aop-title text-3xl">Komutanlar</h3></div>
            <div className="aop-serif text-xl text-[var(--aop-paper-light)]">{players.length} / {MAX_PLAYERS}</div>
          </div>
          <div className="grid gap-4">
            {players.map((player, index) => (
              <div key={player.id} className="aop-paper p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-12 h-12 shrink-0 aop-seal flex items-center justify-center text-xl font-bold text-[var(--aop-paper-light)]" style={{ backgroundColor: player.color }}>
                    {player.name[0]}
                  </div>
                  <div className="min-w-0">
                    <div className="aop-serif text-xl font-bold truncate">{player.name}</div>
                    <div className="text-sm text-[var(--aop-ink-soft)]">Oyuncu {index + 1}</div>
                  </div>
                </div>
                {player.id === roomData.hostId && <span className="aop-host-badge">KURUCU</span>}
              </div>
            ))}
            {players.length < MAX_PLAYERS && (
              <div className="aop-empty-player">
                <Icon p={Icons.User} s={14}/>
                {MAX_PLAYERS - players.length} boş komutan kontenjanı
              </div>
            )}
          </div>
        </section>

        <aside className="flex flex-col gap-5">
          <section className="aop-panel p-5">
            <div className="aop-label mb-2">Sefer belgesi</div>
            <h3 className="aop-title text-2xl mb-4">Harita Doğrulaması</h3>
            <ValidationSummary validation={roomData.mapValidation} />
          </section>

          {isHost ? (
            <section className="space-y-3">
              <label
                className={`aop-map-dropzone ${dragActive ? 'is-dragging' : ''} ${loading ? 'is-loading' : ''}`}
                onDragEnter={onDragEnter}
                onDragOver={preventFileNavigation}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onKeyDown={(event) => {
                  if (!loading && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    fileInput.current?.click();
                  }
                }}
                role="button"
                tabIndex={loading ? -1 : 0}
                aria-disabled={loading}
                aria-busy={loading}
              >
                <Icon p={Icons.Map}/>
                <span>{loading ? 'Harita işleniyor…' : 'SVG’yi buraya bırak veya dosya seç'}</span>
                {roomData.mapSvg && !loading && <small>Yüklü haritayı değiştirir</small>}
                <input ref={fileInput} type="file" accept=".svg,image/svg+xml" onChange={handleMapUpload} className="sr-only" disabled={loading}/>
              </label>
              {hasValidMap && (
                <>
                  <NavalInfrastructureSummary roomData={roomData} />
                  <button
                    ref={navalButton}
                    type="button"
                    className="w-full aop-button-secondary min-h-12 px-3"
                    disabled={loading}
                    onClick={() => setNavalOpen(true)}
                  >
                    Deniz Bağlantılarını Ayarla
                  </button>
                </>
              )}
              <button
                onClick={startGame}
                disabled={loading || !roomData.mapValidation?.valid}
                className="w-full aop-button min-h-14 py-3 text-xl flex items-center justify-center gap-2"
              >
                <Icon p={Icons.Play}/> Toprak Edinmeyi Başlat
              </button>
            </section>
          ) : (
            <section className="aop-panel p-5 text-center space-y-3">
              <div className="aop-label mb-2">Bekleme Emri</div>
              <p className="text-[var(--aop-muted)]">Kurucu geçerli haritayı yükleyip oyunu başlatınca masa açılacak.</p>
              {hasValidMap && (
                <>
                  <NavalInfrastructureSummary roomData={roomData} />
                  <button
                    ref={navalButton}
                    type="button"
                    className="w-full aop-button-secondary min-h-12 px-3"
                    onClick={() => setNavalOpen(true)}
                  >
                    Deniz Bağlantılarını Gör
                  </button>
                </>
              )}
            </section>
          )}
        </aside>
      </div>
    </main>
    </div>
    {navalOpen && hasValidMap && (
      <NavalRouteEditor
        roomData={roomData}
        roomCode={roomCode}
        onEdit={editNavalMap}
        onClose={() => setNavalOpen(false)}
        returnFocusRef={navalButton}
        isHost={isHost}
        loading={loading}
      />
    )}
  </div>
  );
};
