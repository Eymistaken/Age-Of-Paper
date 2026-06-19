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
            className="text-[var(--aop-muted)] hover:text-[var(--aop-gold)] transition flex items-center gap-2 min-w-4" 
            title="Kodu Kopyala"
        >
            {copied ? (
                <span className="text-[var(--aop-success)] font-bold text-xs">Kopyalandı</span>
            ) : (
                <Icon p={Icons.Copy} s={16}/>
            )}
        </button>
    );
};
