import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './config/firebase';
import { HEARTBEAT_INTERVAL } from './constants';
import { GameRoom } from './components/GameRoom';
import { LoginScreen } from './components/LoginScreen';
import { JoinRequestWaiting } from './components/JoinRequestWaiting';
import { WaitingRoom } from './components/WaitingRoom';
import { importSvgMap } from './game/mapImporter';
import { readSvgFile } from './game/svgUpload';
import { PHASES, resolvePhase } from './game/phases';
import {
  createRoom as createRoomTransaction,
  cancelJoinRequest,
  expireJoinRequest,
  joinRoom as joinRoomTransaction,
  leaveRoom as leaveRoomTransaction,
  setRoomMap,
  startGame as startGameTransaction,
  updatePresence,
} from './services/roomService';

function normalizeLegacyRoom(room) {
  const phase = resolvePhase(room);
  const claims = room.claims || Object.fromEntries(
    Object.entries(room.gameData || {})
      .filter(([, value]) => value?.owner)
      .map(([regionId, value]) => [regionId, { ownerId: value.owner }]),
  );
  return { ...room, phase, claims, joinRequests: room.joinRequests || {} };
}

function storedPendingRequest() {
  try {
    const value = JSON.parse(localStorage.getItem('aop_pending_request') || 'null');
    return value?.roomCode && value?.nickname ? value : null;
  } catch {
    localStorage.removeItem('aop_pending_request');
    return null;
  }
}

