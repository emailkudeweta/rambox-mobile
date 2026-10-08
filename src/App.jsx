import React, { useState, useEffect, useRef } from 'react';
import { App as CapApp } from '@capacitor/app';
import { DEFAULT_SERVICES } from './config/constants';
import { AVAILABLE_SERVICES } from './config/services';
import MobileWebview from './components/MobileWebview';
import ServicesModal from './components/ServicesModal';
import SettingsModal, { DEFAULT_PREFERENCES } from './components/SettingsModal';
import AutoUpdaterModal from './components/AutoUpdaterModal';
import { launchAppDirectly, getInstalledPackage } from './utils/nativeLauncher';
import { ShieldAlert, Plus, Settings } from 'lucide-react';

export default function App() {
  const [preferences, setPreferences] = useState(() => {
    try {
      const saved = localStorage.getItem('rambox_preferences');
      if (saved) return { ...DEFAULT_PREFERENCES, ...JSON.parse(saved) };
    } catch (e) {}
    return DEFAULT_PREFERENCES;
  });

  const [apps, setApps] = useState(() => {
    try {
      const saved = localStorage.getItem('rambox_mobile_apps');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.map(app => {
          const match = DEFAULT_SERVICES.find(d => d.id === app.id) || 
                        AVAILABLE_SERVICES.find(s => s.name.toLowerCase() === app.name.toLowerCase() || s.id === app.id);
          if (match) {
            return {
              ...app,
              url: app.url || match.url,
              packageName: match.packageName,
              fallbackPackageNames: match.fallbackPackageNames
            };
          }
          if (app.name === 'WhatsApp' || (app.url && app.url.includes('whatsapp'))) {
            return {
              ...app,
              url: 'https://web.whatsapp.com',
              packageName: 'com.whatsapp',
              fallbackPackageNames: ['com.whatsapp.w4b']
            };
          }
          return app;
        });
      }
    } catch (e) {}
    return DEFAULT_SERVICES;
  });

  const [activeAppId, setActiveAppId] = useState(() => {
    try {
      const savedPrefs = localStorage.getItem('rambox_preferences');
      const prefs = savedPrefs ? JSON.parse(savedPrefs) : DEFAULT_PREFERENCES;
      if (prefs.defaultView === 'last-active') {
        const lastActive = localStorage.getItem('rambox_mobile_active_app');
        if (lastActive) return lastActive;
      }
    } catch (e) {}
    return DEFAULT_SERVICES[0].id;
  });

  const [isServicesModalOpen, setIsServicesModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isManualUpdateOpen, setIsManualUpdateOpen] = useState(false);
  const [hasOverlayPermission, setHasOverlayPermission] = useState(true);

  const wakeLockRef = useRef(null);

  // Check and sync overlay permission (canDrawOverlays)
  useEffect(() => {
    const checkOverlay = () => {
      if (window.RamboxNative && window.RamboxNative.canDrawOverlays) {
        try {
          setHasOverlayPermission(window.RamboxNative.canDrawOverlays());
        } catch (e) {}
      }
    };
    checkOverlay();
    window.addEventListener('focus', checkOverlay);
    return () => window.removeEventListener('focus', checkOverlay);
  }, []);

  // Sync active app to Native Bridge so floating island always knows which app is open
  useEffect(() => {
    const currentApp = apps.find(a => a.id === activeAppId);
    if (currentApp && window.RamboxNative && window.RamboxNative.setActiveApp) {
      try {
        const pkg = getInstalledPackage(currentApp) || currentApp.packageName || '';
        window.RamboxNative.setActiveApp(currentApp.name, pkg);
      } catch (e) {}
    }
  }, [activeAppId, apps]);

  // Listen for navigation and modal commands dispatched from the Native Camera Dynamic Island
  useEffect(() => {
    const handleFloatingNav = (e) => {
      const direction = e.detail?.direction;
      if (!apps || apps.length === 0) return;
      const activeIndex = apps.findIndex(a => a.id === activeAppId);
      if (direction === 'next') {
        const nextIdx = (activeIndex + 1) % apps.length;
        const targetApp = apps[nextIdx];
        setActiveAppId(targetApp.id);
        launchAppDirectly(targetApp);
      } else if (direction === 'prev') {
        const prevIdx = (activeIndex - 1 + apps.length) % apps.length;
        const targetApp = apps[prevIdx];
        setActiveAppId(targetApp.id);
        launchAppDirectly(targetApp);
      }
    };

    const handleRamboxAction = (e) => {
      const action = e.detail?.action;
      if (action === 'services' || action === 'toggle-services') {
        setIsServicesModalOpen(prev => (action === 'toggle-services' ? !prev : true));
      } else if (action === 'settings') {
        setIsSettingsOpen(true);
      } else if (action === 'updates') {
        setIsManualUpdateOpen(true);
      }
    };

    window.addEventListener('floating-island-nav', handleFloatingNav);
    window.addEventListener('rambox-action', handleRamboxAction);
    return () => {
      window.removeEventListener('floating-island-nav', handleFloatingNav);
      window.removeEventListener('rambox-action', handleRamboxAction);
    };
  }, [activeAppId, apps]);

  // Persistence of apps & active app
  useEffect(() => {
    localStorage.setItem('rambox_mobile_apps', JSON.stringify(apps));
  }, [apps]);

  useEffect(() => {
    localStorage.setItem('rambox_mobile_active_app', activeAppId);
  }, [activeAppId]);

  // Persistence of preferences
  const handleSavePreferences = (newPrefs) => {
    setPreferences(newPrefs);
    localStorage.setItem('rambox_preferences', JSON.stringify(newPrefs));
    if (window.RamboxNative && window.RamboxNative.setAutoStartEnabled) {
      try {
        window.RamboxNative.setAutoStartEnabled(newPrefs.autoStart !== false);
      } catch (e) {}
    }
  };

  // Sync autoStart to Native Android SharedPreferences for BootReceiver
  useEffect(() => {
    if (window.RamboxNative && window.RamboxNative.setAutoStartEnabled) {
      try {
        window.RamboxNative.setAutoStartEnabled(preferences.autoStart !== false);
      } catch (e) {}
    }
  }, [preferences.autoStart]);

  // Screen Wake Lock (Keep Screen On preference)
  useEffect(() => {
    const manageWakeLock = async () => {
      try {
        if (preferences.keepScreenOn && 'wakeLock' in navigator) {
          if (!wakeLockRef.current) {
            wakeLockRef.current = await navigator.wakeLock.request('screen');
          }
        } else if (wakeLockRef.current) {
          await wakeLockRef.current.release();
          wakeLockRef.current = null;
        }
      } catch (err) {
        console.warn('WakeLock not supported or denied', err);
      }
    };
    manageWakeLock();

    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [preferences.keepScreenOn]);

  // Handle Android Native Hardware Back Button & Gestures
  useEffect(() => {
    let handler = null;
    const initBack = async () => {
      handler = await CapApp.addListener('backButton', () => {
        // 1. Close open modals first
        if (isManualUpdateOpen) {
          setIsManualUpdateOpen(false);
          return;
        }
        if (isSettingsOpen) {
          setIsSettingsOpen(false);
          return;
        }
        if (isServicesModalOpen) {
          setIsServicesModalOpen(false);
          return;
        }

        // 2. Dispatch goBack action to current active webview
        window.dispatchEvent(new CustomEvent('mobile-webview-action', {
          detail: { action: 'goBack', appId: activeAppId }
        }));
      });
    };
    initBack();

    return () => {
      if (handler && handler.remove) handler.remove();
    };
  }, [isManualUpdateOpen, isSettingsOpen, isServicesModalOpen, activeAppId]);

  const handleAddApp = (newApp) => {
    setApps(prev => [...prev, newApp]);
    setActiveAppId(newApp.id);
    launchAppDirectly(newApp);
  };

  const handleRemoveApp = (appId) => {
    if (apps.length <= 1) return;
    const newApps = apps.filter(a => a.id !== appId);
    setApps(newApps);
    if (activeAppId === appId) {
      setActiveAppId(newApps[0].id);
    }
  };

  const handleReloadActive = () => {
    window.dispatchEvent(new CustomEvent('mobile-webview-action', {
      detail: { action: 'reload', appId: activeAppId }
    }));
  };

  const handleResetIslandPosition = () => {
    localStorage.removeItem('rambox_dynamic_island_pos');
    if (window.RamboxNative && window.RamboxNative.resetIslandPosition) {
      try {
        window.RamboxNative.resetIslandPosition();
      } catch (e) {}
    }
    window.location.reload();
  };

  const isAmoled = preferences.theme === 'amoled';

  return (
    <div className={`w-full h-full flex flex-col ${isAmoled ? 'bg-black' : 'bg-[#0c0c14]'} text-white relative overflow-hidden select-none`}>
      
      {/* ============================================================== */}
      {/* FLOATING OVERLAY PERMISSION WARNING BANNER                     */}
      {/* ============================================================== */}
      {!hasOverlayPermission && (
        <div className="mx-4 mt-2 mb-1 p-2.5 rounded-2xl bg-amber-500/20 border border-amber-500/35 backdrop-blur-md flex items-center justify-between text-xs animate-in fade-in slide-in-from-top-2 duration-200 shadow-xl z-30">
          <div className="flex items-center space-x-2 mr-2">
            <ShieldAlert size={16} className="text-amber-400 shrink-0" />
            <div>
              <p className="font-bold text-amber-200 text-[11px] leading-tight">Izin Dynamic Island Diperlukan</p>
              <p className="text-[10px] text-amber-300/80 leading-tight">Aktifkan agar Dynamic Island tetap muncul di dekat kamera depan di semua layar.</p>
            </div>
          </div>
          <button
            onClick={() => {
              if (window.RamboxNative?.requestOverlayPermission) {
                window.RamboxNative.requestOverlayPermission();
              }
            }}
            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-[11px] whitespace-nowrap shrink-0 shadow-md active:scale-95 transition-all"
          >
            Beri Izin
          </button>
        </div>
      )}

      {/* ============================================================== */}
      {/* 1. PERSISTENT WEBVIEW STACK                                    */}
      {/* pt-8 memberi ruang kamera System UI & pb-14 untuk bottom dock  */}
      {/* ============================================================== */}
      <div className="flex-1 w-full h-full relative overflow-hidden pt-8 pb-14">
        {apps.map((app) => {
          const isActive = app.id === activeAppId;
          return (
            <div
              key={app.id}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                visibility: isActive ? 'visible' : 'hidden',
                zIndex: isActive ? 10 : 0,
                pointerEvents: isActive ? 'auto' : 'none'
              }}
            >
              <MobileWebview 
                app={app} 
                isActive={isActive} 
                isDarkMode={true} 
                onRemoveApp={handleRemoveApp}
                isMuted={preferences.muteAll}
              />
            </div>
          );
        })}
      </div>

      {/* ============================================================== */}
      {/* 2. FLOATING BOTTOM QUICK DOCK (Akses Cepat Layanan & Settings) */}
      {/* ============================================================== */}
      <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 flex items-center px-3 py-1.5 rounded-full bg-[#121220]/90 backdrop-blur-xl border border-white/15 shadow-[0_8px_32px_rgba(0,0,0,0.6)] space-x-2 transition-all">
        {/* App Quick Switcher Pills */}
        <div className="flex items-center space-x-1.5 max-w-[55vw] overflow-x-auto no-scrollbar py-0.5">
          {apps.map((app) => {
            const isActive = app.id === activeAppId;
            return (
              <button
                key={app.id}
                onClick={() => {
                  setActiveAppId(app.id);
                  launchAppDirectly(app);
                }}
                className={`w-7 h-7 rounded-xl transition-all flex items-center justify-center shrink-0 ${
                  isActive 
                    ? 'bg-indigo-600/80 scale-105 shadow-md shadow-indigo-600/50 ring-2 ring-indigo-400' 
                    : 'bg-white/10 hover:bg-white/20 opacity-70 hover:opacity-100'
                }`}
                title={app.name}
              >
                <img 
                  src={app.iconPath} 
                  alt={app.name} 
                  className="w-4 h-4 object-contain"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              </button>
            );
          })}
        </div>

        <div className="w-[1px] h-4 bg-white/20 shrink-0" />

        {/* Tambah Layanan (+) */}
        <button
          onClick={() => setIsServicesModalOpen(true)}
          className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-all active:scale-95 shrink-0"
          title="Tambah Layanan"
        >
          <Plus size={15} />
        </button>

        {/* Pengaturan (⚙) */}
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-all active:scale-95 shrink-0"
          title="Pengaturan"
        >
          <Settings size={15} />
        </button>
      </div>

      {/* ============================================================== */}
      {/* 3. MODALS (Kelola Layanan, Pengaturan Lengkap, & Pembaruan OTA) */}
      {/* ============================================================== */}
      <ServicesModal 
        isOpen={isServicesModalOpen}
        onClose={() => setIsServicesModalOpen(false)}
        apps={apps}
        onAddApp={handleAddApp}
        onRemoveApp={handleRemoveApp}
      />

      <SettingsModal 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        preferences={preferences}
        onSavePreferences={handleSavePreferences}
        onResetIslandPosition={handleResetIslandPosition}
        onCheckUpdates={() => {
          setIsSettingsOpen(false);
          setIsManualUpdateOpen(true);
        }}
      />

      <AutoUpdaterModal 
        isOpenManual={isManualUpdateOpen}
        onCloseManual={() => setIsManualUpdateOpen(false)}
      />

    </div>
  );
}
