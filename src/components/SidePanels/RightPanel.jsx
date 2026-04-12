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
    passTurn,
    user
}) => {
    return (
        <div className="w-full md:w-72 h-[35%] md:h-full bg-gray-800 border-t md:border-t-0 md:border-l border-gray-700 p-2 md:p-4 flex flex-col z-20 shadow-xl overflow-y-auto shrink-0">
            <div className="mb-4 md:mb-6 text-center shrink-0">
                <div className="hidden md:flex w-16 h-16 rounded-full mx-auto mb-2 items-center justify-center text-2xl font-bold border-4 shadow-lg" style={{borderColor: me.color, backgroundColor: '#2d3748', color: me.color}}>
                    {me.name[0]}
                </div>
                <div className="font-bold text-base md:text-lg">{me.name}</div>
                <div className="text-yellow-400 font-mono text-lg md:text-xl font-bold mt-1 flex items-center justify-center gap-2">
                    <span>💰</span> {me.money.toLocaleString()}
                </div>
                <div className="text-green-400 text-xs font-bold mt-1">(+{currentIncome.toLocaleString()}$/tur)</div>
                {roomData.isWar && (
                    <div className="text-red-400 font-mono text-sm font-bold mt-1 flex items-center justify-center gap-2">
                        <span>⚔️</span> {me.reserve || 0} (Hazır)
                    </div>
                )}
            </div>
            <div className="flex-1 shrink-0">
                {isMyTurn ? (
                    <div className="space-y-3 md:space-y-4 animate-pulse-border p-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5">
                        <div className="text-center text-yellow-500 font-bold text-xs md:text-sm uppercase tracking-wider mb-1 md:mb-2">Hamle Sırası Sende!</div>
                        <div className="bg-gray-700 p-2 md:p-3 rounded border border-gray-600">
                            <div className="text-[10px] md:text-xs text-gray-400 mb-1 uppercase font-bold">Seçili Bölge</div>
                            <div className="font-bold text-base md:text-lg mb-2 truncate">{regionName}</div>
                            {selectedId ? (
                                <>
                                    {!roomData.isWar && (
                                        !roomData.gameData[selectedId]?.owner ? (
                                            <>
                                                <button onClick={buyRegion} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-2 rounded shadow transition flex items-center justify-center gap-2 text-sm md:text-base">
                                                    <span>Satın Al</span>
                                                    <span className="bg-green-700 px-1.5 rounded text-[10px] md:text-xs">{selectedCost.toLocaleString()} $</span>
                                                </button>
                                                <div className="text-center text-[10px] text-green-300 mt-1">Gelire Etkisi: +{Math.floor(selectedCost/10).toLocaleString()}$</div>
                                            </>
                                        ) : (
                                            <div className="text-red-400 text-xs md:text-sm font-bold text-center py-2 border border-red-500/30 bg-red-500/10 rounded">Sahipli Bölge</div>
                                        )
                                    )}
                                    {roomData.isWar && (
                                        isOwnedByMe ? (
                                            <div className="space-y-2">
                                                <button onClick={deploySoldiers} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded shadow transition text-xs">Asker Yerleştir (1k)</button>
                                                {!roomData.gameData[selectedId].hasPort && (
                                                    <button onClick={buildPort} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 rounded shadow transition text-xs flex items-center justify-center gap-1">
                                                        <Icon p={Icons.Anchor} s={12}/> Liman Kur (90k)
                                                    </button>
                                                )}
                                                <button onClick={() => setAttackSource(selectedId)} className={`w-full mt-2 font-bold py-1.5 rounded text-xs ${attackSource === selectedId ? 'bg-yellow-600 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-500'}`}>
                                                    {attackSource === selectedId ? "Hücum Üssü Seçildi" : "Hücum Üssü Yap"}
                                                </button>
                                            </div>
                                        ) : isOwnedByEnemy ? (
                                            <div className="space-y-2">
                                                 {attackSource ? (
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <button onClick={() => attack('LAND')} className="bg-red-600 hover:bg-red-500 text-white font-bold py-2 rounded text-xs">KARA HÜCUM</button>
                                                        <button onClick={() => attack('SEA')} className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded text-xs">DENİZ HÜCUM</button>
                                                    </div>
                                                 ) : (
                                                    <div className="text-[10px] md:text-xs text-center text-yellow-500">Önce kendi şehrini seçip "Hücum Üssü Yap" demelisin.</div>
                                                 )}
                                            </div>
                                        ) : (
                                            <div className="text-gray-500 text-[10px] md:text-xs text-center">Tarafsız bölge</div>
                                        )
                                    )}
                                </>
                            ) : (
                                <div className="text-[10px] md:text-xs text-gray-500 italic text-center">Haritadan bir yer seç...</div>
                            )}
                        </div>
                        {roomData.isWar && (
                            <button onClick={trainSoldiers} className="w-full bg-gray-700 hover:bg-gray-600 border border-gray-500 text-white font-bold py-2 rounded shadow transition flex items-center justify-center gap-2 text-[10px] md:text-xs">
                                <span>🪖 Asker Eğit (1k)</span>
                                <span className="bg-gray-900 px-1.5 rounded text-[8px] md:text-[10px] text-gray-400">-10k $</span>
                            </button>
                        )}
                        <div className="relative flex items-center py-1">
                            <div className="flex-grow border-t border-gray-600"></div>
                            <span className="flex-shrink-0 mx-2 text-gray-500 text-[10px] md:text-xs">YA DA</span>
                            <div className="flex-grow border-t border-gray-600"></div>
                        </div>
                        <button onClick={passTurn} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 md:py-3 rounded shadow transition flex items-center justify-center gap-2 text-sm md:text-base">
                            <Icon p={Icons.Coins} />
                            <div>
                                <div>Pas Geç</div>
                                <div className="text-[10px] font-normal text-blue-200">+{currentIncome.toLocaleString()} $</div>
                            </div>
                        </button>
                    </div>
                ) : (
                    <div className="text-center text-gray-500 py-6 md:py-10 bg-gray-700/30 rounded-lg border border-gray-700 border-dashed text-xs md:text-base">
                        <div className="animate-spin inline-block mb-2"><Icon p={Icons.Shield}/></div>
                        <div>Sıra Bekleniyor...</div>
                    </div>
                )}
            </div>
        </div>
    );
};
