import React, { useState } from 'react';
import { Plus, ChevronLeft, ChevronRight, X, Trash2, RotateCw, Sparkles, Globe } from 'lucide-react';

export default function DynamicIsland({ 
  apps, activeAppId, setActiveAppId, onRemoveApp,
  onOpenServicesModal, onCheckUpdates, onReloadActive
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [appToDelete, setAppToDelete] = useState(null);

  const activeApp = apps.find(a => a.id === activeAppId) || apps[0];
  const activeIndex = apps.findIndex(a => a.id === activeAppId);

  const handleNextApp = (e) => {
    e.stopPropagation();
    const nextIdx = (activeIndex + 1) % apps.length;
    setActiveAppId(apps[nextIdx].id);
  };

  const handlePrevApp = (e) => {
    e.stopPropagation();
    const prevIdx = (activeIndex - 1 + apps.length) % apps.length;
    setActiveAppId(apps[prevIdx].id);
  };

  return (
    <>
      {/* Dynamic Island Floating Header */}
      <div className="fixed top-2.5 left-1/2 -translate-x-1/2 z-50 pt-safe pointer-events-none w-full max-w-sm px-3 flex flex-col items-center">
        <div
          onClick={() => setIsExpanded(!isExpanded)}
          className={`bg-[#181828]/95 backdrop-blur-2xl border border-white/20 text-white pointer-events-auto transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] shadow-[0_12px_40px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden ${
            isExpanded 
              ? 'w-full rounded-3xl p-4' 
              : 'h-11 px-3 rounded-full flex-row items-center justify-between active:scale-95'
          }`}
        >
          {!isExpanded ? (
            /* COLLAPSED STATE */
            <div className="w-full flex items-center justify-between space-x-2">
              <button 
                onClick={handlePrevApp} 
                className="p-1 rounded-full text-white/80 hover:text-white hover:bg-white/10 active:scale-90 transition-all"
                title="Layanan Sebelumnya"
              >
                <ChevronLeft size={16} />
              </button>

              <div className="flex items-center space-x-2.5 min-w-0 flex-1 justify-center">
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
                <span className="text-xs font-bold text-white tracking-wide truncate max-w-[130px]">
                  {activeApp?.name}
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400/50 shrink-0" />
              </div>

              <button 
                onClick={handleNextApp} 
                className="p-1 rounded-full text-white/80 hover:text-white hover:bg-white/10 active:scale-90 transition-all"
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
                  <span className="text-xs font-extrabold text-white tracking-wider uppercase">
                    Rambox Workspace
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-bold border border-indigo-500/30">
                    {apps.length} Layanan
                  </span>
                </div>
                <button 
                  onClick={() => setIsExpanded(false)} 
                  className="p-1 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Installed Apps Grid */}
              <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto no-scrollbar py-1">
                {apps.map((app) => {
                  const isActive = app.id === activeAppId;
                  return (
                    <div
                      key={app.id}
                      onClick={() => {
                        setActiveAppId(app.id);
                        setIsExpanded(false);
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
                  onClick={() => {
                    onOpenServicesModal();
                    setIsExpanded(false);
                  }}
                  className="flex-1 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center space-x-1.5 shadow-md shadow-indigo-600/30 active:scale-95 transition-transform"
                >
                  <Plus size={14} />
                  <span>Tambah Layanan</span>
                </button>

                {onReloadActive && (
                  <button
                    onClick={() => {
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
                    onClick={() => {
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
            <div className="flex items-center space-x-2.5 w-full">
              <button
                onClick={() => setAppToDelete(null)}
                className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  if (onRemoveApp) {
                    onRemoveApp(appToDelete.id);
                  }
                  setAppToDelete(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-lg shadow-red-600/30 active:scale-95 transition-transform"
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
