import { Icon, Icons } from '../Icons';

export const RightPanel = ({
    me,
    roomData,
    currentIncome,
    isMyTurn,
    regionName,
    selectedId,
    selectedCost,
    isOwnedByMe,
    isOwnedByEnemy,
    buyRegion,
    deploySoldiers,
    buildPort,
    setAttackSource,
    attackSource,
    attack,
    trainSoldiers,
    passTurn
}) => {
    const selectedData = selectedId ? roomData.gameData[selectedId] : null;
    const selectedSoldiers = selectedData?.soldiers || 0;
    const selectedHasPort = selectedData?.hasPort;

    return (
        <div className="w-full md:w-80 h-[38vh] md:h-full bg-[var(--aop-panel)] border-t-2 md:border-t-0 md:border-l-2 border-[var(--aop-bronze)] p-3 md:p-4 flex flex-col z-20 overflow-y-auto shrink-0">
            <div className="mb-4 md:mb-5 shrink-0 aop-panel p-4 text-center">
                <div className="hidden md:flex w-16 h-16 rounded-full mx-auto mb-3 items-center justify-center text-2xl font-bold aop-seal text-[var(--aop-paper-light)]" style={{backgroundColor: me.color}}>
                    {me.name[0]}
                </div>
                <div className="aop-label">Komutan</div>
                <div className="aop-title text-2xl">{me.name}</div>
                <div className="text-[var(--aop-paper-light)] text-lg md:text-xl font-bold mt-3 flex items-center justify-center gap-2">
                    <Icon p={Icons.Coins} s={18}/> {me.money.toLocaleString()} altın
                </div>
                <div className="text-[var(--aop-success)] text-xs font-bold mt-1">+{currentIncome.toLocaleString()} altın / tur</div>
                {roomData.isWar && (
                    <div className="text-[var(--aop-danger)] text-sm font-bold mt-2 flex items-center justify-center gap-2">
                        <Icon p={Icons.Sword} s={16}/> {me.reserve || 0} hazır asker
                    </div>
                )}
            </div>
            <div className="flex-1 shrink-0">
                {isMyTurn ? (
                    <div className="space-y-3 md:space-y-4 aop-turn-panel p-3 rounded border border-[var(--aop-gold)] bg-[var(--aop-panel-deep)]">
                        <div className="text-center aop-label text-[var(--aop-gold)]">Hamle Sırası Sende</div>
                        <div className="aop-panel p-3">
                            <div className="aop-label mb-1">Seçili Bölge</div>
                            <div className="aop-title text-2xl mb-3 truncate">{regionName}</div>
                            {selectedId ? (
                                <>
                                    <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                                        <div className="bg-[var(--aop-panel-deep)] border border-[var(--aop-line)] rounded p-2">
                                            <div className="aop-label">Asker</div>
                                            <div className="font-bold text-[var(--aop-paper-light)]">{selectedSoldiers.toLocaleString()}</div>
                                        </div>
                                        <div className="bg-[var(--aop-panel-deep)] border border-[var(--aop-line)] rounded p-2">
                                            <div className="aop-label">Liman</div>
                                            <div className="font-bold text-[var(--aop-paper-light)]">{selectedHasPort ? "Var" : "Yok"}</div>
                                        </div>
                                    </div>
                                    {!roomData.isWar && (
                                        !roomData.gameData[selectedId]?.owner ? (
                                            <>
                                                <button onClick={buyRegion} className="w-full aop-action aop-action-success font-bold py-3 rounded flex items-center justify-center gap-2 text-sm md:text-base">
                                                    <span>Satın Al</span>
                                                    <span className="bg-[var(--aop-panel-deep)] text-[var(--aop-paper-light)] px-2 py-1 rounded text-[10px] md:text-xs">{selectedCost.toLocaleString()} altın</span>
                                                </button>
                                                <div className="text-center text-[10px] text-[var(--aop-success)] mt-2">Gelire etkisi: +{Math.floor(selectedCost/10).toLocaleString()} altın</div>
                                            </>
                                        ) : (
                                            <div className="text-[var(--aop-danger)] text-xs md:text-sm font-bold text-center py-2 border border-[var(--aop-danger)] bg-[var(--aop-danger)]/10 rounded">Sahipli Bölge</div>
                                        )
                                    )}
                                    {roomData.isWar && (
                                        isOwnedByMe ? (
                                            <div className="space-y-2">
                                                <button onClick={deploySoldiers} className="w-full aop-action aop-action-port font-bold py-2 rounded text-xs">Asker Yerleştir (1.000)</button>
                                                {!selectedHasPort && (
                                                    <button onClick={buildPort} className="w-full aop-action aop-action-port font-bold py-2 rounded text-xs flex items-center justify-center gap-1">
                                                        <Icon p={Icons.Anchor} s={12}/> Liman Kur (90k)
                                                    </button>
                                                )}
                                                <button onClick={() => setAttackSource(selectedId)} className={`w-full mt-2 font-bold py-2 rounded text-xs border ${attackSource === selectedId ? 'bg-[var(--aop-gold)] text-[var(--aop-ink)] border-[var(--aop-gold-deep)]' : 'bg-[var(--aop-panel-deep)] text-[var(--aop-paper-light)] border-[var(--aop-line)] hover:bg-[var(--aop-panel-high)]'}`}>
                                                    {attackSource === selectedId ? "Hücum Üssü Seçildi" : "Hücum Üssü Yap"}
                                                </button>
                                            </div>
                                        ) : isOwnedByEnemy ? (
                                            <div className="space-y-2">
                                                 {attackSource ? (
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <button onClick={() => attack('LAND')} className="aop-action aop-action-danger font-bold py-2 rounded text-xs">Kara Hücumu</button>
                                                        <button onClick={() => attack('SEA')} className="aop-action aop-action-port font-bold py-2 rounded text-xs">Deniz Hücumu</button>
                                                    </div>
                                                 ) : (
                                                    <div className="text-[10px] md:text-xs text-center text-[var(--aop-gold)]">
                                                        Önce kendi bölgeni seçip <span className="font-bold">Hücum Üssü Yap</span> emrini ver.
                                                    </div>
                                                 )}
                                            </div>
                                        ) : (
                                            <div className="text-[var(--aop-muted)] text-[10px] md:text-xs text-center">Tarafsız bölge</div>
                                        )
                                    )}
                                </>
                            ) : (
                                <div className="text-[10px] md:text-xs text-[var(--aop-muted)] italic text-center">Haritadan bir bölge seç.</div>
                            )}
                        </div>
                        {roomData.isWar && (
                            <button onClick={trainSoldiers} className="w-full aop-button-secondary font-bold py-2 rounded flex items-center justify-center gap-2 text-[10px] md:text-xs">
                                <Icon p={Icons.Users} s={14}/>
                                <span>Asker Eğit (1.000)</span>
                                <span className="bg-[var(--aop-bg)] px-2 py-1 rounded text-[8px] md:text-[10px] text-[var(--aop-muted)]">-10k altın</span>
                            </button>
                        )}
                        <div className="relative flex items-center py-1">
                            <div className="flex-grow border-t aop-divider"></div>
                            <span className="flex-shrink-0 mx-2 text-[var(--aop-muted)] text-[10px] md:text-xs">YA DA</span>
                            <div className="flex-grow border-t aop-divider"></div>
                        </div>
                        <button onClick={passTurn} className="w-full aop-button py-2 md:py-3 rounded flex items-center justify-center gap-2 text-sm md:text-base">
                            <Icon p={Icons.Coins} />
                            <div>
                                <div>Pas Geç</div>
                                <div className="text-[10px] font-normal">+{currentIncome.toLocaleString()} altın</div>
                            </div>
                        </button>
                    </div>
                ) : (
                    <div className="text-center text-[var(--aop-muted)] py-6 md:py-10 bg-[var(--aop-panel-deep)] rounded border border-[var(--aop-line)] border-dashed text-xs md:text-base">
                        <div className="inline-block mb-2"><Icon p={Icons.Shield}/></div>
                        <div>Sıra bekleniyor.</div>
                    </div>
                )}
            </div>
        </div>
    );
};
