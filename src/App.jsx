import { useState, useEffect } from 'react';
import { auth, db } from './config/firebase';
import { doc, setDoc, getDoc, updateDoc, onSnapshot, deleteField, deleteDoc } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { LoginScreen } from './components/LoginScreen';
import { WaitingRoom } from './components/WaitingRoom';
import { GameRoom } from './components/GameRoom';
import { COLORS, STARTING_MONEY, MAX_PLAYERS, HEARTBEAT_INTERVAL } from './constants';

function App() {
    const [user, setUser] = useState(null);
    const [roomCode, setRoomCode] = useState(localStorage.getItem('aop_room') || '');
    const [roomData, setRoomData] = useState(null);
    const [nickname, setNickname] = useState(localStorage.getItem('aop_nickname') || '');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (u) => {
            if (u) setUser(u);
            else signInAnonymously(auth).catch(e => setError("Giriş Hatası: " + e.message));
        });
        return () => unsub();
    }, []);

    useEffect(() => {
        if (!user || !roomCode) return;

        const unsub = onSnapshot(doc(db, 'rooms', roomCode), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (!data.players[user.uid]) {
                    localStorage.removeItem('aop_room');
                    setRoomCode('');
                    setRoomData(null);
                    setError("Odadan ayrıldınız.");
                } else {
                    setRoomData(data);
                    localStorage.setItem('aop_room', roomCode);
                }
            } else {
                localStorage.removeItem('aop_room');
                setRoomCode('');
                setRoomData(null);
            }
            setLoading(false);
        }, (err) => {
            console.error(err);
            setLoading(false);
            localStorage.removeItem('aop_room');
            setRoomCode('');
            setError("Bağlantı koptu.");
        });

        return () => unsub();
    }, [user, roomCode]);

    useEffect(() => {
        if(!user || !roomCode || !roomData) return;
        const interval = setInterval(() => {
            updateDoc(doc(db, 'rooms', roomCode), {
                [`players.${user.uid}.lastActive`]: Date.now()
            }).catch(e => console.log("Heartbeat fail", e));
        }, HEARTBEAT_INTERVAL);
        return () => clearInterval(interval);
    }, [user, roomCode, roomData]);

    const resetApp = () => {
        localStorage.clear();
        window.location.reload();
    };

    const createRoom = async () => {
        if (!nickname) return setError("Lütfen bir isim girin.");
        setLoading(true);
        setError("");
        const code = Math.random().toString(36).substring(2, 6).toUpperCase();
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Sunucu yanıt vermedi.")), 10000));
        const writePromise = setDoc(doc(db, 'rooms', code), {
            hostId: user.uid, status: 'lobby', mapSvg: '', turnIndex: 0, turnOrder: [],
            isWar: false,
            players: { 
                [user.uid]: { 
                    id: user.uid, 
                    name: nickname, 
                    color: COLORS[0], 
                    money: STARTING_MONEY, 
                    ready: true,
                    lastActive: Date.now(),
                    reserve: 0
                } 
            },
            chat: [], gameData: {}
        });
        try {
            await Promise.race([writePromise, timeoutPromise]);
            localStorage.setItem('aop_nickname', nickname);
            setRoomCode(code); 
        } catch (e) { setError(e.message); setLoading(false); }
    };

    const joinRoom = async (code) => {
        if (!nickname || !code) return setError("Kod gerekli.");
        setLoading(true);
        const roomRef = doc(db, 'rooms', code);
        try {
            const snap = await getDoc(roomRef);
            if (!snap.exists()) throw new Error("Oda bulunamadı.");
            const data = snap.data();
            if (Object.keys(data.players).length >= MAX_PLAYERS) throw new Error("Oda dolu.");
            if (data.status === 'playing') throw new Error("Oyun başlamış.");
            const playerIndex = Object.keys(data.players).length;
            await updateDoc(roomRef, { 
                [`players.${user.uid}`]: { 
                    id: user.uid, 
                    name: nickname, 
                    color: COLORS[playerIndex], 
                    money: STARTING_MONEY, 
                    ready: true,
                    lastActive: Date.now(),
                    reserve: 0
                } 
            });
            localStorage.setItem('aop_nickname', nickname);
            setRoomCode(code);
        } catch (e) { setError(e.message); setLoading(false); }
    };

    const leaveRoom = async () => {
        if (roomCode && user) {
            try {
                const roomRef = doc(db, 'rooms', roomCode);
                await updateDoc(roomRef, { [`players.${user.uid}`]: deleteField() });
                const snap = await getDoc(roomRef);
                if (snap.exists() && Object.keys(snap.data().players || {}).length === 0) {
                    await deleteDoc(roomRef);
                }
            } catch(e) { console.log("Çıkış hatası", e); }
        }
        setRoomCode(''); setRoomData(null); localStorage.removeItem('aop_room');
    };

    if (!user) {
        return (
            <div className="h-screen flex flex-col items-center justify-center text-yellow-500 bg-gray-900">
                <div className="mb-4">Bağlanıyor...</div>
                <button onClick={resetApp} className="text-xs border border-gray-700 px-2 py-1 rounded text-gray-500">
                    Sıfırla
                </button>
            </div>
        );
    }

    if (!roomData) {
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

    if (roomData.status === 'lobby') {
        const players = Object.values(roomData.players);
        const isHost = roomData.hostId === user.uid;

        const handleMapUpload = (e) => {
            const f = e.target.files[0];
            if(f) {
                const r = new FileReader();
                r.onload = (ev) => updateDoc(doc(db, 'rooms', roomCode), { mapSvg: ev.target.result });
                r.readAsText(f);
            }
        };

        const startGame = async () => {
            const shuffled = players.map(p => p.id).sort(() => Math.random() - 0.5);
            await updateDoc(doc(db, 'rooms', roomCode), { status: 'playing', turnOrder: shuffled, turnIndex: 0 });
        };

        return (
            <WaitingRoom 
                roomCode={roomCode}
                players={players}
                roomData={roomData}
                isHost={isHost}
                handleMapUpload={handleMapUpload}
                startGame={startGame}
                leaveRoom={leaveRoom}
                resetApp={resetApp}
            />
        );
    }

    return (
        <GameRoom 
            user={user} 
            roomCode={roomCode} 
            roomData={roomData} 
            leaveRoom={leaveRoom} 
            resetApp={resetApp} 
        />
    );
}

export default App;
