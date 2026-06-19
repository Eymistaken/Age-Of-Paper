import { useState, useRef, useEffect } from 'react';
import { Icon, Icons } from './Icons';
import { CopyBtn } from './CopyBtn';

export const MapViewer = ({
    roomData,
    roomCode,
    selectedId,
    setSelectedId,
    leaveRoom,
    resetApp,
    hideHud = false,
    className = ""
}) => {
    // Zoom & Pan States
    const [scale, setScale] = useState(1);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const [dragging, setDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [lastTouchDist, setLastTouchDist] = useState(null);

    // Refs
    const svgRef = useRef(null);
    const dragStartPos = useRef({ x: 0, y: 0 });
    const isSignificantDrag = useRef(false);

    // Interaction Handlers (Mouse & Touch)
    const handlePointerDown = (clientX, clientY) => {
        setDragging(true);
        setDragStart({ x: clientX - pos.x, y: clientY - pos.y });
        dragStartPos.current = { x: clientX, y: clientY };
        isSignificantDrag.current = false;
    };

    const handlePointerMove = (clientX, clientY) => {
        if (!dragging) return;
        const dx = clientX - dragStartPos.current.x;
        const dy = clientY - dragStartPos.current.y;
        if (Math.hypot(dx, dy) > 10) {
            isSignificantDrag.current = true;
        }
        setPos({ x: clientX - dragStart.x, y: clientY - dragStart.y });
    };

    const handleWheel = (e) => {
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(0.5, Math.min(20, scale * factor));
        const rect = e.currentTarget.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldX = (mouseX - pos.x) / scale;
        const worldY = (mouseY - pos.y) / scale;
        const nx = mouseX - worldX * newScale;
        const ny = mouseY - worldY * newScale;
        setPos({ x: nx, y: ny });
        setScale(newScale);
    };

    const handleTouchStart = (e) => {
        if (e.touches.length === 1) {
            handlePointerDown(e.touches[0].clientX, e.touches[0].clientY);
        } else if (e.touches.length === 2) {
            setDragging(false);
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            setLastTouchDist(dist);
        }
    };

    const handleTouchMove = (e) => {
        if (e.touches.length === 1 && dragging) {
            handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
        } else if (e.touches.length === 2 && lastTouchDist !== null) {
            isSignificantDrag.current = true;
            const t1 = e.touches[0];
            const t2 = e.touches[1];
            const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

            const factor = dist / lastTouchDist;
            const newScale = Math.max(0.5, Math.min(20, scale * factor));

            const rect = e.currentTarget.getBoundingClientRect();
            const cx = (t1.clientX + t2.clientX) / 2 - rect.left;
            const cy = (t1.clientY + t2.clientY) / 2 - rect.top;

            const worldX = (cx - pos.x) / scale;
            const worldY = (cy - pos.y) / scale;
            const nx = cx - worldX * newScale;
            const ny = cy - worldY * newScale;

            setPos({ x: nx, y: ny });
            setScale(newScale);
            setLastTouchDist(dist);
        }
    };

    const handleTouchEnd = (e) => {
        if (e.touches.length < 2) {
            setLastTouchDist(null);
        }
        if (e.touches.length === 0) {
            setDragging(false);
        } else if (e.touches.length === 1) {
            handlePointerDown(e.touches[0].clientX, e.touches[0].clientY);
        }
    };

    // DOM Manipulation for SVG Map Elements
    useEffect(() => {
        if (svgRef.current && roomData.mapSvg) {
            const paths = svgRef.current.querySelectorAll('path, polygon, circle');
            const oldLabels = svgRef.current.querySelectorAll('.troop-label-group');
            oldLabels.forEach(l => l.remove());

            paths.forEach((p, idx) => {
                let id = p.getAttribute('id');
                if (!id) { id = `land_${idx}`; p.setAttribute('id', id); }
                
                let displayName = p.getAttribute('data-original-name');
                if (!displayName) {
                    const rawName = p.getAttribute('name') || p.getAttribute('class') || id;
                    displayName = rawName.replace(/default-land/g, '').replace(/_/g, ' ').trim() || "Bölge " + idx;
                    p.setAttribute('data-original-name', displayName);
                }
                p.setAttribute('data-name', displayName);

                const region = roomData.gameData[id];
                p.setAttribute('class', 'default-land');
                p.style.fill = region ? region.color : '#b7a370';
                p.style.stroke = '#282316';
                
                if (id === selectedId) { 
                    p.classList.add('selected-land'); 
                } else { 
                    p.classList.remove('selected-land'); 
                }
                
                // Tıklama Olayı
                p.onclick = (e) => { 
                    e.stopPropagation(); 
                    if (isSignificantDrag.current) return;
                    setSelectedId(id); 
                };

                // Asker ve Liman İkonları
                if (region && (region.soldiers > 0 || region.hasPort)) {
                    try {
                        const bbox = p.getBBox();
                        const cx = bbox.x + bbox.width / 2;
                        const cy = bbox.y + bbox.height / 2;
                        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
                        g.setAttribute("class", "troop-label-group");
                        g.setAttribute("style", "pointer-events: none;");

                        if (region.soldiers > 0) {
                            const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                            circle.setAttribute("cx", cx); circle.setAttribute("cy", cy); circle.setAttribute("r", "8");
                            circle.setAttribute("class", "troop-circle");
                            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                            text.setAttribute("x", cx); text.setAttribute("y", cy);
                            text.setAttribute("class", "troop-text");
                            text.textContent = region.soldiers >= 1000 ? (region.soldiers/1000) + 'k' : region.soldiers;
                            g.appendChild(circle); g.appendChild(text);
                        }
                        if (region.hasPort) {
                            const textP = document.createElementNS("http://www.w3.org/2000/svg", "text");
                            textP.setAttribute("x", cx + 10); textP.setAttribute("y", cy - 10);
                            textP.setAttribute("class", "port-icon"); textP.textContent = "⚓";
                            g.appendChild(textP);
                        }
                        p.parentNode.appendChild(g);
                    } catch {
                        console.warn("Bölge etiketi yerleştirilemedi:", id);
                    }
                }
            });
        }
    }, [roomData.mapSvg, roomData.gameData, selectedId, setSelectedId]);

    return (
        <div 
            className={`flex-1 relative aop-map-surface overflow-hidden cursor-grab active:cursor-grabbing touch-none ${className}`}
            onMouseDown={e => { if(e.button===0) handlePointerDown(e.clientX, e.clientY) }} 
            onMouseMove={e => handlePointerMove(e.clientX, e.clientY)} 
            onMouseUp={() => setDragging(false)} 
            onMouseLeave={() => setDragging(false)} 
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
        >
            <div 
                style={{ 
                    transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`, 
                    transformOrigin: '0 0', 
                    transition: dragging || lastTouchDist ? 'none' : 'transform 0.1s', 
                    willChange: 'transform' 
                }} 
                className="w-full h-full absolute top-0 left-0"
            >
                {roomData.mapSvg && (
                    <div ref={svgRef} dangerouslySetInnerHTML={{__html: roomData.mapSvg}} className="w-full h-full [&>svg]:w-full [&>svg]:h-full"/>
                )}
            </div>

            {!hideHud && (
                <>
                    <div className="absolute top-3 md:top-4 left-1/2 transform -translate-x-1/2 bg-[var(--aop-panel)] border-2 border-[var(--aop-bronze)] px-3 md:px-5 py-2 rounded flex items-center gap-3 md:gap-5 z-10 scale-90 md:scale-100">
                        <div className="flex items-center gap-2 font-bold text-lg md:text-xl">
                            <span className="aop-label hidden sm:inline">Oda</span>
                            <span className="aop-serif text-[var(--aop-paper-light)]">{roomCode}</span>
                            <CopyBtn code={roomCode} />
                        </div>
                        <div className="w-px h-6 bg-[var(--aop-line)]"></div>
                        <div className="text-xs md:text-sm text-[var(--aop-muted)]">
                            Tur: <span className="text-[var(--aop-paper-light)] font-bold">{roomData.turnIndex + 1}</span>
                        </div>
                        <button onClick={leaveRoom} className="text-[var(--aop-danger)] hover:text-[var(--aop-paper-light)]">
                            <Icon p={Icons.LogOut}/>
                        </button>
                    </div>
                    <button 
                        onClick={resetApp} 
                        className="absolute bottom-4 left-4 text-xs text-[var(--aop-muted)] hover:text-[var(--aop-gold)] flex items-center gap-1 z-50 bg-[var(--aop-panel)] border border-[var(--aop-line)] px-2 py-1 rounded"
                    >
                        <Icon p={Icons.Trash} s={12}/> Sıfırla
                    </button>
                </>
            )}
        </div>
    );
};
