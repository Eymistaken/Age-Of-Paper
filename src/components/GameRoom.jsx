import { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../config/firebase';
import { doc, updateDoc, arrayUnion, increment } from 'firebase/firestore';
import { LeftPanel } from './SidePanels/LeftPanel';
import { RightPanel } from './SidePanels/RightPanel';
import { MapViewer } from './MapViewer';
import { MobileGameRoom } from './MobileGameRoom';
import { 
    BASE_INCOME, 
    ACTIVE_TIMEOUT, 
    PORT_COST, 
    SOLDIER_COST, 
    SOLDIER_BATCH 
} from '../constants';

export const GameRoom = ({ user, roomCode, roomData, leaveRoom, resetApp }) => {
    const [selectedId, setSelectedId] = useState(null);
    const [selectedCost, setSelectedCost] = useState(0);
    const [msg, setMsg] = useState('');
    const [now, setNow] = useState(Date.now());
    const [attackSource, setAttackSource] = useState(null);
    const [isMobileViewport, setIsMobileViewport] = useState(() => (
        typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
    ));
    const chatEndRef = useRef(null);

    const isHost = roomData.hostId === user.uid;
    const me = roomData.players[user.uid];
    const currentPlayerId = roomData.status === 'playing' ? roomData.turnOrder[roomData.turnIndex] : null;
    const isMyTurn = currentPlayerId === user.uid;
    const selectedEl = selectedId ? document.getElementById(selectedId) : null;
    const regionName = selectedEl ? selectedEl.getAttribute('data-name') : "Seçilmedi";
    const isOwnedByMe = selectedId && roomData.gameData[selectedId]?.owner === user.uid;
    const isOwnedByEnemy = selectedId && roomData.gameData[selectedId]?.owner && roomData.gameData[selectedId]?.owner !== user.uid;

    const currentIncome = useMemo(() => {
        let totalValue = 0;
        const myLandIds = Object.entries(roomData.gameData || {}).filter(([, data]) => data.owner === user.uid).map(([id]) => id);
        
        myLandIds.forEach(id => {
            if(roomData.gameData[id].value) {
                totalValue += roomData.gameData[id].value;
            } else {
                const el = document.getElementById(id);
                if(el) {
                    try {
                        const bbox = el.getBBox();
                        let price = (bbox.width * bbox.height) / 15 + 4000;
                        totalValue += Math.ceil(price / 100) * 100;
                    } catch {
                        console.warn("Bölge sınırları okunamadı:", id);
                    }
                }
            }
        });
        return BASE_INCOME + Math.floor(totalValue / 10);
    }, [roomData.gameData, user.uid]);

    useEffect(() => {
        if (isHost && roomData.status === 'playing' && !roomData.isWar) {
            const mapViewer = document.querySelector('.default-land');
            if (mapViewer) {
                const allRegions = document.querySelectorAll('.default-land').length;
                const ownedRegions = Object.keys(roomData.gameData || {}).length;
                if (ownedRegions >= allRegions && allRegions > 0) {
                     updateDoc(doc(db, 'rooms', roomCode), { isWar: true });
                }
            }
        }
    }, [roomData, isHost, roomCode]);

    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const media = window.matchMedia('(max-width: 767px)');
        const updateViewport = () => setIsMobileViewport(media.matches);

        updateViewport();
        media.addEventListener('change', updateViewport);

        return () => media.removeEventListener('change', updateViewport);
    }, []);

    useEffect(() => {
        if (roomData.status === 'playing' && currentPlayerId) {
            const currentPlayer = roomData.players[currentPlayerId];
            if (currentPlayer) {
                const isOffline = (now - (currentPlayer.lastActive || 0)) > ACTIVE_TIMEOUT;
                if (isOffline && user.uid !== currentPlayerId) {
                     if (Math.random() < 0.1) {
                         // Fallback logic
                        const nextIdx = (roomData.turnIndex + 1) % roomData.turnOrder.length;
                        updateDoc(doc(db, 'rooms', roomCode), { turnIndex: nextIdx }).catch((err) => {
                            console.warn("Sıra atlama başarısız:", err);
                        });
                     }
                }
            }
        }
    }, [now, currentPlayerId, roomData, roomCode, user.uid]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [roomData.chat]);

    useEffect(() => {
        if(!selectedId) {
            setSelectedCost(0);
            setAttackSource(null);
            return;
        }
        const el = document.getElementById(selectedId);
        if(el) {
            try {
                const bbox = el.getBBox();
                let rawPrice = (bbox.width * bbox.height) / 15 + 4000;
                const finalPrice = Math.ceil(rawPrice / 100) * 100;
                setSelectedCost(finalPrice);
            } catch {
                setSelectedCost(10000);
            }
        }
    }, [selectedId]);

    const isAdjacent = (id1, id2) => {
        const el1 = document.getElementById(id1);
        const el2 = document.getElementById(id2);
        if(!el1 || !el2) return false;
        const r1 = el1.getBoundingClientRect();
        const r2 = el2.getBoundingClientRect();
        const tol = 20; 
        return !(r1.right + tol < r2.left || r1.left - tol > r2.right || r1.bottom + tol < r2.top || r1.top - tol > r2.bottom);
    };

    const checkAdjacency = (targetId) => {
        const myLandIds = Object.entries(roomData.gameData || {}).filter(([, data]) => data.owner === user.uid).map(([id]) => id);
        if (myLandIds.length === 0) return true;
        return myLandIds.some(landId => isAdjacent(targetId, landId));
    };

    const buyRegion = async () => {
        if(!isMyTurn || !selectedId) return false;
        if(roomData.gameData[selectedId]?.owner) {
            alert("Sahipli bölge!");
            return false;
        }
        if(me.money < selectedCost) {
            alert(`Yetersiz Bakiye!`);
            return false;
        }
        if (!checkAdjacency(selectedId)) {
            alert("Sınır komşusu gerekli!");
            return false;
        }

        await updateDoc(doc(db, 'rooms', roomCode), {
            [`gameData.${selectedId}`]: { owner: user.uid, color: me.color, soldiers: 0, hasPort: false, value: selectedCost },
            [`players.${user.uid}.money`]: increment(-selectedCost),
            turnIndex: (roomData.turnIndex + 1) % roomData.turnOrder.length
        });
        setSelectedId(null);
        return true;
    };

    const passTurn = async () => {
        if(!isMyTurn) return false;
        await updateDoc(doc(db, 'rooms', roomCode), {
            [`players.${user.uid}.money`]: increment(currentIncome),
            turnIndex: (roomData.turnIndex + 1) % roomData.turnOrder.length
        });
        return true;
    };

    const trainSoldiers = async () => {
        if(me.money < SOLDIER_COST) {
            alert("Yetersiz para!");
            return false;
        }
        await updateDoc(doc(db, 'rooms', roomCode), {
            [`players.${user.uid}.money`]: increment(-SOLDIER_COST),
            [`players.${user.uid}.reserve`]: increment(SOLDIER_BATCH)
        });
        return true;
    };

    const deploySoldiers = async () => {
        if(!isMyTurn || !selectedId || !isOwnedByMe) return false;
        if(me.reserve < SOLDIER_BATCH) {
            alert("Rezervde asker yok! Önce eğit.");
            return false;
        }
        await updateDoc(doc(db, 'rooms', roomCode), {
            [`players.${user.uid}.reserve`]: increment(-SOLDIER_BATCH),
            [`gameData.${selectedId}.soldiers`]: increment(SOLDIER_BATCH)
        });
        return true;
    };

    const buildPort = async () => {
        if(!isMyTurn || !selectedId || !isOwnedByMe) return false;
        if(me.money < PORT_COST) {
            alert("Liman için 90.000$ lazım!");
            return false;
        }
        await updateDoc(doc(db, 'rooms', roomCode), {
            [`players.${user.uid}.money`]: increment(-PORT_COST),
            [`gameData.${selectedId}.hasPort`]: true
        });
        return true;
    };

    const attack = async (type) => {
        if(!isMyTurn || !selectedId || !isOwnedByEnemy || !attackSource) {
            alert("Kaynak seçilmedi!");
            return false;
        }
        
        const sourceData = roomData.gameData[attackSource];
        const targetData = roomData.gameData[selectedId];
        const attackAmount = sourceData.soldiers;

        if(attackAmount <= 0) {
            alert("Saldıracak asker yok!");
            return false;
        }

        if (type === 'LAND') {
            if(!isAdjacent(attackSource, selectedId)) {
                alert("Kara saldırısı için sınır komşusu olmalı!");
                return false;
            }
        } else if (type === 'SEA') {
            if(!sourceData.hasPort) {
                alert("Deniz saldırısı için kaynak şehirde Liman olmalı!");
                return false;
            }
        }

        const defenderAmount = targetData.soldiers || 0;
        
        if (attackAmount > defenderAmount) {
            const survivors = attackAmount - defenderAmount;
            await updateDoc(doc(db, 'rooms', roomCode), {
                [`gameData.${attackSource}.soldiers`]: 0,
                [`gameData.${selectedId}`]: { 
                    owner: user.uid, 
                    color: me.color, 
                    soldiers: survivors, 
                    hasPort: targetData.hasPort,
                    value: targetData.value || 0 
                },
                turnIndex: (roomData.turnIndex + 1) % roomData.turnOrder.length
            });
        } else {
            await updateDoc(doc(db, 'rooms', roomCode), {
                [`gameData.${attackSource}.soldiers`]: 0, 
                [`gameData.${selectedId}.soldiers`]: defenderAmount - attackAmount,
                 turnIndex: (roomData.turnIndex + 1) % roomData.turnOrder.length
            });
        }
        setSelectedId(null);
        setAttackSource(null);
        return true;
    };

    const sendMessage = async (e) => {
        e.preventDefault();
        if(!msg.trim()) return;
        await updateDoc(doc(db, 'rooms', roomCode), { chat: arrayUnion({ s: me.name, c: me.color, t: msg }) });
        setMsg('');
    };

    if (isMobileViewport) {
        return (
            <MobileGameRoom
                roomData={roomData}
                roomCode={roomCode}
                selectedId={selectedId}
                setSelectedId={setSelectedId}
                leaveRoom={leaveRoom}
                resetApp={resetApp}
                currentPlayerId={currentPlayerId}
                now={now}
                msg={msg}
                setMsg={setMsg}
                sendMessage={sendMessage}
                chatEndRef={chatEndRef}
                currentIncome={currentIncome}
                isMyTurn={isMyTurn}
                regionName={regionName}
                selectedCost={selectedCost}
                isOwnedByMe={isOwnedByMe}
                isOwnedByEnemy={isOwnedByEnemy}
                buyRegion={buyRegion}
                deploySoldiers={deploySoldiers}
                buildPort={buildPort}
                setAttackSource={setAttackSource}
                attackSource={attackSource}
                attack={attack}
                trainSoldiers={trainSoldiers}
                passTurn={passTurn}
            />
        );
    }

    return (
        <div className="flex flex-col md:flex-row h-screen w-full overflow-hidden aop-desk">
            <LeftPanel 
                roomData={roomData}
                currentPlayerId={currentPlayerId}
                now={now}
                msg={msg}
                setMsg={setMsg}
                sendMessage={sendMessage}
                chatEndRef={chatEndRef}
            />
            <MapViewer 
                roomData={roomData}
                roomCode={roomCode}
                selectedId={selectedId}
                setSelectedId={setSelectedId}
                leaveRoom={leaveRoom}
                resetApp={resetApp}
            />
            <RightPanel 
                me={me}
                roomData={roomData}
                currentIncome={currentIncome}
                isMyTurn={isMyTurn}
                regionName={regionName}
                selectedId={selectedId}
                selectedCost={selectedCost}
                isOwnedByMe={isOwnedByMe}
                isOwnedByEnemy={isOwnedByEnemy}
                buyRegion={buyRegion}
                deploySoldiers={deploySoldiers}
                buildPort={buildPort}
                setAttackSource={setAttackSource}
                attackSource={attackSource}
                attack={attack}
                trainSoldiers={trainSoldiers}
                passTurn={passTurn}
            />
        </div>
    );
};
