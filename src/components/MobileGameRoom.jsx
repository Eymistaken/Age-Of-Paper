import { useEffect, useRef, useState } from 'react';
import { ACTIVE_TIMEOUT } from '../constants';
import { CopyBtn } from './CopyBtn';
import { Icon, Icons } from './Icons';
import { MapViewer } from './MapViewer';

const TAB_ITEMS = [
    { id: 'orders', label: 'Emirler', icon: Icons.Sword },
    { id: 'players', label: 'Oyuncular', icon: Icons.Users },
    { id: 'chat', label: 'Sohbet', icon: Icons.Send },
];

export const MobileGameRoom = ({
    roomData,
    roomCode,
    selectedId,
    setSelectedId,
    leaveRoom,
    resetApp,
    currentPlayerId,
    now,
    msg,
    setMsg,
    sendMessage,
    chatEndRef,
    currentIncome,
    isMyTurn,
    regionName,
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
}) => {
    const [activeTab, setActiveTab] = useState('orders');
    const [isExpanded, setIsExpanded] = useState(false);
    const [isDraggingSheet, setIsDraggingSheet] = useState(false);
    const [dragHeight, setDragHeight] = useState(null);
    const isDraggingSheetRef = useRef(false);
    const dragStartYRef = useRef(0);
    const dragStartHeightRef = useRef(0);
    const dragHeightRef = useRef(null);
    const dragMovedRef = useRef(false);
    const dragBoundsRef = useRef({ collapsed: 250, expanded: 560 });

    const currentPlayer = currentPlayerId ? roomData.players[currentPlayerId] : null;
    const selectedData = selectedId ? roomData.gameData[selectedId] : null;
    const selectedSoldiers = selectedData?.soldiers || 0;
    const selectedHasPort = selectedData?.hasPort;

    useEffect(() => {
        if (selectedId) {
            setActiveTab('orders');
            setIsExpanded(true);
        }
    }, [selectedId]);

    const selectTab = (tabId) => {
        setActiveTab(tabId);
        setIsExpanded(true);
    };

    const getSheetBounds = () => {
        const viewportHeight = window.innerHeight || 800;
        return {
            collapsed: Math.max(250, Math.min(viewportHeight * 0.38, 360)),
            expanded: Math.min(viewportHeight * 0.72, 640),
        };
    };

    const getCurrentSheetHeight = () => {
        const bounds = getSheetBounds();
        return isExpanded ? bounds.expanded : bounds.collapsed;
    };

    const startSheetDrag = (event) => {
        const bounds = getSheetBounds();
        dragBoundsRef.current = bounds;
        dragStartYRef.current = event.clientY;
        dragStartHeightRef.current = getCurrentSheetHeight();
        dragHeightRef.current = dragStartHeightRef.current;
        dragMovedRef.current = false;
        isDraggingSheetRef.current = true;
        setIsDraggingSheet(true);
        setDragHeight(dragStartHeightRef.current);
        event.currentTarget.setPointerCapture?.(event.pointerId);
    };

    const moveSheetDrag = (event) => {
        if (!isDraggingSheetRef.current) return;

        const delta = dragStartYRef.current - event.clientY;
        const bounds = dragBoundsRef.current;
        const nextHeight = Math.min(
            bounds.expanded,
            Math.max(bounds.collapsed, dragStartHeightRef.current + delta)
        );

        if (Math.abs(delta) > 6) dragMovedRef.current = true;
        dragHeightRef.current = nextHeight;
        setDragHeight(nextHeight);
    };

    const endSheetDrag = (event) => {
        if (!isDraggingSheetRef.current) return;

        const bounds = dragBoundsRef.current;
        const currentHeight = dragHeightRef.current ?? getCurrentSheetHeight();
        const midpoint = bounds.collapsed + (bounds.expanded - bounds.collapsed) * 0.45;

        setIsExpanded(dragMovedRef.current ? currentHeight >= midpoint : value => !value);
        isDraggingSheetRef.current = false;
        setIsDraggingSheet(false);
        dragHeightRef.current = null;
        setDragHeight(null);
        if (event?.currentTarget?.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    };

    const runAndCollapseOnSuccess = async (action) => {
        const didRun = await action();
        if (didRun) setIsExpanded(false);
    };

    return (
        <div className="aop-mobile-game aop-desk">
            <MapViewer
                roomData={roomData}
                roomCode={roomCode}
                selectedId={selectedId}
                setSelectedId={setSelectedId}
                leaveRoom={leaveRoom}
                resetApp={resetApp}
                hideHud
                className="h-full w-full"
            />

            <header className="aop-mobile-hud">
                <div className="min-w-0">
                    <div className="aop-label">Oda</div>
                    <div className="flex items-center gap-2">
                        <span className="aop-serif text-xl font-bold text-[var(--aop-paper-light)] leading-none">{roomCode}</span>
                        <CopyBtn code={roomCode} />
                    </div>
                </div>
                <div className="min-w-0 text-center">
                    <div className="aop-label">Sıra</div>
                    <div className="truncate text-sm font-bold text-[var(--aop-paper-light)]">
                        {currentPlayer?.name || 'Bekleniyor'}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="text-xs text-[var(--aop-muted)]">
                        Tur <span className="font-bold text-[var(--aop-paper-light)]">{roomData.turnIndex + 1}</span>
                    </div>
                    <button onClick={leaveRoom} className="aop-mobile-icon-btn text-[var(--aop-danger)]" aria-label="Odadan ayrıl">
                        <Icon p={Icons.LogOut} s={19} />
                    </button>
                </div>
            </header>

            <section
                className={`aop-mobile-sheet ${isExpanded ? 'is-expanded' : ''} ${isDraggingSheet ? 'is-dragging' : ''}`}
                style={dragHeight ? { height: `${dragHeight}px` } : undefined}
            >
                <button
                    type="button"
                    className="aop-mobile-grip"
                    onPointerDown={startSheetDrag}
                    onPointerMove={moveSheetDrag}
                    onPointerUp={endSheetDrag}
                    onPointerCancel={endSheetDrag}
                    aria-label={isExpanded ? 'Komut panelini küçült' : 'Komut panelini büyüt'}
                >
                    <span></span>
                </button>

                <nav className="aop-mobile-tabs">
                    {TAB_ITEMS.map(tab => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => selectTab(tab.id)}
                            className={activeTab === tab.id ? 'is-active' : ''}
                        >
                            <Icon p={tab.icon} s={17} />
                            <span>{tab.label}</span>
                        </button>
                    ))}
                </nav>

                <div className="aop-mobile-sheet-body">
                    {activeTab === 'orders' && (
                        <MobileOrders
                            roomData={roomData}
                            selectedId={selectedId}
                            regionName={regionName}
                            selectedData={selectedData}
                            selectedSoldiers={selectedSoldiers}
                            selectedHasPort={selectedHasPort}
                            selectedCost={selectedCost}
                            currentIncome={currentIncome}
                            isMyTurn={isMyTurn}
                            isOwnedByMe={isOwnedByMe}
                            isOwnedByEnemy={isOwnedByEnemy}
                            attackSource={attackSource}
                            buyRegion={buyRegion}
                            deploySoldiers={deploySoldiers}
                            buildPort={buildPort}
                            setAttackSource={setAttackSource}
                            attack={attack}
                            trainSoldiers={trainSoldiers}
                            passTurn={passTurn}
                            runAndCollapseOnSuccess={runAndCollapseOnSuccess}
                            resetApp={resetApp}
                        />
                    )}

                    {activeTab === 'players' && (
                        <MobilePlayers roomData={roomData} currentPlayerId={currentPlayerId} now={now} />
                    )}

                    {activeTab === 'chat' && (
                        <MobileChat
                            roomData={roomData}
                            msg={msg}
                            setMsg={setMsg}
                            sendMessage={sendMessage}
                            chatEndRef={chatEndRef}
                        />
                    )}
                </div>
            </section>
        </div>
    );
};

