import React, { useState, useEffect } from 'react';
import { App as CapApp } from '@capacitor/app';
import { DEFAULT_SERVICES } from './config/constants';
import MobileWebview from './components/MobileWebview';
import ServicesModal from './components/ServicesModal';
import AutoUpdaterModal from './components/AutoUpdaterModal';
import DynamicIsland from './ui/DynamicIsland';

export default function App() {
  const [apps, setApps] = useState(() => {
    try {
      const saved = localStorage.getItem('rambox_mobile_apps');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return DEFAULT_SERVICES;
  });

  const [activeAppId, setActiveAppId] = useState(() => {
    return localStorage.getItem('rambox_mobile_active_app') || DEFAULT_SERVICES[0].id;
  });

  const [isServicesModalOpen, setIsServicesModalOpen] = useState(false);
  const [isManualUpdateOpen, setIsManualUpdateOpen] = useState(false);

  // Persistence
  useEffect(() => {
    localStorage.setItem('rambox_mobile_apps', JSON.stringify(apps));
  }, [apps]);

  useEffect(() => {
    localStorage.setItem('rambox_mobile_active_app', activeAppId);
  }, [activeAppId]);

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
  }, [isManualUpdateOpen, isServicesModalOpen, activeAppId]);

  const handleAddApp = (newApp) => {
    setApps(prev => [...prev, newApp]);
    setActiveAppId(newApp.id);
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

  const activeApp = apps.find(a => a.id === activeAppId) || apps[0];

  return (
    <div className="w-full h-full flex flex-col bg-[#0c0c14] text-white relative overflow-hidden select-none">
      
      {/* ============================================================== */}
      {/* 1. DYNAMIC ISLAND (Satu-satunya Navigasi Modern & Jelas)       */}
      {/* ============================================================== */}
      <DynamicIsland 
        apps={apps}
        activeAppId={activeAppId}
        setActiveAppId={setActiveAppId}
        onRemoveApp={handleRemoveApp}
        onOpenServicesModal={() => setIsServicesModalOpen(true)}
        onCheckUpdates={() => setIsManualUpdateOpen(true)}
        onReloadActive={handleReloadActive}
      />

      {/* ============================================================== */}
      {/* 2. PERSISTENT WEBVIEW STACK                                    */}
      {/* pt-14 memastikan konten tidak tertutup oleh Dynamic Island     */}
      {/* ============================================================== */}
      <div className="flex-1 w-full h-full relative overflow-hidden pt-14">
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
              />
            </div>
          );
        })}
      </div>

      {/* ============================================================== */}
      {/* 3. MODALS (Kelola Layanan & Pembaruan OTA)                      */}
      {/* ============================================================== */}
      <ServicesModal 
        isOpen={isServicesModalOpen}
        onClose={() => setIsServicesModalOpen(false)}
        apps={apps}
        onAddApp={handleAddApp}
        onRemoveApp={handleRemoveApp}
      />

      <AutoUpdaterModal 
        isOpenManual={isManualUpdateOpen}
        onCloseManual={() => setIsManualUpdateOpen(false)}
      />

    </div>
  );
}
