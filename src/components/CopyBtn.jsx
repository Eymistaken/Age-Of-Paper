import { useState } from 'react';
import { Icon, Icons } from './Icons';

export const CopyBtn = ({ code }) => {
    const [copied, setCopied] = useState(false);
    
    const handleCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    
    return (
        <button 
            onClick={handleCopy} 
            className="text-gray-400 hover:text-white transition flex items-center gap-2" 
            title="Kodu Kopyala"
        >
            {copied ? (
                <span className="text-green-500 font-bold text-xs animate-pulse">KOPYALANDI!</span>
            ) : (
                <Icon p={Icons.Copy} s={16}/>
            )}
        </button>
    );
};
