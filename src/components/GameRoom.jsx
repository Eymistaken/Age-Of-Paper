import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { calculateIncome } from '../game/economy';
import { PHASES } from '../game/phases';
import { isJoinRequestExpired, valueMillis } from '../game/joinRequests';
import { getClaimEligibility, getLegalClaims } from '../game/rules';
import {
  readStoredUnread,
  unreadStorageKey,
  updateUnreadState,
  writeStoredUnread,
} from '../game/unreadMessages';
import {
  claimRegion,
  acceptJoinRequest,
  clearClosedJoinRequest,
  expireJoinRequest,
  rejectJoinRequest,
  saveIncome,
  sendChatMessage,
  skipOfflineTurn,
  voteJoinRequest,
} from '../services/roomService';
import { ClaimCompletePanel } from './ClaimCompletePanel';
import { MapViewer } from './MapViewer';
import { MobileGameRoom } from './MobileGameRoom';
import { LeftPanel } from './SidePanels/LeftPanel';
import { RightPanel } from './SidePanels/RightPanel';

export const GameRoom = ({ user, roomCode, roomData, leaveRoom, resetApp }) => {
  const [selectedId, setSelectedId] = useState(null);
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionPending, setActionPending] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [mobileChatVisible, setMobileChatVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState !== 'hidden');
  const [unreadCount, setUnreadCount] = useState(0);
  const [compactViewport, setCompactViewport] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches
  ));
  const chatEndRef = useRef(null);
  const expiringRequests = useRef(new Set());
  const unreadStateRef = useRef(null);
  const latestChatRef = useRef(roomData.chat || []);
  latestChatRef.current = roomData.chat || [];

  const me = roomData.players?.[user.uid];
  const currentPlayerId = roomData.turnOrder?.[roomData.turnIndex] || null;
  const currentPlayer = roomData.players?.[currentPlayerId];
  const isMyTurn = roomData.phase === PHASES.CLAIMING && currentPlayerId === user.uid;
  const isHost = roomData.hostId === user.uid;
  const regionsById = useMemo(() => roomData.mapDefinition?.regionsById || {}, [roomData.mapDefinition]);
  const selectedRegion = selectedId ? regionsById[selectedId] : null;
  const selectedClaim = selectedId ? roomData.claims?.[selectedId] : null;
  const selectedOwner = selectedClaim?.ownerId ? roomData.players?.[selectedClaim.ownerId] : null;
  const currentIncome = calculateIncome(roomData.mapDefinition, roomData.claims, user.uid);
  const lastChatId = roomData.chat?.at(-1)?.id || roomData.chat?.length || 0;
  const pendingJoinRequests = useMemo(() => Object.values(roomData.joinRequests || {})
    .filter((request) => request.status === 'pending' && !isJoinRequestExpired(request, now))
    .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0)), [now, roomData.joinRequests]);

  const legalClaims = useMemo(() => (
    isMyTurn ? getLegalClaims(roomData.mapDefinition, roomData.claims, user.uid) : []
  ), [isMyTurn, roomData.claims, roomData.mapDefinition, user.uid]);
  const unreadKey = useMemo(() => unreadStorageKey(roomCode, user.uid), [roomCode, user.uid]);
  const chatVisible = pageVisible && (compactViewport ? mobileChatVisible : true);

  const eligibility = useMemo(() => getClaimEligibility({
    phase: roomData.phase,
    mapDefinition: roomData.mapDefinition,
    claims: roomData.claims,
    playerId: user.uid,
    regionId: selectedId,
    money: me?.money,
    isActive: isMyTurn,
  }), [isMyTurn, me?.money, roomData.claims, roomData.mapDefinition, roomData.phase, selectedId, user.uid]);

  useEffect(() => {
    if (roomData.phase !== PHASES.CLAIMING) return undefined;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [roomData.phase]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)');
    const update = () => setCompactViewport(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const update = () => setPageVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  useEffect(() => {
    unreadStateRef.current = readStoredUnread(window.localStorage, unreadKey, latestChatRef.current);
    setUnreadCount(unreadStateRef.current.unread);
  }, [unreadKey]);

  useEffect(() => {
    if (!unreadStateRef.current) return;
    const next = updateUnreadState(unreadStateRef.current, roomData.chat || [], user.uid, chatVisible);
    unreadStateRef.current = next;
    writeStoredUnread(window.localStorage, unreadKey, next);
    setUnreadCount(next.unread);
  }, [chatVisible, roomData.chat, unreadKey, user.uid]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [lastChatId]);

  useEffect(() => {
    if (selectedId && !regionsById[selectedId]) setSelectedId(null);
  }, [regionsById, selectedId]);

  useEffect(() => {
    Object.values(roomData.joinRequests || {}).forEach((request) => {
      if (request.status !== 'pending' || !isJoinRequestExpired(request, now) || expiringRequests.current.has(request.uid)) return;
      expiringRequests.current.add(request.uid);
      expireJoinRequest(roomCode, user.uid, request.uid)
        .catch(() => {})
        .finally(() => expiringRequests.current.delete(request.uid));
    });
  }, [now, roomCode, roomData.joinRequests, user.uid]);

  useEffect(() => {
    if (!isHost) return;
    Object.values(roomData.joinRequests || {}).forEach((request) => {
      if (request.status === 'pending'
        || now - valueMillis(request.decisionAt) < 30_000
        || expiringRequests.current.has(`clear-${request.uid}`)) return;
      expiringRequests.current.add(`clear-${request.uid}`);
      clearClosedJoinRequest(roomCode, user.uid, request.uid)
        .catch(() => {})
        .finally(() => expiringRequests.current.delete(`clear-${request.uid}`));
    });
  }, [isHost, now, roomCode, roomData.joinRequests, user.uid]);

  const runAction = useCallback(async (action, { clearSelection = false } = {}) => {
    if (actionPending) return false;
    setActionPending(true);
    setActionError('');
    try {
      await action();
      if (clearSelection) setSelectedId(null);
      return true;
    } catch (error) {
      setActionError(error.message || 'İşlem tamamlanamadı.');
      return false;
    } finally {
      setActionPending(false);
    }
  }, [actionPending]);

  const buySelected = () => runAction(
    () => claimRegion(roomCode, user.uid, selectedId, roomData.turnNumber),
    { clearSelection: true },
  );
  const finishTurn = () => runAction(() => saveIncome(roomCode, user.uid, roomData.turnNumber));
  const skipPlayer = () => runAction(() => skipOfflineTurn(roomCode, user.uid));
  const submitMessage = async (event) => {
    event.preventDefault();
    const sent = await runAction(() => sendChatMessage(roomCode, user.uid, message));
    if (sent) setMessage('');
  };
  const approveRequest = (requesterId) => runAction(() => (
    isHost
      ? acceptJoinRequest(roomCode, user.uid, requesterId)
      : voteJoinRequest(roomCode, user.uid, requesterId, 'approve')
  ));
  const rejectRequest = (requesterId) => runAction(() => (
    isHost
      ? rejectJoinRequest(roomCode, user.uid, requesterId)
      : voteJoinRequest(roomCode, user.uid, requesterId, 'reject')
  ));

  const shared = {
    roomData,
    roomCode,
    me,
    currentIncome,
    currentPlayerId,
    currentPlayer,
    isMyTurn,
    isHost,
    selectedId,
    selectedRegion,
    selectedOwner,
    eligibility,
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
    pendingJoinRequests,
    approveRequest,
    rejectRequest,
    resetApp,
    unreadCount,
  };

  if (roomData.phase === PHASES.CLAIM_COMPLETE) {
    return <ClaimCompletePanel roomData={roomData} roomCode={roomCode} leaveRoom={leaveRoom} />;
  }

  if (compactViewport) {
    return (
      <MobileGameRoom
        {...shared}
        setSelectedId={setSelectedId}
        legalClaims={legalClaims}
        leaveRoom={leaveRoom}
        onChatVisibilityChange={setMobileChatVisible}
      />
    );
  }

  return (
    <div className="aop-game-layout aop-desk">
      <LeftPanel {...shared} />
      <MapViewer
        roomData={roomData}
        roomCode={roomCode}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        legalClaims={legalClaims}
        currentPlayer={currentPlayer}
        leaveRoom={leaveRoom}
        localPlayerId={user.uid}
      />
      <RightPanel {...shared} />
    </div>
  );
};