function App() {
  const [user, setUser] = useState(null);
  const [roomCode, setRoomCode] = useState(localStorage.getItem('aop_room') || '');
  const [roomData, setRoomData] = useState(null);
  const [nickname, setNickname] = useState(localStorage.getItem('aop_nickname') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingRequest, setPendingRequest] = useState(storedPendingRequest);
  const [pendingRoomData, setPendingRoomData] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      if (nextUser) setUser(nextUser);
      else signInAnonymously(auth).catch((authError) => setError(`Giriş hatası: ${authError.message}`));
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user || !roomCode) return undefined;
    const unsubscribe = onSnapshot(doc(db, 'rooms', roomCode), (snapshot) => {
      if (!snapshot.exists() || !snapshot.data().players?.[user.uid]) {
        localStorage.removeItem('aop_room');
        setRoomCode('');
        setRoomData(null);
        setError(snapshot.exists() ? 'Bu odada artık yer almıyorsun.' : 'Oda artık mevcut değil.');
      } else {
        setRoomData(snapshot.data());
        localStorage.setItem('aop_room', roomCode);
      }
      setLoading(false);
    }, (snapshotError) => {
      console.error(snapshotError);
      setLoading(false);
      setError('Oda bağlantısı kurulamadı.');
    });
    return unsubscribe;
  }, [roomCode, user]);

  useEffect(() => {
    if (!user || roomCode || !pendingRequest?.roomCode) return undefined;
    const code = pendingRequest.roomCode;
    return onSnapshot(doc(db, 'rooms', code), (snapshot) => {
      if (!snapshot.exists()) {
        localStorage.removeItem('aop_pending_request');
        setPendingRequest(null);
        setPendingRoomData(null);
        setError('Oda artık mevcut değil.');
        setLoading(false);
        return;
      }
      const room = normalizeLegacyRoom(snapshot.data());
      const request = room.joinRequests?.[user.uid];
      if (room.players?.[user.uid]) {
        localStorage.removeItem('aop_pending_request');
        localStorage.setItem('aop_nickname', pendingRequest.nickname);
        localStorage.setItem('aop_room', code);
        setPendingRequest(null);
        setPendingRoomData(null);
        setRoomData(room);
        setRoomCode(code);
      } else if (!request) {
        localStorage.removeItem('aop_pending_request');
        setPendingRequest(null);
        setPendingRoomData(null);
        setError('Katılma isteği artık mevcut değil.');
      } else if (request.status === 'pending' && room.phase !== PHASES.CLAIMING) {
        cancelJoinRequest(code, user.uid).catch(() => {});
        localStorage.removeItem('aop_pending_request');
        setPendingRequest(null);
        setPendingRoomData(null);
        setError('Toprak edinme evresi tamamlandığı için istek kapatıldı.');
      } else if (request.status !== 'pending') {
        const messages = {
          rejected: 'Katılma isteğin kurucu tarafından reddedildi.',
          cancelled: 'Katılma isteğin iptal edildi.',
          expired: 'Katılma isteğinin süresi doldu.',
        };
        localStorage.removeItem('aop_pending_request');
        setPendingRequest(null);
        setPendingRoomData(null);
        setError(messages[request.status] || 'Katılma isteği kapandı.');
      } else {
        setPendingRoomData(room);
      }
      setLoading(false);
    }, () => {
      setLoading(false);
      setError('Katılma isteği bağlantısı kurulamadı.');
    });
  }, [pendingRequest, roomCode, user]);

  const isInRoom = Boolean(user && roomCode && roomData);
  useEffect(() => {
    if (!isInRoom) return undefined;
    const heartbeat = () => {
      if (document.visibilityState === 'visible') {
        updatePresence(roomCode, user.uid).catch((presenceError) => console.warn('Presence güncellenemedi:', presenceError));
      }
    };
    heartbeat();
    const interval = window.setInterval(heartbeat, HEARTBEAT_INTERVAL);
    document.addEventListener('visibilitychange', heartbeat);
    window.addEventListener('focus', heartbeat);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', heartbeat);
      window.removeEventListener('focus', heartbeat);
    };
  }, [isInRoom, roomCode, user]);

  const effectiveRoom = useMemo(() => roomData && normalizeLegacyRoom(roomData), [roomData]);

  const resetApp = async () => {
    try {
      if (roomCode && user) await leaveRoomTransaction(roomCode, user.uid);
      else if (pendingRequest && user) await cancelJoinRequest(pendingRequest.roomCode, user.uid);
    } catch (resetError) {
      console.warn('Sıfırlama sırasında oda kaydı temizlenemedi:', resetError);
    } finally {
      localStorage.removeItem('aop_room');
      localStorage.removeItem('aop_nickname');
      localStorage.removeItem('aop_pending_request');
      window.location.reload();
    }
  };

  const createRoom = async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const code = await createRoomTransaction(user.uid, nickname);
      localStorage.setItem('aop_nickname', nickname.trim());
      setRoomCode(code);
    } catch (createError) {
      setError(createError.message);
      setLoading(false);
    }
  };

  const joinRoom = async (code) => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const result = await joinRoomTransaction(code, user.uid, nickname);
      localStorage.setItem('aop_nickname', nickname.trim());
      if (result.mode === 'requested') {
        const pending = { roomCode: result.code, nickname: nickname.trim() };
        localStorage.setItem('aop_pending_request', JSON.stringify(pending));
        setPendingRequest(pending);
        setPendingRoomData({ joinRequests: { [user.uid]: result.request } });
        setLoading(false);
      } else {
        setRoomCode(result.code);
      }
    } catch (joinError) {
      setError(joinError.message);
      setLoading(false);
    }
  };

  const cancelPending = async () => {
    if (!user || !pendingRequest) return;
    setLoading(true);
    let cancelled = false;
    try {
      cancelled = await cancelJoinRequest(pendingRequest.roomCode, user.uid);
    } catch (cancelError) {
      if (cancelError?.code !== 'REQUEST_NOT_PENDING') {
        setError(cancelError.message);
      } else {
        setLoading(false);
        return;
      }
    } finally {
      if (cancelled) {
        localStorage.removeItem('aop_pending_request');
        setPendingRequest(null);
        setPendingRoomData(null);
        setLoading(false);
      } else setLoading(false);
    }
  };

  const expirePending = async () => {
    if (!user || !pendingRequest) return;
    try {
      await expireJoinRequest(pendingRequest.roomCode, user.uid, user.uid);
    } catch (expireError) {
      if (!['REQUEST_ACTIVE', 'REQUEST_NOT_PENDING'].includes(expireError?.code)) setError(expireError.message);
    }
  };

  const leaveRoom = async () => {
    try {
      if (roomCode && user) await leaveRoomTransaction(roomCode, user.uid);
    } catch (leaveError) {
      console.warn('Odadan ayrılma tamamlanamadı:', leaveError);
      setError(leaveError.message);
    } finally {
      setRoomCode('');
      setRoomData(null);
      localStorage.removeItem('aop_room');
    }
  };

  const handleMapFile = async (file, directError = '') => {
    if (directError) {
      setError(directError);
      return;
    }
    if (!file || !user) return;
    setLoading(true);
    setError('');
    try {
      const svgText = await readSvgFile(file);
      const importedMap = importSvgMap(svgText);
      await setRoomMap(roomCode, user.uid, importedMap);
    } catch (mapError) {
      setError(`Harita yüklenemedi: ${mapError.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleMapUpload = async (event) => {
    const file = event.target.files?.[0];
    await handleMapFile(file);
    event.target.value = '';
  };

  const startGame = async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      await startGameTransaction(roomCode, user.uid);
    } catch (startError) {
      setError(startError.message);
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="h-screen flex flex-col items-center justify-center text-[var(--aop-gold)] aop-desk">
        <div className="aop-title text-3xl mb-2">Age of Paper</div>
        <div className="mb-4 text-[var(--aop-muted)]">Harita masasına bağlanıyor...</div>
        <button onClick={resetApp} className="aop-button-secondary min-h-11 px-3 py-2">Sıfırla</button>
      </div>
    );
  }

  if (!effectiveRoom) {
    if (pendingRequest) {
      return (
        <JoinRequestWaiting
          roomCode={pendingRequest.roomCode}
          nickname={pendingRequest.nickname}
          request={pendingRoomData?.joinRequests?.[user.uid]}
          loading={loading}
          onCancel={cancelPending}
          onExpire={expirePending}
        />
      );
    }
    return (
      <LoginScreen
        nickname={nickname}
        setNickname={setNickname}
        createRoom={createRoom}
        joinRoom={joinRoom}
        loading={loading}
        error={error}
        resetApp={resetApp}
      />
    );
  }

  if (effectiveRoom.phase === PHASES.LOBBY) {
    return (
      <WaitingRoom
        roomCode={roomCode}
        players={Object.values(effectiveRoom.players || {})}
        roomData={effectiveRoom}
        isHost={effectiveRoom.hostId === user.uid}
        handleMapUpload={handleMapUpload}
        handleMapFile={handleMapFile}
        startGame={startGame}
        leaveRoom={leaveRoom}
        resetApp={resetApp}
        loading={loading}
        error={error}
      />
    );
  }

  return (
    <GameRoom
      user={user}
      roomCode={roomCode}
      roomData={effectiveRoom}
      leaveRoom={leaveRoom}
      resetApp={resetApp}
    />
  );
}

export default App;
