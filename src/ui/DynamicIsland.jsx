import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, ChevronLeft, ChevronRight, X, Trash2, RotateCw, 
  Sparkles, Settings, GripHorizontal, Move 
} from 'lucide-react';
import { isAppNativelyInstalled, launchAppDirectly } from '../utils/nativeLauncher';

export default function DynamicIsland({ 
  apps, activeAppId, setActiveAppId, onRemoveApp,
  onOpenServicesModal, onOpenSettingsModal, onCheckUpdates, onReloadActive,
  hideLabels = false
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [appToDelete, setAppToDelete] = useState(null);
  const [position, setPosition] = useState(null); // { x, y } or null for default top-center
  const [isDragging, setIsDragging] = useState(false);

  const islandRef = useRef(null);
  const dragInfoRef = useRef({
    isDown: false,
    hasMoved: false,
    startX: 0,
    startY: 0,
    elemStartX: 0,
    elemStartY: 0
  });

  const activeApp = apps.find(a => a.id === activeAppId) || apps[0];
  const activeIndex = apps.findIndex(a => a.id === activeAppId);

  // Load saved position from localStorage
  useEffect(() => {
    try {
      const savedPos = localStorage.getItem('rambox_dynamic_island_pos');
      if (savedPos) {
        const parsed = JSON.parse(savedPos);
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          // Clamp to current screen bounds
          const clampedX = Math.max(8, Math.min(window.innerWidth - 220, parsed.x));
          const clampedY = Math.max(8, Math.min(window.innerHeight - 60, parsed.y));
          setPosition({ x: clampedX, y: clampedY });
        }
      }
    } catch (e) {
      console.warn('Could not read saved position', e);
    }
  }, []);

  const handleNextApp = (e) => {
    e.stopPropagation();
    const nextIdx = (activeIndex + 1) % apps.length;
    const targetApp = apps[nextIdx];
    setActiveAppId(targetApp.id);
    launchAppDirectly(targetApp);
  };

  const handlePrevApp = (e) => {
    e.stopPropagation();
    const prevIdx = (activeIndex - 1 + apps.length) % apps.length;
    const targetApp = apps[prevIdx];
    setActiveAppId(targetApp.id);
    launchAppDirectly(targetApp);
  };

  const resetPosition = (e) => {
    if (e) e.stopPropagation();
    setPosition(null);
    localStorage.removeItem('rambox_dynamic_island_pos');
  };

  // Drag handlers using Pointer Events (seamless on both touch and mouse)
  const onPointerDown = (e) => {
    // Only drag from primary button / single touch, ignore clicks on buttons or delete dialog
    if (e.target.closest('button') || e.target.closest('input') || appToDelete) return;

    const el = islandRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    dragInfoRef.current = {
      isDown: true,
      hasMoved: false,
      startX: e.clientX,
      startY: e.clientY,
      elemStartX: rect.left,
      elemStartY: rect.top
    };

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
  };

  const onPointerMove = (e) => {
    if (!dragInfoRef.current.isDown) return;

    const dx = e.clientX - dragInfoRef.current.startX;
    const dy = e.clientY - dragInfoRef.current.startY;

    if (!dragInfoRef.current.hasMoved && Math.hypot(dx, dy) > 6) {
      dragInfoRef.current.hasMoved = true;
      setIsDragging(true);
    }

    if (dragInfoRef.current.hasMoved) {
      const el = islandRef.current;
      const elWidth = el ? el.offsetWidth : 240;
      const elHeight = el ? el.offsetHeight : 48;

      const maxX = Math.max(10, window.innerWidth - elWidth - 10);
      const maxY = Math.max(10, window.innerHeight - elHeight - 10);

      const newX = Math.max(10, Math.min(maxX, dragInfoRef.current.elemStartX + dx));
      const newY = Math.max(10, Math.min(maxY, dragInfoRef.current.elemStartY + dy));

      setPosition({ x: newX, y: newY });
    }
  };

  const onPointerUp = (e) => {
    if (!dragInfoRef.current.isDown) return;

    const hadMoved = dragInfoRef.current.hasMoved;
    dragInfoRef.current.isDown = false;
    setIsDragging(false);

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}

    if (hadMoved && position) {
      localStorage.setItem('rambox_dynamic_island_pos', JSON.stringify(position));
    } else {
      // It was a tap/click, toggle island expansion!
      setIsExpanded(prev => !prev);
    }
  };

  // Calculate container style
  const floatingStyle = position ? {
    position: 'fixed',
    left: `${position.x}px`,
    top: `${position.y}px`,
    transform: 'none',
    zIndex: 1000,
    touchAction: 'none'
  } : {
    position: 'fixed',
    top: '12px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 1000,
    touchAction: 'none'
  };

  return (
    <>
      {/* Draggable Dynamic Island Capsule */}
      <div 
        ref={islandRef}
        style={floatingStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={`select-none cursor-grab active:cursor-grabbing transition-[shadow,border-color] duration-200 ${
          isDragging ? 'opacity-90 scale-[1.02] shadow-[0_20px_50px_rgba(0,0,0,0.85)]' : ''
        }`}
      >
        <div
          className={`bg-[#181828]/95 backdrop-blur-2xl border border-white/20 text-white transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] shadow-[0_12px_40px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden ${
            isExpanded 
              ? 'w-[90vw] max-w-sm rounded-3xl p-4' 
              : 'h-11 px-3 rounded-full flex-row items-center justify-between'
          }`}
        >
          {!isExpanded ? (
            /* COLLAPSED STATE */
            <div className="w-full flex items-center justify-between space-x-2">
              {/* Drag Handle Indicator */}
              <div 
                className="text-white/30 hover:text-white/60 p-0.5 shrink-0 flex items-center" 
                title="Tahan & geser untuk memindahkan posisi"
              >
                <GripHorizontal size={14} />
              </div>

              {/* Prev Button */}
              <button 
                onClick={handlePrevApp} 
                className="p-1 rounded-full text-white/80 hover:text-white hover:bg-white/10 active:scale-90 transition-all shrink-0"
                title="Layanan Sebelumnya"
              >
                <ChevronLeft size={16} />
              </button>

              {/* Active Service Badge & Name */}
              <div 
                onClick={(e) => {
                  e.stopPropagation();
                  if (isAppNativelyInstalled(activeApp)) {
                    launchAppDirectly(activeApp);
                  } else {
                    setIsExpanded(true);
                  }
                }}
                className="flex items-center space-x-2 min-w-0 flex-1 justify-center px-1 cursor-pointer active:scale-95 transition-transform"
                title={isAppNativelyInstalled(activeApp) ? `Buka aplikasi ${activeApp?.name}` : activeApp?.name}
              >
                <div 
                  className="w-6 h-6 rounded-lg flex items-center justify-center p-0.5 shrink-0 shadow-sm"
                  style={{ backgroundColor: activeApp?.color ? `${activeApp.color}25` : 'rgba(255,255,255,0.15)' }}
                >
                  <img 
                    src={activeApp?.iconPath} 
                    alt={activeApp?.name} 
                    className="w-4 h-4 object-contain"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                </div>

                {!hideLabels && (
                  <span className="text-xs font-bold text-white tracking-wide truncate max-w-[120px]">
                    {activeApp?.name}
                  </span>
                )}

                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400/50 shrink-0" />
              </div>

              {/* Next Button */}
              <button 
                onClick={handleNextApp} 
                className="p-1 rounded-full text-white/80 hover:text-white hover:bg-white/10 active:scale-90 transition-all shrink-0"
                title="Layanan Berikutnya"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          ) : (
            /* EXPANDED CONTROL CENTER */
            <div className="w-full flex flex-col space-y-3.5">
              {/* Header */}
              <div className="flex items-center justify-between pb-2 border-b border-white/15">
                <div className="flex items-center space-x-2">
                  <div className="text-white/40 p-0.5" title="Bisa digeser ke mana saja">
                    <Move size={14} />
                  </div>
                  <span className="text-xs font-extrabold text-white tracking-wider uppercase">
                    Rambox Workspace
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-bold border border-indigo-500/30">
                    {apps.length} Layanan
                  </span>
                </div>

                <div className="flex items-center space-x-1">
                  {/* Reset Position (if dragged) */}
                  {position && (
                    <button
                      onClick={resetPosition}
                      className="px-2 py-1 rounded-lg text-[10px] text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                      title="Kembalikan posisi ke atas tengah"
                    >
                      Reset Posisi
                    </button>
                  )}

                  {/* Settings Button in Header */}
                  {onOpenSettingsModal && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenSettingsModal();
                        setIsExpanded(false);
                      }}
                      className="p-1.5 rounded-full text-indigo-300 hover:text-white hover:bg-white/10 transition-colors"
                      title="Pengaturan"
                    >
                      <Settings size={16} />
                    </button>
                  )}

                  {/* Close Button */}
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsExpanded(false);
                    }} 
                    className="p-1.5 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Installed Apps Grid */}
              <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto no-scrollbar py-1">
                {apps.map((app) => {
                  const isActive = app.id === activeAppId;
                  return (
                    <div
                      key={app.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveAppId(app.id);
                        setIsExpanded(false);
                        launchAppDirectly(app);
                      }}
                      className={`flex items-center justify-between p-2.5 rounded-2xl border transition-all cursor-pointer ${
                        isActive 
                          ? 'bg-indigo-600/30 border-indigo-400/60 shadow-lg' 
                          : 'bg-white/10 border-white/10 hover:bg-white/15'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                        <div 
                          className="w-7 h-7 rounded-xl flex items-center justify-center p-1 shrink-0"
                          style={{ backgroundColor: app.color ? `${app.color}35` : 'rgba(255,255,255,0.2)' }}
                        >
                          <img 
                            src={app.iconPath} 
                            alt="" 
                            className="w-4 h-4 object-contain"
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                        </div>
                        <span className="text-xs font-bold text-white truncate">
                          {app.name}
                        </span>
                      </div>

                      {apps.length > 1 && onRemoveApp && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setAppToDelete(app);
                          }}
                          className="p-1.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/20 transition-colors shrink-0 ml-1"
                          title={`Hapus ${app.name}`}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-2 pt-2 border-t border-white/15">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenServicesModal();
                    setIsExpanded(false);
                  }}
                  className="flex-1 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center space-x-1.5 shadow-md shadow-indigo-600/30 active:scale-95 transition-transform"
                >
                  <Plus size={14} />
                  <span>Tambah Layanan</span>
                </button>

                {onOpenSettingsModal && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenSettingsModal();
                      setIsExpanded(false);
                    }}
                    className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
                    title="Pengaturan Lengkap"
                  >
                    <Settings size={15} />
                  </button>
                )}

                {onReloadActive && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onReloadActive();
                      setIsExpanded(false);
                    }}
                    className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
                    title="Muat Ulang Halaman"
                  >
                    <RotateCw size={15} />
                  </button>
                )}

                {onCheckUpdates && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCheckUpdates();
                      setIsExpanded(false);
                    }}
                    className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
                    title="Periksa Pembaruan"
                  >
                    <Sparkles size={15} />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {appToDelete && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-xs bg-[#1a1a2e] border border-white/20 rounded-3xl p-5 shadow-2xl text-white text-center flex flex-col items-center">
            <div className="w-12 h-12 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-400 flex items-center justify-center mb-3">
              <Trash2 size={24} />
            </div>
            <h4 className="font-bold text-base mb-1">Hapus Layanan?</h4>
            <p className="text-xs text-white/70 mb-5">
              Apakah Anda yakin ingin menghapus <strong className="text-white">{appToDelete.name}</strong> dari daftar?
            </p>
            <div className="flex space-x-2 w-full">
              <button
                onClick={() => setAppToDelete(null)}
                className="flex-1 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition-colors"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  onRemoveApp(appToDelete.id);
                  setAppToDelete(null);
                }}
                className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-bold text-white transition-colors shadow-lg shadow-red-600/30"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
