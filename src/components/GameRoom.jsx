import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { calculateIncome } from '../game/economy';
import { PHASES } from '../game/phases';
import { getClaimEligibility, getLegalClaims } from '../game/rules';
import {
  claimRegion,
  endTurn,
  ensureTurnIncome,
  sendChatMessage,
  skipOfflineTurn,
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
  const [compactViewport, setCompactViewport] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches
  ));
  const chatEndRef = useRef(null);

  const me = roomData.players?.[user.uid];
  const currentPlayerId = roomData.turnOrder?.[roomData.turnIndex] || null;
  const currentPlayer = roomData.players?.[currentPlayerId];
  const isMyTurn = roomData.phase === PHASES.CLAIMING && currentPlayerId === user.uid;
  const isHost = roomData.hostId === user.uid;
  const regionsById = useMemo(() => roomData.mapDefinition?.regionsById || {}, [roomData.mapDefinition]);
  const selectedRegion = selectedId ? regionsById[selectedId] : null;
  const selectedClaim = selectedId ? roomData.claims?.[selectedId] : null;
  const selectedOwner = selectedClaim?.ownerId ? roomData.players?.[selectedClaim.ownerId] : null;
  const currentIncome = Number.isFinite(me?.income)
    ? me.income
    : calculateIncome(roomData.mapDefinition, roomData.claims, user.uid);
  const lastChatId = roomData.chat?.at(-1)?.id || roomData.chat?.length || 0;

  const legalClaims = useMemo(() => (
    isMyTurn ? getLegalClaims(roomData.mapDefinition, roomData.claims, user.uid) : []
  ), [isMyTurn, roomData.claims, roomData.mapDefinition, user.uid]);

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
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [lastChatId]);

  useEffect(() => {
    if (!isMyTurn || (me?.lastIncomeTurn || 0) >= roomData.turnNumber) return;
    ensureTurnIncome(roomCode, user.uid).catch((error) => setActionError(error.message));
  }, [isMyTurn, me?.lastIncomeTurn, roomCode, roomData.turnNumber, user.uid]);

  useEffect(() => {
    if (selectedId && !regionsById[selectedId]) setSelectedId(null);
  }, [regionsById, selectedId]);

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
    () => claimRegion(roomCode, user.uid, selectedId),
    { clearSelection: true },
  );
  const finishTurn = () => runAction(() => endTurn(roomCode, user.uid));
  const skipPlayer = () => runAction(() => skipOfflineTurn(roomCode, user.uid));
  const submitMessage = async (event) => {
    event.preventDefault();
    const sent = await runAction(() => sendChatMessage(roomCode, user.uid, message));
    if (sent) setMessage('');
  };

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
    resetApp,
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
      />
      <RightPanel {...shared} />
    </div>
  );
};
