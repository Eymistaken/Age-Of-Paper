import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CHAT_MESSAGE_LIMIT,
  OFFLINE_SKIP_TIMEOUT,
  PRESENCE_OFFLINE_TIMEOUT,
} from '../constants';
import { clampDrawerHeight, getDrawerSnapPoints, pickDrawerSnap } from '../game/drawer';
import { CopyBtn } from './CopyBtn';
import { Icon, Icons } from './Icons';
import { MapViewer } from './MapViewer';
import { JoinRequestCards } from './JoinRequestCards';

function lastActiveMillis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  return typeof value === 'number' ? value : 0;
}

const SNAP_ORDER = ['compact', 'half', 'expanded'];

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
  pendingJoinRequests,
  approveRequest,
  rejectRequest,
  unreadCount,
  onChatVisibilityChange,
}) => {
  const [activeTab, setActiveTab] = useState('orders');
  const [snapName, setSnapName] = useState('compact');
  const gameRef = useRef(null);
  const hudRef = useRef(null);
  const sheetRef = useRef(null);
  const sheetBodyRef = useRef(null);
  const mapRef = useRef(null);
  const dragRef = useRef(null);
  const dragFrameRef = useRef(null);
  const layoutFrameRef = useRef(null);
  const sheetHeightRef = useRef(0);
  const snapsRef = useRef({ compact: 280, half: 470, expanded: 650 });
  const activePlayerRef = useRef(null);

  const updateVisibleMapRect = useCallback(() => {
    const game = gameRef.current?.getBoundingClientRect();
    const hud = hudRef.current?.getBoundingClientRect();
    const sheet = sheetRef.current?.getBoundingClientRect();
    if (!game || !hud || !sheet) return;
    const viewport = window.visualViewport;
    const left = Math.max(0, (viewport?.offsetLeft || game.left) - game.left);
    const right = Math.min(game.width, left + (viewport?.width || game.width));
    const top = Math.max(hud.bottom - game.top, (viewport?.offsetTop || game.top) - game.top);
    const bottom = Math.min(sheet.top - game.top, ((viewport?.offsetTop || game.top) - game.top) + (viewport?.height || game.height));
    mapRef.current?.setVisibleMapRect({
      x: left,
      y: top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
    });
  }, []);

  const scheduleLayoutSync = useCallback(() => {
    window.cancelAnimationFrame(layoutFrameRef.current);
    layoutFrameRef.current = window.requestAnimationFrame(updateVisibleMapRect);
  }, [updateVisibleMapRect]);

  const applySheetHeight = useCallback((height) => {
    const normalized = clampDrawerHeight(height, snapsRef.current);
    sheetHeightRef.current = normalized;
    if (sheetRef.current) sheetRef.current.style.height = `${normalized}px`;
    if (gameRef.current) gameRef.current.style.setProperty('--aop-sheet-height', `${normalized}px`);
    scheduleLayoutSync();
  }, [scheduleLayoutSync]);

  useEffect(() => {
    if (selectedId) setActiveTab('orders');
  }, [selectedId]);

  useEffect(() => {
    if (activeTab === 'players') activePlayerRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeTab, currentPlayerId]);

  useEffect(() => {
    const visible = activeTab === 'chat'
      && document.visibilityState !== 'hidden'
      && (sheetBodyRef.current?.clientHeight || 0) > 44;
    onChatVisibilityChange?.(visible);
    if (visible) chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return () => onChatVisibilityChange?.(false);
  }, [activeTab, chatEndRef, onChatVisibilityChange, snapName]);

  useEffect(() => {
    const syncViewport = () => {
      const viewport = window.visualViewport;
      const height = viewport?.height || window.innerHeight;
      const game = gameRef.current;
      const hud = hudRef.current?.getBoundingClientRect();
      if (game) {
        game.style.height = `${height}px`;
        game.style.setProperty('--aop-visual-offset-top', `${viewport?.offsetTop || 0}px`);
      }
      snapsRef.current = getDrawerSnapPoints({
        height,
        hudBottom: hud?.height || 64,
      });
      applySheetHeight(snapsRef.current[snapName]);
    };
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(scheduleLayoutSync) : null;
    observer?.observe(hudRef.current);
    observer?.observe(sheetRef.current);
    window.addEventListener('resize', syncViewport);
    window.addEventListener('orientationchange', syncViewport);
    window.visualViewport?.addEventListener('resize', syncViewport);
    window.visualViewport?.addEventListener('scroll', scheduleLayoutSync);
    syncViewport();
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', syncViewport);
      window.removeEventListener('orientationchange', syncViewport);
      window.visualViewport?.removeEventListener('resize', syncViewport);
      window.visualViewport?.removeEventListener('scroll', scheduleLayoutSync);
    };
  }, [applySheetHeight, scheduleLayoutSync, snapName]);

  useEffect(() => () => {
    window.cancelAnimationFrame(dragFrameRef.current);
    window.cancelAnimationFrame(layoutFrameRef.current);
    document.documentElement.classList.remove('aop-drawer-dragging');
  }, []);

  const flushDragFrame = () => {
    window.cancelAnimationFrame(dragFrameRef.current);
    dragFrameRef.current = null;
    if (!dragRef.current?.latest) return;
    const { clientY, time } = dragRef.current.latest;
    dragRef.current.latest = null;
    const elapsed = Math.max(1, time - dragRef.current.lastTime);
    const instantVelocity = (dragRef.current.lastY - clientY) / elapsed;
    dragRef.current.velocity = dragRef.current.velocity * 0.65 + instantVelocity * 0.35;
    dragRef.current.lastY = clientY;
    dragRef.current.lastTime = time;
    applySheetHeight(dragRef.current.startHeight + dragRef.current.startY - clientY);
  };

  const beginDrag = (event) => {
    event.preventDefault();
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: sheetHeightRef.current || snapsRef.current[snapName],
      lastY: event.clientY,
      lastTime: event.timeStamp,
      velocity: 0,
      latest: null,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    sheetRef.current?.classList.add('is-dragging');
    document.documentElement.classList.add('aop-drawer-dragging');
  };

  const moveDrag = (event) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    event.preventDefault();
    dragRef.current.latest = { clientY: event.clientY, time: event.timeStamp };
    if (dragFrameRef.current === null) dragFrameRef.current = window.requestAnimationFrame(flushDragFrame);
  };

  const endDrag = (event) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    dragRef.current.latest = { clientY: event.clientY, time: event.timeStamp };
    if (dragRef.current.latest) flushDragFrame();
    const nextSnap = pickDrawerSnap({
      height: sheetHeightRef.current,
      velocity: dragRef.current.velocity,
      snaps: snapsRef.current,
    });
    dragRef.current = null;
    sheetRef.current?.classList.remove('is-dragging');
    document.documentElement.classList.remove('aop-drawer-dragging');
    setSnapName(nextSnap);
    applySheetHeight(snapsRef.current[nextSnap]);
  };

  const cycleSnap = () => {
    const next = SNAP_ORDER[(SNAP_ORDER.indexOf(snapName) + 1) % SNAP_ORDER.length];
    setSnapName(next);
    applySheetHeight(snapsRef.current[next]);
  };

  const openTab = (id) => {
    setActiveTab(id);
    if (id === 'chat' && snapName === 'compact') setSnapName('half');
  };

  const requestCount = pendingJoinRequests.length;
  const activeLastSeen = lastActiveMillis(roomData.players?.[currentPlayerId]?.lastActive);
  const maySkip = isHost && currentPlayerId && now - activeLastSeen >= OFFLINE_SKIP_TIMEOUT;
  const unreadLabel = unreadCount > 99 ? '99+' : String(unreadCount || '');

  return (
    <div ref={gameRef} className="aop-mobile-game aop-desk">
      <header ref={hudRef} className="aop-mobile-hud">
        <div><small>Hazine</small><strong>{(me.money || 0).toLocaleString('tr-TR')}</strong></div>
        <div><small>Biriktirme getirisi</small><strong>+{currentIncome.toLocaleString('tr-TR')}</strong></div>
        <div className="is-active-player"><small>Aktif</small><strong>{currentPlayer?.name || 'Bekleniyor'}</strong></div>
        <div><small>Round</small><strong>{roomData.roundNumber || 1}</strong></div>
        <div className="aop-mobile-room"><small>Oda</small><strong>{roomCode}</strong><CopyBtn code={roomCode}/></div>
        <button onClick={leaveRoom} className="aop-mobile-icon-btn" aria-label="Odadan ayrıl"><Icon p={Icons.LogOut}/></button>
      </header>

      <MapViewer
        ref={mapRef}
        roomData={roomData}
        roomCode={roomCode}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        legalClaims={legalClaims}
        currentPlayer={currentPlayer}
        localPlayerId={me.id}
        hideHud
        className="aop-mobile-map"
      />

      <section ref={sheetRef} className={`aop-mobile-sheet is-${snapName}`} data-snap={snapName}>
        <button
          className="aop-mobile-grip"
          onPointerDown={beginDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={cycleSnap}
          aria-label={`Emir paneli ${snapName === 'compact' ? 'kompakt' : snapName === 'half' ? 'yarım' : 'genişletilmiş'} konumda`}
        ><span/></button>
        <nav className="aop-mobile-tabs" aria-label="Oyun panelleri">
          {[
            ['orders', 'Toprak', Icons.Map],
            ['players', 'Sıra', Icons.User],
            ['chat', 'Mesaj', Icons.Send],
            ['requests', `İstek ${requestCount ? `(${requestCount})` : ''}`, Icons.User],
          ].map(([id, label, icon]) => (
            <button
              key={id}
              onClick={() => openTab(id)}
              className={activeTab === id ? 'is-active' : ''}
              aria-label={id === 'chat' && unreadCount ? `Mesaj, ${unreadCount} okunmamış mesaj` : undefined}
            >
              <span className="aop-tab-icon"><Icon p={icon} s={16}/>{id === 'chat' && unreadCount > 0 && <b className="aop-unread-badge" aria-hidden="true">{unreadLabel}</b>}</span>
              {label}
            </button>
          ))}
        </nav>
        <span className="aop-sr-only" aria-live="polite">{unreadCount ? `${unreadCount} okunmamış mesaj` : ''}</span>
        <div ref={sheetBodyRef} className="aop-mobile-sheet-body custom-scrollbar">
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
                    <span><small>Getiri</small><strong>+{selectedRegion.income.toLocaleString('tr-TR')}</strong></span>
                  </div>
                  <p className={`aop-claim-reason ${eligibility.legal ? 'is-legal' : ''}`}>{eligibility.reason}</p>
                  <button onClick={buySelected} disabled={!eligibility.legal || actionPending} className="aop-action aop-action-success aop-mobile-action">
                    {actionPending ? 'İşleniyor...' : 'Satın Al'}
                  </button>
                </>
              ) : <p className="aop-claim-reason">Haritadaki parlak kenarlı yasal bölgelerden birini seç.</p>}
              {actionError && <p className="aop-inline-error">{actionError}</p>}
              <button onClick={finishTurn} disabled={!isMyTurn || actionPending} className="aop-button aop-mobile-action aop-save-income">
                <span>Para Biriktir</span>
                <small>+{currentIncome.toLocaleString('tr-TR')} altın kazan ve sırayı geçir</small>
              </button>
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
                  <div ref={active ? activePlayerRef : null} key={playerId} className={`aop-mobile-player ${active ? 'is-active' : ''} ${offline ? 'is-offline' : ''}`}>
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
                <input
                  className="aop-input"
                  maxLength={CHAT_MESSAGE_LIMIT}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  onFocus={() => setSnapName('expanded')}
                  placeholder="Mesaj..."
                />
                <button className="aop-button-secondary aop-chat-send" aria-label="Mesaj gönder"><Icon p={Icons.Send}/></button>
              </form>
            </div>
          )}

          {activeTab === 'requests' && (
            <JoinRequestCards
              requests={pendingJoinRequests}
              roomData={roomData}
              userId={me.id}
              isHost={isHost}
              now={now}
              actionPending={actionPending}
              onApprove={approveRequest}
              onReject={rejectRequest}
              compact
            />
          )}
        </div>
      </section>
    </div>
  );
};
