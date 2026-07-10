import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './config/firebase';
import { HEARTBEAT_INTERVAL } from './constants';
import { GameRoom } from './components/GameRoom';
import { LoginScreen } from './components/LoginScreen';
import { WaitingRoom } from './components/WaitingRoom';
import { importSvgMap } from './game/mapImporter';
import { PHASES, resolvePhase } from './game/phases';
import {
  createRoom as createRoomTransaction,
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
  return { ...room, phase, claims };
}

function App() {
  const [user, setUser] = useState(null);
  const [roomCode, setRoomCode] = useState(localStorage.getItem('aop_room') || '');
  const [roomData, setRoomData] = useState(null);
  const [nickname, setNickname] = useState(localStorage.getItem('aop_nickname') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    } catch (resetError) {
      console.warn('Sıfırlama sırasında oda kaydı temizlenemedi:', resetError);
    } finally {
      localStorage.removeItem('aop_room');
      localStorage.removeItem('aop_nickname');
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
      const normalizedCode = await joinRoomTransaction(code, user.uid, nickname);
      localStorage.setItem('aop_nickname', nickname.trim());
      setRoomCode(normalizedCode);
    } catch (joinError) {
      setError(joinError.message);
      setLoading(false);
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

  const handleMapUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;
    setLoading(true);
    setError('');
    try {
      const svgText = await file.text();
      const importedMap = importSvgMap(svgText);
      await setRoomMap(roomCode, user.uid, importedMap);
    } catch (mapError) {
      setError(`Harita yüklenemedi: ${mapError.message}`);
    } finally {
      setLoading(false);
      event.target.value = '';
    }
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
