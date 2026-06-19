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
        <div className="w-full md:w-72 h-[30vh] md:h-full bg-[var(--aop-panel)] border-b-2 md:border-b-0 md:border-r-2 border-[var(--aop-bronze)] flex flex-col z-20 shrink-0">
            <div className="p-3 md:p-4 border-b border-[var(--aop-line)] bg-[var(--aop-panel-deep)] overflow-y-auto max-h-[52%] md:max-h-none">
                <div className="mb-3 flex justify-between items-end gap-3">
                    <div>
                        <div className="aop-label">Tur Defteri</div>
                        <h3 className="aop-title text-xl">Sıra</h3>
                    </div>
                </div>
                <div className="space-y-2">
                    {roomData.turnOrder.map((uid) => {
                        const p = roomData.players[uid];
                        if (!p) return null;
                        const isActive = uid === currentPlayerId;
                        const isOffline = (now - (p.lastActive || 0)) > ACTIVE_TIMEOUT;
                        return (
                            <div key={uid} className={`p-3 rounded flex items-center gap-3 border transition-all ${isActive ? 'aop-paper shadow-none' : 'bg-[var(--aop-panel)] border-[var(--aop-line)] opacity-80'} ${isOffline ? 'opacity-50 grayscale' : ''}`}>
                                <div className="w-9 h-9 rounded-full aop-seal shrink-0 flex items-center justify-center text-sm font-bold" style={{backgroundColor: p.color}}>
                                    {p.name[0]}
                                </div>
                                <div className="flex-1">
                                    <div className={`font-bold text-sm flex justify-between items-center ${isActive ? 'text-[var(--aop-ink)]' : 'text-[var(--aop-text)]'}`}>
                                        <span>{p.name}</span>
                                        {isActive && !isOffline && <span className="text-[var(--aop-gold-deep)] text-xs">SIRA</span>}
                                        {isOffline && <span className="text-[var(--aop-danger)] text-[10px] flex items-center gap-1"><Icon p={Icons.WifiOff} s={10}/></span>}
                                    </div>
                                    <div className={`text-xs ${isActive ? 'text-[var(--aop-ink-soft)]' : 'text-[var(--aop-muted)]'}`}>{p.money.toLocaleString()} altın</div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
            
            <div className="flex-1 overflow-hidden flex flex-col">
                <div className="px-3 pt-3 md:px-4">
                    <div className="aop-label">İstihbarat Hattı</div>
                </div>
                <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-2 custom-scrollbar">
                    {roomData.chat?.map((m, i) => (
                        <div key={i} className="text-sm">
                            <span style={{color: m.c}} className="font-bold text-xs block">{m.s}</span>
                            <span className="text-[var(--aop-text)] bg-[var(--aop-panel-deep)] border border-[var(--aop-line)] px-2 py-1 rounded inline-block max-w-full break-words">{m.t}</span>
                        </div>
                    ))}
                    <div ref={chatEndRef} />
                </div>
                <form onSubmit={sendMessage} className="p-2 bg-[var(--aop-panel-deep)] border-t border-[var(--aop-line)] flex gap-2">
                    <input 
                        className="flex-1 bg-[var(--aop-bg)] rounded px-2 py-2 text-sm text-[var(--aop-text)] border border-[var(--aop-line)] outline-none focus:border-[var(--aop-gold)]" 
                        placeholder="Mesaj..." 
                        value={msg} 
                        onChange={e => setMsg(e.target.value)}
                    />
                    <button className="aop-button-secondary px-3 flex items-center">
                        <Icon p={Icons.Send} s={16}/>
                    </button>
                </form>
            </div>
        </div>
    );
};
