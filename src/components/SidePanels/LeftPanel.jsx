import { Icon, Icons } from '../Icons';
import { ACTIVE_TIMEOUT } from '../../constants';

export const LeftPanel = ({
    roomData,
    currentPlayerId,
    now,
    msg,
    setMsg,
    sendMessage,
    chatEndRef
}) => {
    return (
        <div className="w-full md:w-64 h-1/4 md:h-full bg-gray-800 border-b md:border-b-0 md:border-r border-gray-700 flex flex-col z-20 shadow-xl shrink-0">
            <div className="p-2 md:p-4 border-b border-gray-700 bg-gray-900 overflow-y-auto max-h-[50%] md:max-h-none">
                <div className="mb-2 flex justify-between items-center">
                    <h3 className="text-xs text-gray-400 font-bold uppercase tracking-widest">Sıralama</h3>
                </div>
                <div className="space-y-1 md:space-y-2">
                    {roomData.turnOrder.map((uid) => {
                        const p = roomData.players[uid];
                        if (!p) return null;
                        const isActive = uid === currentPlayerId;
                        const isOffline = (now - (p.lastActive || 0)) > ACTIVE_TIMEOUT;
                        return (
                            <div key={uid} className={`p-2 md:p-3 rounded-lg flex items-center gap-3 border transition-all ${isActive ? 'bg-gray-700 border-yellow-500 scale-105 shadow-lg' : 'bg-gray-800 border-transparent opacity-70'} ${isOffline ? 'opacity-50 grayscale' : ''}`}>
                                <div className="w-2 h-full rounded-full self-stretch" style={{backgroundColor: p.color}}></div>
                                <div className="flex-1">
                                    <div className="font-bold text-sm flex justify-between items-center">
                                        <span>{p.name}</span>
                                        {isActive && !isOffline && <span className="text-yellow-500 animate-pulse text-xs">SIRA</span>}
                                        {isOffline && <span className="text-red-400 text-[10px] flex items-center gap-1"><Icon p={Icons.WifiOff} s={10}/></span>}
                                    </div>
                                    <div className="text-xs text-gray-400">{p.money.toLocaleString()} $</div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
            
            <div className="flex-1 overflow-hidden flex flex-col">
                <div className="flex-1 overflow-y-auto p-2 md:p-4 space-y-2 custom-scrollbar">
                    {roomData.chat?.map((m, i) => (
                        <div key={i} className="text-sm">
                            <span style={{color: m.c}} className="font-bold text-xs block">{m.s}</span>
                            <span className="text-gray-300 bg-gray-700/50 px-2 py-1 rounded inline-block max-w-full break-words">{m.t}</span>
                        </div>
                    ))}
                    <div ref={chatEndRef} />
                </div>
                <form onSubmit={sendMessage} className="p-2 bg-gray-800 border-t border-gray-700 flex gap-2">
                    <input 
                        className="flex-1 bg-gray-900 rounded px-2 py-1 text-sm text-white border border-gray-700 outline-none focus:border-gray-500" 
                        placeholder="Mesaj..." 
                        value={msg} 
                        onChange={e => setMsg(e.target.value)}
                    />
                    <button className="text-blue-400 hover:text-blue-300">
                        <Icon p={Icons.Send} s={16}/>
                    </button>
                </form>
            </div>
        </div>
    );
};
