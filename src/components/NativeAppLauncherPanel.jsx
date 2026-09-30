import React, { useState, useEffect } from 'react';
import { ExternalLink, Layers, Sparkles, AlertCircle, CheckCircle2, Play, Globe, Shield } from 'lucide-react';

export default function NativeAppLauncherPanel({ app, isActive, onFallbackToWeb }) {
  const [isInstalled, setIsInstalled] = useState(true);
  const [canOverlay, setCanOverlay] = useState(false);
  const [isOverlayActive, setIsOverlayActive] = useState(false);
  const [hasAutoLaunched, setHasAutoLaunched] = useState(false);

  // Check package status & overlay permissions
  useEffect(() => {
    if (window.RamboxNative) {
      try {
        const installed = window.RamboxNative.isPackageInstalled(app.packageName);
        setIsInstalled(installed);
        setCanOverlay(window.RamboxNative.canDrawOverlays());
        setIsOverlayActive(window.RamboxNative.isFloatingIslandRunning());
      } catch (e) {
        console.warn('Native bridge check error', e);
      }
    }
  }, [app.packageName]);

  // Launch the native Android app
  const handleLaunch = () => {
    if (window.RamboxNative) {
      try {
        window.RamboxNative.launchPackage(app.packageName, app.url);
      } catch (e) {
        console.error('Error launching package via bridge', e);
      }
    } else {
      // Fallback intent for browser testing
      window.location.href = `intent:#Intent;package=${app.packageName};end`;
    }
  };

  // Native app is launched only when user clicks the launch button

  // Request overlay permission or toggle floating island
  const handleToggleOverlay = () => {
    if (!window.RamboxNative) return;

    if (!canOverlay) {
      window.RamboxNative.requestOverlayPermission();
    } else {
      if (isOverlayActive) {
        window.RamboxNative.stopFloatingIsland();
        setIsOverlayActive(false);
      } else {
        window.RamboxNative.startFloatingIsland();
        setIsOverlayActive(true);
      }
    }
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center select-none bg-gradient-to-b from-[#0f0f18] via-[#0c0c14] to-black">
      
      {/* 1. App Icon with Ambient Glow */}
      <div className="relative mb-6">
        <div 
          className="absolute inset-0 rounded-3xl blur-2xl opacity-40 animate-pulse"
          style={{ backgroundColor: app.color || '#3b82f6' }}
        />
        <div 
          className="relative w-24 h-24 rounded-3xl flex items-center justify-center p-4 border border-white/20 shadow-2xl backdrop-blur-xl"
          style={{ backgroundColor: `${app.color || '#3b82f6'}20` }}
        >
          <img 
            src={app.iconPath} 
            alt={app.name} 
            className="w-14 h-14 object-contain filter drop-shadow-lg"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        </div>
      </div>

      {/* 2. Title & Status */}
      <h2 className="text-2xl font-black tracking-tight text-white mb-1.5 flex items-center justify-center space-x-2">
        <span>{app.name}</span>
        <span className="text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-white/10 text-white/80 border border-white/10">
          Native APK
        </span>
      </h2>

      <p className="text-xs text-white/60 max-w-xs mb-6 leading-relaxed">
        Layanan ini terhubung langsung ke aplikasi {app.name} asli di perangkat Anda tanpa beban webview.
      </p>

      {/* 3. Primary Action Button */}
      <div className="w-full max-w-xs space-y-3 mb-6">
        <button
          onClick={handleLaunch}
          className="w-full py-3.5 px-5 rounded-2xl font-bold text-sm text-white flex items-center justify-center space-x-2.5 shadow-xl transition-all active:scale-95 cursor-pointer"
          style={{ 
            backgroundColor: app.color || '#22c55e',
            boxShadow: `0 8px 24px ${app.color || '#22c55e'}40`
          }}
        >
          <ExternalLink size={18} />
          <span>Buka Aplikasi {app.name}</span>
        </button>

        {!isInstalled && (
          <div className="flex items-center justify-center space-x-1.5 text-xs text-amber-400 bg-amber-400/10 py-2 px-3 rounded-xl border border-amber-400/20">
            <AlertCircle size={14} />
            <span>Aplikasi belum terdeteksi. Silakan pasang dari Play Store.</span>
          </div>
        )}
      </div>

      {/* 4. Floating Dynamic Island Shortcut Card */}
      <div className="w-full max-w-xs bg-white/5 border border-white/10 rounded-2xl p-4 text-left backdrop-blur-md">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Sparkles size={14} />
            </div>
            <span className="text-xs font-bold text-white">Dynamic Island Mengapung</span>
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
            isOverlayActive 
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-white/10 text-white/50'
          }`}>
            {isOverlayActive ? 'Aktif' : 'Nonaktif'}
          </span>
        </div>

        <p className="text-[11px] text-white/50 mb-3 leading-normal">
          Tampilkan pil mengapung di layar saat membuka {app.name} agar Anda dapat kembali ke Rambox dengan satu sentuhan.
        </p>

        <button
          onClick={handleToggleOverlay}
          className="w-full py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all bg-white/10 hover:bg-white/15 active:scale-95 text-white/90"
        >
          <Shield size={13} className="text-indigo-400" />
          <span>
            {!canOverlay 
              ? 'Beri Izin Layar Mengapung' 
              : isOverlayActive 
                ? 'Sembunyikan Island Melayang' 
                : 'Aktifkan Island Melayang'}
          </span>
        </button>
      </div>

      {/* 5. Fallback Web Preview Option */}
      {onFallbackToWeb && (
        <button
          onClick={onFallbackToWeb}
          className="mt-6 text-xs text-white/40 hover:text-white/70 flex items-center space-x-1 transition-colors"
        >
          <Globe size={13} />
          <span>Buka versi web sementara</span>
        </button>
      )}

    </div>
  );
}
