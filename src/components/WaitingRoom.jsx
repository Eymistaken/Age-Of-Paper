import { MAX_PLAYERS } from '../constants';
import { CopyBtn } from './CopyBtn';
import { Icon, Icons } from './Icons';

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

export const WaitingRoom = ({
  roomCode,
  players,
  roomData,
  isHost,
  handleMapUpload,
  startGame,
  leaveRoom,
  resetApp,
  loading,
  error,
}) => (
  <div className="min-h-screen aop-desk text-[var(--aop-text)] overflow-y-auto">
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
            {[...Array(MAX_PLAYERS - players.length)].map((_, index) => (
              <div key={index} className="aop-empty-player"><Icon p={Icons.User} s={14}/> Komutan bekleniyor</div>
            ))}
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
              <label className="w-full aop-button-secondary min-h-12 px-5 py-3 flex items-center justify-center gap-2 cursor-pointer">
                <Icon p={Icons.Map}/> {roomData.mapSvg ? 'Haritayı Değiştir' : 'SVG Harita Yükle'}
                <input type="file" accept=".svg,image/svg+xml" onChange={handleMapUpload} className="hidden" disabled={loading}/>
              </label>
              <button
                onClick={startGame}
                disabled={loading || !roomData.mapValidation?.valid}
                className="w-full aop-button min-h-14 py-3 text-xl flex items-center justify-center gap-2"
              >
                <Icon p={Icons.Play}/> Toprak Edinmeyi Başlat
              </button>
            </section>
          ) : (
            <section className="aop-panel p-5 text-center">
              <div className="aop-label mb-2">Bekleme Emri</div>
              <p className="text-[var(--aop-muted)]">Kurucu geçerli haritayı yükleyip oyunu başlatınca masa açılacak.</p>
            </section>
          )}
        </aside>
      </div>
    </main>
  </div>
);
