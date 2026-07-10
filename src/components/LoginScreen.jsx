import { useState } from 'react';
import { Icon, Icons } from './Icons';

export const LoginScreen = ({ 
    nickname, 
    setNickname, 
    createRoom, 
    joinRoom, 
    loading, 
    error, 
    resetApp 
}) => {
    const [code, setCode] = useState('');

    return (
        <div className="min-h-screen flex flex-col items-center justify-center aop-desk p-4 relative overflow-hidden">
            <button 
                onClick={resetApp} 
                className="absolute top-4 left-4 text-xs text-[var(--aop-muted)] hover:text-[var(--aop-gold)] flex items-center gap-1 z-50 aop-button-secondary px-3 py-2"
            >
                <Icon p={Icons.Trash} s={12}/> Sıfırla
            </button>
            <div className="z-10 w-full max-w-lg aop-panel p-6 md:p-8">
                <div className="text-center mb-8">
                    <div className="aop-label mb-2">Harita Masası</div>
                    <h1 className="text-5xl md:text-6xl aop-title">
                    Age of Paper
                    </h1>
                    <p className="mt-3 text-sm text-[var(--aop-muted)]">
                        Komutan adını yaz, yeni harita masası kur veya oda koduyla katıl.
                    </p>
                </div>
                {error && (
                    <div className="bg-[var(--aop-danger)]/30 text-[var(--aop-paper-light)] p-3 rounded mb-4 text-sm border border-[var(--aop-danger)]">
                        {error}
                    </div>
                )}
                <div className="space-y-4">
                    <label className="block">
                        <span className="aop-label block mb-2">Komutan Adı</span>
                    <input 
                        value={nickname} 
                        onChange={e => setNickname(e.target.value)} 
                            className="aop-input" 
                            placeholder="Örn. Demir Paşa"
                    />
                    </label>
                    <button 
                        onClick={createRoom} 
                        disabled={loading} 
                        className="w-full aop-button py-4 text-xl"
                    >
                        {loading ? "Masa hazırlanıyor..." : "Yeni Harita Masası Kur"}
                    </button>
                    <div className="flex items-center gap-3">
                        <div className="flex-grow border-t aop-divider"></div>
                        <span className="aop-label">veya</span>
                        <div className="flex-grow border-t aop-divider"></div>
                    </div>
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                        <input 
                            className="aop-input text-center uppercase" 
                            placeholder="KOD" 
                            maxLength={4}
                            value={code}
                            onChange={event => setCode(event.target.value.toUpperCase())}
                        />
                        <button 
                            onClick={() => joinRoom(code)}
                            disabled={loading} 
                            className="aop-button-secondary font-bold px-6 rounded"
                        >
                            KATIL
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
