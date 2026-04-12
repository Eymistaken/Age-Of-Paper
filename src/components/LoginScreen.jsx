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
    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 p-4 relative overflow-hidden">
            <button 
                onClick={resetApp} 
                className="absolute top-4 left-4 text-xs text-gray-600 hover:text-red-400 flex items-center gap-1 z-50"
            >
                <Icon p={Icons.Trash} s={12}/> Sıfırla
            </button>
            <div className="z-10 w-full max-w-md glass-panel p-8 rounded-2xl shadow-2xl border border-gray-700">
                <h1 className="text-5xl font-bold text-center mb-8 text-yellow-500" style={{fontFamily: 'Georgia'}}>
                    Age of Paper
                </h1>
                {error && (
                    <div className="bg-red-500/20 text-red-200 p-3 rounded mb-4 text-sm">
                        {error}
                    </div>
                )}
                <div className="space-y-4">
                    <input 
                        value={nickname} 
                        onChange={e => setNickname(e.target.value)} 
                        className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white outline-none" 
                        placeholder="Komutan Adı"
                    />
                    <button 
                        onClick={createRoom} 
                        disabled={loading} 
                        className="w-full bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-3 rounded-lg"
                    >
                        {loading ? "..." : "Yeni Oda Kur"}
                    </button>
                    <div className="flex gap-2">
                        <input 
                            id="codeIn" 
                            className="flex-1 bg-gray-800 border border-gray-600 rounded-lg p-3 text-center uppercase tracking-widest text-white outline-none" 
                            placeholder="KOD" 
                            maxLength={4}
                        />
                        <button 
                            onClick={() => joinRoom(document.getElementById('codeIn').value.toUpperCase())} 
                            disabled={loading} 
                            className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 rounded-lg"
                        >
                            KATIL
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
