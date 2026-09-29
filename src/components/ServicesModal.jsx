import React, { useState, useMemo } from 'react';
import { X, Search, Plus, Trash2, Layers, Check } from 'lucide-react';
import { AVAILABLE_SERVICES } from '../config/services';

const CATEGORIES = ['Semua', 'Messaging', 'Browser', 'Social', 'Media', 'Productivity', 'Development'];

export default function ServicesModal({ isOpen, onClose, apps, onAddApp, onRemoveApp }) {
  const [activeTab, setActiveTab] = useState('catalog'); // 'catalog' | 'installed'
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Semua');

  const filteredServices = useMemo(() => {
    return AVAILABLE_SERVICES.filter(srv => {
      const matchSearch = srv.name.toLowerCase().includes(search.toLowerCase()) || 
                          srv.category.toLowerCase().includes(search.toLowerCase());
      const matchCat = selectedCategory === 'Semua' || srv.category === selectedCategory;
      return matchSearch && matchCat;
    });
  }, [search, selectedCategory]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="w-full sm:max-w-lg bg-[#14141f] border-t sm:border border-white/10 rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl text-white max-h-[90vh] flex flex-col mb-safe"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 shrink-0">
          <div>
            <h3 className="font-bold text-lg">Kelola Layanan</h3>
            <p className="text-xs text-white/50">Tambah atau hapus layanan di aplikasi Anda</p>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Top Segmented Control (Katalog vs Terpasang) */}
        <div className="flex p-1 bg-white/5 rounded-xl border border-white/10 mb-3 shrink-0">
          <button
            onClick={() => setActiveTab('catalog')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all ${
              activeTab === 'catalog'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Plus size={14} />
            <span>Katalog (89+)</span>
          </button>
          <button
            onClick={() => setActiveTab('installed')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all ${
              activeTab === 'installed'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Layers size={14} />
            <span>Layanan Aktif ({apps.length})</span>
          </button>
        </div>

        {/* TAB 1: KATALOG TAMBAH LAYANAN */}
        {activeTab === 'catalog' && (
          <>
            {/* Search Input */}
            <div className="relative mb-3 shrink-0">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
              <input 
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari layanan (WhatsApp, Chrome, YouTube...)"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-white/40 outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            {/* Category Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-3 shrink-0">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                    selectedCategory === cat
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                      : 'bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Services Grid */}
            <div className="overflow-y-auto no-scrollbar grid grid-cols-2 gap-2.5 py-2 flex-1">
              {filteredServices.map(srv => {
                const existingApp = apps.find(a => a.id === srv.id || (a.name === srv.name && !srv.isBrowser));
                const isAdded = Boolean(existingApp);
                return (
                  <div 
                    key={srv.id}
                    className="p-3 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between hover:bg-white/10 transition-colors"
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <img 
                        src={srv.iconPath} 
                        alt={srv.name} 
                        className="w-7 h-7 object-contain rounded-lg shrink-0"
                        onError={(e) => { e.target.src = 'https://cdn-icons-png.flaticon.com/512/124/124034.png'; }}
                      />
                      <div className="min-w-0">
                        <p className="font-bold text-xs text-white truncate">{srv.name}</p>
                        <p className="text-[10px] text-white/40 truncate">{srv.category}</p>
                      </div>
                    </div>

                    {isAdded ? (
                      <button
                        onClick={() => {
                          if (onRemoveApp && existingApp && apps.length > 1) {
                            onRemoveApp(existingApp.id);
                          }
                        }}
                        className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 shadow-sm transition-transform active:scale-90 shrink-0 ml-2"
                        title="Hapus Layanan"
                      >
                        <Trash2 size={13} />
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          onAddApp({
                            id: `app-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                            name: srv.name,
                            url: srv.url,
                            iconPath: srv.iconPath,
                            category: srv.category,
                            isBrowser: Boolean(srv.isBrowser)
                          });
                          onClose();
                        }}
                        className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-transform active:scale-90 shrink-0 ml-2"
                        title="Tambahkan"
                      >
                        <Plus size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* TAB 2: DAFTAR LAYANAN AKTIF (BISA DIHAPUS DENGAN SEKALI KLIK) */}
        {activeTab === 'installed' && (
          <div className="overflow-y-auto no-scrollbar flex flex-col space-y-2 py-2 flex-1">
            {apps.length === 0 ? (
              <div className="text-center py-10 text-white/40 text-xs">
                Tidak ada layanan yang terpasang.
              </div>
            ) : (
              apps.map(app => (
                <div
                  key={app.id}
                  className="p-3 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between hover:bg-white/10 transition-colors"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <img 
                      src={app.iconPath} 
                      alt={app.name} 
                      className="w-8 h-8 object-contain rounded-xl shrink-0"
                      onError={(e) => { e.target.src = 'https://cdn-icons-png.flaticon.com/512/124/124034.png'; }}
                    />
                    <div className="min-w-0">
                      <p className="font-bold text-xs text-white truncate">{app.name}</p>
                      <p className="text-[10px] text-white/40 truncate">{app.url || 'Aplikasi'}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      if (onRemoveApp && apps.length > 1) {
                        onRemoveApp(app.id);
                      }
                    }}
                    disabled={apps.length <= 1}
                    className="px-3 py-1.5 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 text-xs font-semibold flex items-center space-x-1.5 active:scale-95 transition-transform disabled:opacity-30 disabled:cursor-not-allowed"
                    title={apps.length <= 1 ? "Minimal harus ada 1 layanan aktif" : "Hapus Layanan"}
                  >
                    <Trash2 size={13} />
                    <span>Hapus</span>
                  </button>
                </div>
              ))
            )}
          </div>
        )}

      </div>
    </div>
  );
}
