import { useEffect, useRef, useState } from 'react';
import {
  CHAT_MESSAGE_LIMIT,
  OFFLINE_SKIP_TIMEOUT,
  PRESENCE_OFFLINE_TIMEOUT,
} from '../constants';
import { CopyBtn } from './CopyBtn';
import { Icon, Icons } from './Icons';
import { MapViewer } from './MapViewer';

function lastActiveMillis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  return typeof value === 'number' ? value : 0;
}

export const MobileGameRoom = ({
  roomData,
  roomCode,
  me,
  currentIncome,
  currentPlayerId,
  currentPlayer,
  isMyTurn,
  isHost,
  selectedId,
  setSelectedId,
  selectedRegion,
  selectedOwner,
  eligibility,
  legalClaims,
  actionError,
  actionPending,
  now,
  message,
  setMessage,
  submitMessage,
  chatEndRef,
  buySelected,
  finishTurn,
  skipPlayer,
  leaveRoom,
}) => {
  const [activeTab, setActiveTab] = useState('orders');
  const [expanded, setExpanded] = useState(false);
  const [sheetHeight, setSheetHeight] = useState(null);
  const dragRef = useRef(null);

  useEffect(() => {
    if (selectedId) setActiveTab('orders');
  }, [selectedId]);

  const bounds = () => ({
    collapsed: Math.max(280, Math.min(window.innerHeight * 0.42, 390)),
    expanded: Math.min(window.innerHeight * 0.78, 720),
  });
  const beginDrag = (event) => {
    const current = sheetHeight || (expanded ? bounds().expanded : bounds().collapsed);
    dragRef.current = { y: event.clientY, height: current };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event) => {
    if (!dragRef.current) return;
    const next = dragRef.current.height + dragRef.current.y - event.clientY;
    const limits = bounds();
    setSheetHeight(Math.max(limits.collapsed, Math.min(limits.expanded, next)));
  };
  const endDrag = () => {
    if (!dragRef.current) return;
    const limits = bounds();
    const height = sheetHeight || dragRef.current.height;
    const nextExpanded = height > (limits.collapsed + limits.expanded) / 2;
    setExpanded(nextExpanded);
    setSheetHeight(null);
    dragRef.current = null;
  };

  const activeLastSeen = lastActiveMillis(roomData.players?.[currentPlayerId]?.lastActive);
  const maySkip = isHost && currentPlayerId && now - activeLastSeen >= OFFLINE_SKIP_TIMEOUT;

  return (
    <div className="aop-mobile-game aop-desk">
      <header className="aop-mobile-hud">
        <div><small>Hazine</small><strong>{(me.money || 0).toLocaleString('tr-TR')}</strong></div>
        <div><small>Gelir</small><strong>+{currentIncome.toLocaleString('tr-TR')}</strong></div>
        <div className="is-active-player"><small>Aktif</small><strong>{currentPlayer?.name || 'Bekleniyor'}</strong></div>
        <div><small>Round</small><strong>{roomData.roundNumber || 1}</strong></div>
        <div className="aop-mobile-room"><small>Oda</small><strong>{roomCode}</strong><CopyBtn code={roomCode}/></div>
        <button onClick={leaveRoom} className="aop-mobile-icon-btn" aria-label="Odadan ayrıl"><Icon p={Icons.LogOut}/></button>
      </header>

      <MapViewer
        roomData={roomData}
        roomCode={roomCode}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        legalClaims={legalClaims}
        currentPlayer={currentPlayer}
        hideHud
        className="aop-mobile-map"
      />

      <section
        className={`aop-mobile-sheet ${expanded ? 'is-expanded' : ''} ${dragRef.current ? 'is-dragging' : ''}`}
        style={sheetHeight ? { height: `${sheetHeight}px` } : undefined}
      >
        <button
          className="aop-mobile-grip"
          onPointerDown={beginDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={() => setExpanded((value) => !value)}
          aria-label={expanded ? 'Emir panelini küçült' : 'Emir panelini büyüt'}
        ><span/></button>
        <nav className="aop-mobile-tabs" aria-label="Oyun panelleri">
          {[
            ['orders', 'Toprak', Icons.Map],
            ['players', 'Sıra', Icons.User],
            ['chat', 'Mesaj', Icons.Send],
          ].map(([id, label, icon]) => (
            <button key={id} onClick={() => setActiveTab(id)} className={activeTab === id ? 'is-active' : ''}>
              <Icon p={icon} s={16}/>{label}
            </button>
          ))}
        </nav>
        <div className="aop-mobile-sheet-body custom-scrollbar">
          {activeTab === 'orders' && (
            <div className="aop-mobile-order-card">
              <div>
                <div className="aop-label">{isMyTurn ? 'Hamle Sırası Sende' : `Sıra ${currentPlayer?.name || 'bekleniyor'}`}</div>
                <h2 className="aop-title text-2xl">{selectedRegion?.name || 'Bölge seç'}</h2>
              </div>
              {selectedRegion ? (
                <>
                  <div className="aop-mobile-facts">
                    <span><small>Sahibi</small><strong>{selectedOwner?.name || 'Tarafsız'}</strong></span>
                    <span><small>Fiyat</small><strong>{selectedRegion.price.toLocaleString('tr-TR')}</strong></span>
                    <span><small>Gelir</small><strong>+{selectedRegion.income.toLocaleString('tr-TR')}</strong></span>
                  </div>
                  <p className={`aop-claim-reason ${eligibility.legal ? 'is-legal' : ''}`}>{eligibility.reason}</p>
                  <button onClick={buySelected} disabled={!eligibility.legal || actionPending} className="aop-action aop-action-success aop-mobile-action">
                    {actionPending ? 'İşleniyor...' : 'Satın Al'}
                  </button>
                </>
              ) : <p className="aop-claim-reason">Haritadaki parlak kenarlı yasal bölgelerden birini seç.</p>}
              {actionError && <p className="aop-inline-error">{actionError}</p>}
              <button onClick={finishTurn} disabled={!isMyTurn || actionPending} className="aop-button aop-mobile-action">Turu Bitir</button>
              {maySkip && <button onClick={skipPlayer} className="aop-skip-button">Çevrimdışı Oyuncunun Sırasını Geç</button>}
            </div>
          )}

          {activeTab === 'players' && (
            <div className="space-y-2">
              {roomData.turnOrder.map((playerId) => {
                const player = roomData.players[playerId];
                if (!player) return null;
                const active = playerId === currentPlayerId;
                const offline = now - lastActiveMillis(player.lastActive) >= PRESENCE_OFFLINE_TIMEOUT;
                return (
                  <div key={playerId} className={`aop-mobile-player ${active ? 'is-active' : ''} ${offline ? 'is-offline' : ''}`}>
                    <span className="aop-player-seal" style={{ backgroundColor: player.color }}>{player.name[0]}</span>
                    <span className="min-w-0 flex-1"><strong>{player.name}</strong><small>{(player.money || 0).toLocaleString('tr-TR')} altın</small></span>
                    {active && <b>SIRA</b>}
                    {offline ? <Icon p={Icons.WifiOff} s={15}/> : null}
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'chat' && (
            <div className="aop-mobile-chat">
              <div className="aop-chat-messages">
                {(roomData.chat || []).map((chat, index) => (
                  <div key={chat.id || `${chat.s}-${index}`} className="aop-chat-message">
                    <strong style={{ color: chat.senderColor || chat.c }}>{chat.senderName || chat.s}</strong>
                    <span>{chat.text || chat.t}</span>
                  </div>
                ))}
                <div ref={chatEndRef}/>
              </div>
              <form onSubmit={submitMessage} className="aop-chat-form">
                <input className="aop-input" maxLength={CHAT_MESSAGE_LIMIT} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Mesaj..."/>
                <button className="aop-button-secondary" aria-label="Mesaj gönder"><Icon p={Icons.Send}/></button>
              </form>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