const MobileOrders = ({
    roomData,
    selectedId,
    regionName,
    selectedData,
    selectedSoldiers,
    selectedHasPort,
    selectedCost,
    currentIncome,
    isMyTurn,
    isOwnedByMe,
    isOwnedByEnemy,
    attackSource,
    buyRegion,
    deploySoldiers,
    buildPort,
    setAttackSource,
    attack,
    trainSoldiers,
    passTurn,
    runAndCollapseOnSuccess,
    resetApp,
}) => (
    <div className="space-y-3">
        <div className="aop-mobile-order-card">
            <div>
                <div className="aop-label">Seçili Bölge</div>
                <h2 className="aop-title text-3xl leading-tight truncate">{regionName}</h2>
            </div>

            {selectedId ? (
                <div className="grid grid-cols-3 gap-2 text-xs">
                    <MobileStat label="Asker" value={selectedSoldiers.toLocaleString()} />
                    <MobileStat label="Liman" value={selectedHasPort ? 'Var' : 'Yok'} />
                    <MobileStat label="Değer" value={selectedCost ? selectedCost.toLocaleString() : '-'} />
                </div>
            ) : (
                <p className="text-sm italic text-[var(--aop-muted)]">Haritada bir bölge seç.</p>
            )}
        </div>

        {!isMyTurn && (
            <div className="aop-mobile-note">
                <Icon p={Icons.Shield} s={16} />
                <span>Sıra bekleniyor. Emirler sadece kendi turunda verilebilir.</span>
            </div>
        )}

        {isMyTurn && selectedId && !roomData.isWar && (
            selectedData?.owner ? (
                <div className="aop-mobile-note danger">Bu bölge zaten sahipli.</div>
            ) : (
                <button onClick={() => runAndCollapseOnSuccess(buyRegion)} className="aop-action aop-action-success aop-mobile-action">
                    Satın Al
                    <span>{selectedCost.toLocaleString()} altın</span>
                </button>
            )
        )}

        {isMyTurn && selectedId && roomData.isWar && isOwnedByMe && (
            <div className="grid grid-cols-1 gap-2">
                <button onClick={deploySoldiers} className="aop-action aop-action-port aop-mobile-action">Asker Yerleştir <span>1.000</span></button>
                {!selectedHasPort && (
                    <button onClick={buildPort} className="aop-action aop-action-port aop-mobile-action">Liman Kur <span>90k</span></button>
                )}
                <button
                    onClick={() => setAttackSource(selectedId)}
                    className={`aop-mobile-action aop-mobile-source-action ${attackSource === selectedId ? 'is-source' : ''}`}
                >
                    {attackSource === selectedId ? 'Hücum Üssü Seçildi' : 'Hücum Üssü Yap'}
                </button>
            </div>
        )}

        {isMyTurn && selectedId && roomData.isWar && isOwnedByEnemy && (
            attackSource ? (
                <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => runAndCollapseOnSuccess(() => attack('LAND'))} className="aop-action aop-action-danger aop-mobile-action">Kara Hücumu</button>
                    <button onClick={() => runAndCollapseOnSuccess(() => attack('SEA'))} className="aop-action aop-action-port aop-mobile-action">Deniz Hücumu</button>
                </div>
            ) : (
                <div className="aop-mobile-note">Önce kendi bölgeni hücum üssü yap.</div>
            )
        )}

        {isMyTurn && roomData.isWar && (
            <button onClick={trainSoldiers} className="aop-button-secondary aop-mobile-action">
                Asker Eğit
                <span>-10k altın</span>
            </button>
        )}

        {isMyTurn && (
            <button onClick={() => runAndCollapseOnSuccess(passTurn)} className="aop-button aop-mobile-action">
                Pas Geç
                <span>+{currentIncome.toLocaleString()} altın</span>
            </button>
        )}

        <button onClick={resetApp} className="aop-button-secondary aop-mobile-action subtle">
            <Icon p={Icons.Trash} s={15} />
            Sıfırla
        </button>
    </div>
);

