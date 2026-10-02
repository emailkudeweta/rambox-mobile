import React, { useState, useEffect } from 'react';
import { ExternalLink, Sparkles, CheckCircle2, Globe, Shield, RotateCw } from 'lucide-react';

export default function NativeAppLauncherPanel({ app, installedPackage, isActive, onFallbackToWeb }) {
  const [canOverlay, setCanOverlay] = useState(false);
  const [isOverlayActive, setIsOverlayActive] = useState(false);

  const targetPackage = installedPackage || app.packageName;

  // Check overlay permissions
  useEffect(() => {
    if (window.RamboxNative) {
      try {
        setCanOverlay(window.RamboxNative.canDrawOverlays());
        setIsOverlayActive(window.RamboxNative.isFloatingIslandRunning());
      } catch (e) {
        console.warn('Native bridge check error', e);
      }
    }
  }, []);

  // Launch the native Android app
  const handleLaunch = () => {
    if (window.RamboxNative && targetPackage) {
      try {
        window.RamboxNative.launchPackage(targetPackage, app.url);
      } catch (e) {
        console.error('Error launching package via bridge', e);
      }
    } else if (targetPackage) {
      window.location.href = `intent:#Intent;package=${targetPackage};end`;
    }
  };

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
        <span className="text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center space-x-1">
          <CheckCircle2 size={12} />
          <span>Aplikasi Terbuka</span>
        </span>
      </h2>

      <p className="text-xs text-white/60 max-w-xs mb-6 leading-relaxed">
        Aplikasi resmi {app.name} telah dibuka di ponsel Anda. Dynamic Island mengapung di layar agar Anda dapat kembali ke Rambox kapan saja.
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
          <span>Buka Ulang Aplikasi {app.name}</span>
        </button>
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
          Pil mengapung memudahkan Anda kembali ke Rambox atau berganti layanan langsung dari atas aplikasi {app.name}.
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
          className="mt-6 text-xs text-white/50 hover:text-white flex items-center space-x-1.5 transition-colors py-2 px-3 rounded-xl bg-white/5 border border-white/10"
        >
          <Globe size={13} />
          <span>Gunakan Versi Web di Rambox</span>
        </button>
      )}

    </div>
  );
}
