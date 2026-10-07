import React, { useState, useEffect } from 'react';
import { 
  Settings, X, ShieldAlert, Trash2, CheckCircle2, Loader2, 
  VolumeX, Volume2, Globe, Monitor, Moon, Sun, Smartphone, 
  ShieldCheck, RefreshCw, Sparkles, ExternalLink, Sliders, LogIn, Zap
} from 'lucide-react';
import { CURRENT_APP_VERSION } from './AutoUpdaterModal';

export const DEFAULT_PREFERENCES = {
  language: 'id',
  autoStart: true,
  startMinimized: false,
  defaultView: 'home', // 'home' | 'last-active'
  hideLabels: false,
  theme: 'dark', // 'dark' | 'amoled'
  keepScreenOn: false,
  muteAll: false,
  adguardDns: 'standard', // 'standard' | 'family' | 'unfiltered' | 'off'
};

export default function SettingsModal({ 
  isOpen, 
  onClose, 
  preferences, 
  onSavePreferences,
  onResetIslandPosition,
  onCheckUpdates
}) {
  const [localPrefs, setLocalPrefs] = useState({ ...DEFAULT_PREFERENCES, ...(preferences || {}) });
  const [activeTab, setActiveTab] = useState('general'); // 'general' | 'appearance' | 'privacy' | 'data' | 'about'
  const [isClearing, setIsClearing] = useState(false);
  const [clearSuccess, setClearSuccess] = useState(false);
  const [isBatteryIgnored, setIsBatteryIgnored] = useState(false);

  useEffect(() => {
    if (isOpen && window.RamboxNative && window.RamboxNative.isBatteryOptimizationIgnored) {
      try {
        setIsBatteryIgnored(window.RamboxNative.isBatteryOptimizationIgnored());
      } catch (e) {}
    }
  }, [isOpen, activeTab]);

  const handleRequestBatteryOptimization = () => {
    if (window.RamboxNative && window.RamboxNative.requestIgnoreBatteryOptimization) {
      window.RamboxNative.requestIgnoreBatteryOptimization();
      setTimeout(() => {
        if (window.RamboxNative?.isBatteryOptimizationIgnored) {
          setIsBatteryIgnored(window.RamboxNative.isBatteryOptimizationIgnored());
        }
      }, 1500);
    }
  };

  useEffect(() => {
    if (isOpen && preferences) {
      setLocalPrefs({ ...DEFAULT_PREFERENCES, ...preferences });
    }
  }, [isOpen, preferences]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSavePreferences(localPrefs);
    onClose();
  };

  const handleClearCache = async () => {
    setIsClearing(true);
    setClearSuccess(false);

    try {
      // 1. Trigger Native Android WebView cache & cookie clear if available
      if (window.RamboxUpdater && window.RamboxUpdater.clearAppData) {
        window.RamboxUpdater.clearAppData();
      }

      // 2. Clear browser cache storage & session storage
      if (window.caches) {
        const cacheKeys = await window.caches.keys();
        await Promise.all(cacheKeys.map(k => window.caches.delete(k)));
      }
      sessionStorage.clear();

      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (e) {
      console.warn('Error clearing app data', e);
    } finally {
      setIsClearing(false);
      setClearSuccess(true);
      setTimeout(() => setClearSuccess(false), 3000);
    }
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg bg-[#161624] border border-white/15 rounded-3xl shadow-2xl text-white flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Settings size={20} />
            </div>
            <div>
              <h3 className="font-extrabold text-base leading-tight">Pengaturan Rambox</h3>
              <p className="text-[11px] text-white/50">Sesuaikan preferensi dan privasi aplikasi</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center px-4 pt-2 border-b border-white/10 space-x-1 shrink-0 overflow-x-auto no-scrollbar">
          {[
            { id: 'general', label: 'Umum' },
            { id: 'appearance', label: 'Tampilan' },
            { id: 'privacy', label: 'Privasi & DNS' },
            { id: 'data', label: 'Penyimpanan' },
            { id: 'about', label: 'Tentang' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 text-xs font-bold whitespace-nowrap rounded-t-xl transition-all border-b-2 ${
                activeTab === tab.id 
                  ? 'border-indigo-500 text-indigo-400 bg-white/5' 
                  : 'border-transparent text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Modal Body / Tab Contents */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          
          {/* TAB 1: GENERAL */}
          {activeTab === 'general' && (
            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider mb-2 block">
                  Bahasa (Language)
                </label>
                <div className="flex items-center space-x-2">
                  <select 
                    value={localPrefs.language}
                    onChange={(e) => setLocalPrefs({ ...localPrefs, language: e.target.value })}
                    className="flex-1 bg-[#1e1e30] border border-white/15 rounded-xl px-3 py-2.5 text-white outline-none focus:border-indigo-500 font-medium"
                  >
                    <option value="id">Bahasa Indonesia</option>
                    <option value="en">English (US)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider mb-2 block">
                  Tampilan Awal Saat Dibuka
                </label>
                <select 
                  value={localPrefs.defaultView}
                  onChange={(e) => setLocalPrefs({ ...localPrefs, defaultView: e.target.value })}
                  className="w-full bg-[#1e1e30] border border-white/15 rounded-xl px-3 py-2.5 text-white outline-none focus:border-indigo-500 font-medium"
                >
                  <option value="home">Halaman Utama (Beranda)</option>
                  <option value="last-active">Layanan Terakhir yang Aktif</option>
                </select>
              </div>

              <div className="space-y-2 pt-2">
                <label className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors cursor-pointer">
                  <div>
                    <div className="font-bold text-white text-xs">Mulai Otomatis Saat HP Menyala</div>
                    <div className="text-[10px] text-white/50">Jalankan Rambox saat sistem Android selesai booting</div>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={localPrefs.autoStart}
                    onChange={(e) => setLocalPrefs({ ...localPrefs, autoStart: e.target.checked })}
                    className="w-4 h-4 accent-indigo-600 rounded"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors cursor-pointer">
                  <div>
                    <div className="font-bold text-white text-xs">Mulai di Latar Belakang (Minimized)</div>
                    <div className="text-[10px] text-white/50">Buka aplikasi secara senyap di background</div>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={localPrefs.startMinimized}
                    onChange={(e) => setLocalPrefs({ ...localPrefs, startMinimized: e.target.checked })}
                    className="w-4 h-4 accent-indigo-600 rounded"
                  />
                </label>

                {/* BATTERY BACKGROUND OPTIMIZATION CARD */}
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-7 h-7 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400">
                        <Zap size={15} />
                      </div>
                      <div>
                        <div className="font-bold text-white text-xs">Latar Belakang Tanpa Batas</div>
                        <div className="text-[10px] text-white/50">
                          {isBatteryIgnored ? '✓ Penghemat baterai dinonaktifkan (Aktif)' : 'Bebaskan dari pembatasan baterai'}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handleRequestBatteryOptimization}
                      className={`px-3 py-1.5 rounded-xl font-bold text-[11px] shadow-md transition-all active:scale-95 ${
                        isBatteryIgnored
                          ? 'bg-emerald-600/30 text-emerald-400 border border-emerald-500/40'
                          : 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/20'
                      }`}
                    >
                      {isBatteryIgnored ? 'Sudah Bebas' : 'Bebaskan'}
                    </button>
                  </div>
                  <p className="text-[10px] text-white/60 leading-tight">
                    Penting: Izinkan Rambox berjalan tanpa pembatasan baterai agar pesan & floating island tetap aktif saat aplikasi diminimize, ditutup, atau HP direstart.
                  </p>
                </div>

                {/* GOOGLE ACCOUNT AUTHENTICATION */}
                <div className="p-3.5 rounded-2xl bg-indigo-600/10 border border-indigo-500/25 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-7 h-7 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                        <LogIn size={15} />
                      </div>
                      <div>
                        <div className="font-bold text-white text-xs">Akun Google Resmi</div>
                        <div className="text-[10px] text-white/50">Masuk untuk Gmail, Drive & OAuth</div>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (window.RamboxUpdater && window.RamboxUpdater.openGoogleLogin) {
                          window.RamboxUpdater.openGoogleLogin("https://accounts.google.com/ServiceLogin");
                        } else {
                          window.open("https://accounts.google.com/ServiceLogin", "_blank");
                        }
                      }}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] shadow-md shadow-indigo-600/20 active:scale-95 transition-all"
                    >
                      Login Google
                    </button>
                  </div>
                  <p className="text-[10px] text-white/60 leading-tight">
                    Sesi autentikasi Google tersimpan aman di Android CookieManager untuk seluruh tab & layanan.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: APPEARANCE */}
          {activeTab === 'appearance' && (
            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider mb-2 block">
                  Tema Visual
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setLocalPrefs({ ...localPrefs, theme: 'dark' })}
                    className={`p-3 rounded-2xl border text-left flex flex-col space-y-1 transition-all ${
                      localPrefs.theme === 'dark' 
                        ? 'bg-indigo-600/25 border-indigo-400 shadow-md' 
                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center space-x-2 font-bold text-white">
                      <Moon size={15} className="text-indigo-400" />
                      <span>Dark Indigo</span>
                    </div>
                    <span className="text-[10px] text-white/50">Desain modern bergradasi elegan</span>
                  </button>

                  <button
                    onClick={() => setLocalPrefs({ ...localPrefs, theme: 'amoled' })}
                    className={`p-3 rounded-2xl border text-left flex flex-col space-y-1 transition-all ${
                      localPrefs.theme === 'amoled' 
                        ? 'bg-indigo-600/25 border-indigo-400 shadow-md' 
                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center space-x-2 font-bold text-white">
                      <Monitor size={15} className="text-emerald-400" />
                      <span>AMOLED Pure Black</span>
                    </div>
                    <span className="text-[10px] text-white/50">Hemat daya baterai layar OLED</span>
                  </button>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <label className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors cursor-pointer">
                  <div>
                    <div className="font-bold text-white text-xs">Sembunyikan Label Nama Layanan</div>
                    <div className="text-[10px] text-white/50">Tampilkan hanya ikon agar pill lebih ramping di layar</div>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={localPrefs.hideLabels}
                    onChange={(e) => setLocalPrefs({ ...localPrefs, hideLabels: e.target.checked })}
                    className="w-4 h-4 accent-indigo-600 rounded"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors cursor-pointer">
                  <div>
                    <div className="font-bold text-white text-xs flex items-center space-x-1.5">
                      <Smartphone size={14} className="text-amber-400" />
                      <span>Layar Tetap Menyala (Keep Screen On)</span>
                    </div>
                    <div className="text-[10px] text-white/50">Mencegah layar HP mati saat memantau obrolan</div>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={localPrefs.keepScreenOn}
                    onChange={(e) => setLocalPrefs({ ...localPrefs, keepScreenOn: e.target.checked })}
                    className="w-4 h-4 accent-indigo-600 rounded"
                  />
                </label>

                {onResetIslandPosition && (
                  <div className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/10">
                    <div>
                      <div className="font-bold text-white text-xs">Posisi Dynamic Island</div>
                      <div className="text-[10px] text-white/50">Kembalikan pill Dynamic Island ke tengah atas layar</div>
                    </div>
                    <button
                      onClick={onResetIslandPosition}
                      className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition-colors"
                    >
                      Reset Posisi
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: PRIVACY & SOUNDS */}
          {activeTab === 'privacy' && (
            <div className="space-y-4">
              <label className="flex items-center justify-between p-3 rounded-2xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/15 transition-colors cursor-pointer">
                <div>
                  <div className="font-bold text-red-400 text-xs flex items-center space-x-1.5">
                    <VolumeX size={15} />
                    <span>Bisukan Semua Suara (Global Mute)</span>
                  </div>
                  <div className="text-[10px] text-white/50">Senyapkan seluruh nada dering dan suara notifikasi layanan</div>
                </div>
                <input 
                  type="checkbox" 
                  checked={localPrefs.muteAll}
                  onChange={(e) => setLocalPrefs({ ...localPrefs, muteAll: e.target.checked })}
                  className="w-4 h-4 accent-red-500 rounded"
                />
              </label>

              <div>
                <label className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider mb-2 block">
                  Proteksi AdGuard DNS (Anti Iklan & Pelacak)
                </label>
                <div className="space-y-2">
                  {[
                    { id: 'standard', title: 'AdGuard Default (Standar)', desc: 'Memblokir iklan, tracking analitik, dan domain phishing.' },
                    { id: 'family', title: 'AdGuard Family Protection', desc: 'Blokir iklan + konten dewasa + paksa SafeSearch Google/Bing.' },
                    { id: 'unfiltered', title: 'AdGuard Unfiltered', desc: 'Resolusi DNS aman terenkripsi tanpa pemfilteran konten.' },
                    { id: 'off', title: 'Nonaktif (Default ISP)', desc: 'Gunakan DNS bawaan jaringan internet Anda.' }
                  ].map(dns => (
                    <label 
                      key={dns.id} 
                      className={`flex items-start justify-between p-3 rounded-2xl border cursor-pointer transition-colors ${
                        localPrefs.adguardDns === dns.id 
                          ? 'bg-indigo-600/20 border-indigo-400' 
                          : 'bg-white/5 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <div className="pr-2">
                        <div className="font-bold text-white text-xs">{dns.title}</div>
                        <div className="text-[10px] text-white/50 leading-tight mt-0.5">{dns.desc}</div>
                      </div>
                      <input 
                        type="radio" 
                        name="adguardDns"
                        checked={localPrefs.adguardDns === dns.id}
                        onChange={() => setLocalPrefs({ ...localPrefs, adguardDns: dns.id })}
                        className="w-4 h-4 accent-indigo-600 mt-1"
                      />
                    </label>
                  ))}
                </div>
              </div>

              {/* Sandbox isolation info badge */}
              <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-start space-x-2.5">
                <ShieldAlert size={16} className="text-indigo-400 shrink-0 mt-0.5" />
                <div className="text-[11px] text-white/70 leading-relaxed">
                  <strong className="text-indigo-300 block mb-0.5">Isolasi Sandbox Aktif</strong>
                  Setiap layanan web berjalan dalam sesi terisolasi sehingga riwayat obrolan dan login tetap aman per akun.
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: DATA & STORAGE */}
          {activeTab === 'data' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                <div>
                  <div className="font-bold text-white text-xs">Bersihkan Data & Cache Aplikasi</div>
                  <div className="text-[10px] text-white/50 mt-0.5">
                    Menghapus seluruh cache web, cookies sementara, dan berkas temporary untuk mengosongkan memori HP.
                  </div>
                </div>

                <button
                  onClick={handleClearCache}
                  disabled={isClearing || clearSuccess}
                  className={`w-full py-2.5 px-4 rounded-xl font-bold flex items-center justify-center space-x-2 transition-all ${
                    clearSuccess 
                      ? 'bg-emerald-600 text-white' 
                      : isClearing 
                        ? 'bg-white/10 text-white/50 cursor-not-allowed' 
                        : 'bg-red-600/20 border border-red-500/30 text-red-400 hover:bg-red-600 hover:text-white'
                  }`}
                >
                  {isClearing ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      <span>Sedang Membersihkan...</span>
                    </>
                  ) : clearSuccess ? (
                    <>
                      <CheckCircle2 size={15} />
                      <span>Cache & Data Berhasil Dibersihkan!</span>
                    </>
                  ) : (
                    <>
                      <Trash2 size={15} />
                      <span>Bersihkan Cache Sekarang</span>
                    </>
                  )}
                </button>
              </div>

              <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-[11px] text-white/60 space-y-1">
                <div className="font-bold text-white">Catatan:</div>
                <p>Membersihkan cache tidak akan menghapus daftar layanan kustom Anda, namun Anda mungkin perlu login ulang ke layanan pesan seperti WhatsApp.</p>
              </div>
            </div>
          )}

          {/* TAB 5: ABOUT */}
          {activeTab === 'about' && (
            <div className="space-y-4 text-center py-2">
              <div className="w-14 h-14 rounded-3xl bg-indigo-600/20 border border-indigo-500/30 mx-auto flex items-center justify-center text-indigo-400 shadow-xl">
                <Sparkles size={28} />
              </div>

              <div>
                <h4 className="font-extrabold text-base text-white">Rambox Mobile</h4>
                <p className="text-xs text-indigo-400 font-semibold mt-0.5">Versi v{CURRENT_APP_VERSION}</p>
                <p className="text-[11px] text-white/50 mt-1 max-w-xs mx-auto">
                  Aplikasi multi-workspace modern untuk pesan dan produktivitas terintegrasi di Android.
                </p>
              </div>

              <div className="flex flex-col space-y-2 pt-2 max-w-xs mx-auto">
                {onCheckUpdates && (
                  <button
                    onClick={() => {
                      onClose();
                      onCheckUpdates();
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center justify-center space-x-2 shadow-lg shadow-indigo-600/30 active:scale-95 transition-all"
                  >
                    <RefreshCw size={14} />
                    <span>Periksa Pembaruan OTA</span>
                  </button>
                )}

                <a
                  href="https://github.com/emailkudeweta/rambox-mobile"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-white/90 font-semibold flex items-center justify-center space-x-2 transition-colors"
                >
                  <ExternalLink size={14} />
                  <span>Kunjungi Repositori GitHub</span>
                </a>
              </div>
            </div>
          )}

        </div>

        {/* Footer Modal: Action Buttons */}
        <div className="flex items-center justify-end px-5 py-3.5 border-t border-white/10 bg-white/5 space-x-2 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/30 active:scale-95 transition-all"
          >
            Simpan Perubahan
          </button>
        </div>
      </div>
    </div>
  );
}
