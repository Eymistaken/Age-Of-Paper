import { Icon, Icons } from './Icons';
import { CopyBtn } from './CopyBtn';
import { MAX_PLAYERS } from '../constants';

export const WaitingRoom = ({ 
    roomCode, 
    players, 
    roomData, 
    isHost, 
    handleMapUpload, 
    startGame, 
    leaveRoom, 
    resetApp 
}) => {
    return (
        <div className="h-screen flex flex-col items-center justify-center bg-gray-900 text-white relative">
            <div className="absolute top-4 left-4 bg-gray-800 px-4 py-2 rounded-lg flex items-center gap-3 border border-gray-700 shadow-lg">
                <span className="text-gray-400 text-sm">ODA:</span>
                <span className="text-yellow-500 font-bold text-xl tracking-widest">{roomCode}</span>
                <CopyBtn code={roomCode} />
            </div>
            <button 
                onClick={resetApp} 
                className="absolute top-4 left-48 text-xs text-gray-600 hover:text-red-400 flex items-center gap-1 z-50"
            >
                <Icon p={Icons.Trash} s={12}/> Sıfırla
            </button>
            <button 
                onClick={leaveRoom} 
                className="absolute top-4 right-4 text-red-500 hover:text-red-400"
            >
                <Icon p={Icons.LogOut} />
            </button>
            <h2 className="text-3xl font-bold mb-8">
                Oyuncular Bekleniyor... ({players.length}/{MAX_PLAYERS})
            </h2>
            <div className="flex flex-wrap justify-center gap-4 mb-8">
                {players.map(p => (
                    <div key={p.id} className="bg-gray-800 p-6 rounded-xl border-b-4 flex flex-col items-center min-w-[120px]" style={{borderColor: p.color}}>
                        <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center mb-2 text-xl font-bold" style={{color: p.color}}>
                            {p.name[0]}
                        </div>
                        <span className="font-bold">{p.name}</span>
                        {p.id === roomData.hostId && <span className="text-xs text-yellow-500 mt-1">👑 KURUCU</span>}
                    </div>
                ))}
                {[...Array(MAX_PLAYERS - players.length)].map((_,i) => (
                    <div key={i} className="bg-gray-800/50 p-6 rounded-xl border border-dashed border-gray-600 flex flex-col items-center justify-center min-w-[120px] text-gray-500">
                        <span className="text-sm">Boş</span>
                    </div>
                ))}
            </div>
            {isHost ? (
                <div className="flex flex-col items-center gap-4">
                    {!roomData.mapSvg && (
                        <label className="cursor-pointer bg-gray-700 hover:bg-gray-600 px-6 py-3 rounded-lg border border-gray-500 transition">
                            <span className="flex items-center gap-2">
                                <Icon p={Icons.Map}/> Harita Dosyası Yükle (.svg)
                            </span>
                            <input type="file" accept=".svg" onChange={handleMapUpload} className="hidden"/>
                        </label>
                    )}
                    <button 
                        onClick={startGame} 
                        disabled={!roomData.mapSvg} 
                        className={`px-8 py-4 rounded-lg font-bold text-lg shadow-lg transition ${roomData.mapSvg ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
                    >
                        {roomData.mapSvg ? "OYUNU BAŞLAT" : "Önce Harita Yükle"}
                    </button>
                </div>
            ) : (
                <div className="text-gray-400 animate-pulse font-bold">
                    Kurucunun oyunu başlatması bekleniyor...
                </div>
            )}
        </div>
    );
};