const MobileStat = ({ label, value }) => (
    <div className="rounded border border-[var(--aop-line)] bg-[var(--aop-panel-deep)] p-2">
        <div className="aop-label text-[10px]">{label}</div>
        <div className="font-bold text-[var(--aop-paper-light)] truncate">{value}</div>
    </div>
);

const MobilePlayers = ({ roomData, currentPlayerId, now }) => (
    <div className="space-y-2">
        {roomData.turnOrder.map(uid => {
            const player = roomData.players[uid];
            if (!player) return null;
            const isActive = uid === currentPlayerId;
            const isOffline = (now - (player.lastActive || 0)) > ACTIVE_TIMEOUT;

            return (
                <div key={uid} className={`aop-mobile-player ${isActive ? 'is-active' : ''} ${isOffline ? 'is-offline' : ''}`}>
                    <div className="aop-seal flex h-10 w-10 shrink-0 items-center justify-center font-bold text-[var(--aop-paper-light)]" style={{backgroundColor: player.color}}>
                        {player.name[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-bold">{player.name}</span>
                            {isActive && <span className="text-xs font-bold text-[var(--aop-gold)]">SIRA</span>}
                        </div>
                        <div className="text-xs text-[var(--aop-muted)]">{player.money.toLocaleString()} altın</div>
                    </div>
                    {isOffline && <Icon p={Icons.WifiOff} s={16} c="text-[var(--aop-danger)]" />}
                </div>
            );
        })}
    </div>
);

const MobileChat = ({ roomData, msg, setMsg, sendMessage, chatEndRef }) => (
    <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto space-y-2 pr-1">
            {roomData.chat?.map((message, index) => (
                <div key={index} className="text-sm">
                    <span style={{color: message.c}} className="block text-xs font-bold">{message.s}</span>
                    <span className="inline-block max-w-full break-words rounded border border-[var(--aop-line)] bg-[var(--aop-panel-deep)] px-2 py-1 text-[var(--aop-text)]">
                        {message.t}
                    </span>
                </div>
            ))}
            <div ref={chatEndRef} />
        </div>
        <form onSubmit={sendMessage} className="mt-3 flex gap-2">
            <input
                className="aop-input min-h-[44px] flex-1"
                placeholder="Mesaj..."
                value={msg}
                onChange={event => setMsg(event.target.value)}
            />
            <button className="aop-button-secondary min-h-[44px] min-w-[52px] px-3" aria-label="Mesaj gönder">
                <Icon p={Icons.Send} s={18} />
            </button>
        </form>
    </div>
);
