import { Icon, Icons } from './Icons';
import { CopyBtn } from './CopyBtn';
import { MAX_PLAYERS } from '../constants';

export const WaitingRoom = ({ 
    roomCode, 
    players, 
    roomData, 
    isHost, 
    handleMapUpload, 
    startGame, 
    leaveRoom, 
    resetApp 
}) => {
    return (
        <div className="min-h-screen aop-desk text-[var(--aop-text)] overflow-y-auto">
            <header className="border-b-2 border-[var(--aop-line)] bg-[var(--aop-bg)] px-4 md:px-10 py-3 flex items-center justify-between sticky top-0 z-30">
                <div className="flex items-center gap-3">
                    <Icon p={Icons.Map} c="text-[var(--aop-gold)]" />
                    <div>
                        <h1 className="aop-title text-2xl md:text-3xl leading-none">Age of Paper</h1>
                        <div className="aop-label">Savaş Meclisi</div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={resetApp} className="aop-button-secondary px-3 py-2 text-xs flex items-center gap-2">
                        <Icon p={Icons.Trash} s={13}/> Sıfırla
                    </button>
                    <button onClick={leaveRoom} className="aop-button-secondary px-3 py-2 text-xs flex items-center gap-2">
                        <Icon p={Icons.LogOut} s={15}/> Ayrıl
                    </button>
                </div>
            </header>

            <main className="w-full max-w-6xl mx-auto px-4 md:px-8 py-8 md:py-10">
                <section className="text-center mb-8">
                    <h2 className="aop-title text-5xl md:text-6xl">Komutan Masası</h2>
                    <div className="mt-5 inline-flex items-center gap-3 bg-[var(--aop-panel)] border-2 border-[var(--aop-bronze)] rounded px-5 py-3">
                        <span className="aop-label">Oda Kodu</span>
                        <span className="aop-serif text-2xl font-bold text-[var(--aop-paper-light)]">{roomCode}</span>
                        <CopyBtn code={roomCode} />
                    </div>
                </section>

                <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
                    <section className="aop-panel p-5 md:p-7">
                        <div className="flex items-end justify-between gap-4 mb-6 pb-3 border-b aop-divider">
                            <div>
                                <div className="aop-label">Toplanan Kuvvetler</div>
                                <h3 className="aop-title text-3xl">Komutanlar</h3>
                            </div>
                            <div className="aop-serif text-xl text-[var(--aop-paper-light)]">
                                {players.length} / {MAX_PLAYERS}
                            </div>
                        </div>

                        <div className="grid gap-4">
                            {players.map((p, index) => (
                                <div key={p.id} className="aop-paper p-4 flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className="w-12 h-12 shrink-0 aop-seal flex items-center justify-center text-xl font-bold text-[var(--aop-paper-light)]" style={{backgroundColor: p.color}}>
                                            {p.name[0]}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="aop-serif text-xl font-bold truncate">{p.name}</div>
                                            <div className="flex items-center gap-2 text-sm text-[var(--aop-ink-soft)]">
                                                <span className="w-3 h-3 rounded-full border border-[var(--aop-ink)]" style={{backgroundColor: p.color}}></span>
                                                <span>Oyuncu {index + 1}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        {p.id === roomData.hostId && (
                                            <span className="bg-[var(--aop-panel-deep)] text-[var(--aop-gold)] border border-[var(--aop-bronze)] px-3 py-1 rounded text-xs font-bold">
                                                KURUCU
                                            </span>
                                        )}
                                        <Icon p={Icons.Shield} s={18} c="text-[var(--aop-ink)]" />
                                    </div>
                                </div>
                            ))}
                            {[...Array(MAX_PLAYERS - players.length)].map((_,i) => (
                                <div key={i} className="border-2 border-dashed border-[var(--aop-line)] rounded h-20 flex items-center justify-center text-[var(--aop-muted)] bg-[var(--aop-panel-deep)]">
                                    <span className="aop-label flex items-center gap-2"><Icon p={Icons.User} s={14}/> Komutan bekleniyor</span>
                                </div>
                            ))}
                        </div>
                    </section>

                    <aside className="flex flex-col gap-5">
                        <section className="aop-panel p-5">
                            <div className="aop-label mb-2">Sefer Bilgileri</div>
                            <h3 className="aop-title text-2xl mb-4">Harita Durumu</h3>
                            <div className="space-y-3">
                                <div className="bg-[var(--aop-panel-deep)] border-b-2 border-[var(--aop-line)] px-3 py-3 flex items-center justify-between">
                                    <span>Harita</span>
                                    <span className={roomData.mapSvg ? "text-[var(--aop-success)] font-bold" : "text-[var(--aop-muted)]"}>
                                        {roomData.mapSvg ? "Yüklendi" : "Bekleniyor"}
                                    </span>
                                </div>
                                <div className="bg-[var(--aop-panel-deep)] border-b-2 border-[var(--aop-line)] px-3 py-3 flex items-center justify-between">
                                    <span>Oyuncular</span>
                                    <span>{players.length}/{MAX_PLAYERS}</span>
                                </div>
                            </div>
                        </section>

                        {isHost ? (
                            <section className="space-y-3">
                                {!roomData.mapSvg && (
                                    <label className="w-full aop-button-secondary px-5 py-4 flex items-center justify-center gap-2 cursor-pointer">
                                        <Icon p={Icons.Map}/> Harita Dosyası Yükle (.svg)
                                        <input type="file" accept=".svg" onChange={handleMapUpload} className="hidden"/>
                                    </label>
                                )}
                                <button 
                                    onClick={startGame} 
                                    disabled={!roomData.mapSvg} 
                                    className="w-full aop-button py-4 text-2xl flex items-center justify-center gap-2"
                                >
                                    <Icon p={Icons.Play} /> Oyunu Başlat
                                </button>
                            </section>
                        ) : (
                            <section className="aop-panel p-5 text-center">
                                <div className="aop-label mb-2">Bekleme Emri</div>
                                <p className="text-[var(--aop-muted)]">Kurucu haritayı yükleyip seferi başlatınca oyun açılacak.</p>
                            </section>
                        )}
                    </aside>
                </div>
            </main>
        </div>
    );
};
