import React, { useRef, useEffect, useState } from 'react';
import ChromeMobileBrowser from './ChromeMobileBrowser';
import { RotateCw, AlertTriangle, ChevronLeft, ChevronRight, Compass, Trash2, LogIn, ExternalLink } from 'lucide-react';
import { isAppNativelyInstalled, launchAppDirectly } from '../utils/nativeLauncher';

export default function MobileWebview({ app, isActive, isDarkMode, onRemoveApp }) {
  const iframeRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isNavPillExpanded, setIsNavPillExpanded] = useState(false);
  const [userChoseWebView, setUserChoseWebView] = useState(false);
  const autoLaunchRef = useRef(false);

  // Keep URL clean without unsupported query parameters
  const serviceUrl = app.url || 'about:blank';

  // Check if native app is installed on the device
  const isNativeInstalled = isAppNativelyInstalled(app);

  // Auto-launch native app directly when active and installed on device
  useEffect(() => {
    if (isActive && isNativeInstalled && !userChoseWebView) {
      if (!autoLaunchRef.current) {
        autoLaunchRef.current = true;
        launchAppDirectly(app);
      }
    } else if (!isActive) {
      autoLaunchRef.current = false;
    }
  }, [isActive, isNativeInstalled, userChoseWebView, app]);

  const handleGoBack = () => {
    if (iframeRef.current?.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage({ action: 'goBack' }, '*');
      } catch (e) {}
      try {
        iframeRef.current.contentWindow.history.back();
      } catch (e) {}
    }
  };

  const handleGoForward = () => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.history.forward();
    }
  };

  const handleReload = () => {
    setIsLoading(true);
    setHasError(false);
    if (iframeRef.current) {
      iframeRef.current.src = serviceUrl;
    }
  };

  useEffect(() => {
    const handleGoogleLoginDone = () => {
      // Reload iframe automatically when Google login completes in native sheet
      if (iframeRef.current) {
        setIsLoading(true);
        setHasError(false);
        iframeRef.current.src = iframeRef.current.src || serviceUrl;
      }
    };

    window.addEventListener('google-login-done', handleGoogleLoginDone);
    return () => window.removeEventListener('google-login-done', handleGoogleLoginDone);
  }, [serviceUrl]);

  useEffect(() => {
    const handleWebviewAction = (e) => {
      if (e.detail?.appId === app.id && iframeRef.current) {
        if (e.detail.action === 'reload') {
          handleReload();
        } else if (e.detail.action === 'goBack') {
          handleGoBack();
        } else if (e.detail.action === 'goForward') {
          handleGoForward();
        }
      }
    };

    window.addEventListener('mobile-webview-action', handleWebviewAction);
    return () => window.removeEventListener('mobile-webview-action', handleWebviewAction);
  }, [app.id, serviceUrl]);

  // If installed natively and user has not explicitly requested webview, show clean 1-tap launcher
  if (isNativeInstalled && !userChoseWebView) {
    return (
      <div 
        onClick={() => launchAppDirectly(app)}
        className="w-full h-full flex flex-col items-center justify-center p-6 text-center select-none bg-gradient-to-b from-[#0f0f18] via-[#0c0c14] to-black cursor-pointer"
      >
        {/* App Icon with subtle glow */}
        <div className="relative mb-6">
          <div 
            className="absolute inset-0 rounded-3xl blur-2xl opacity-30 animate-pulse"
            style={{ backgroundColor: app.color || '#3b82f6' }}
          />
          <div 
            className="relative w-24 h-24 rounded-3xl flex items-center justify-center p-4 border border-white/15 shadow-2xl backdrop-blur-xl"
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

        {/* Clean Direct Launch Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            launchAppDirectly(app);
          }}
          className="py-3 px-6 rounded-2xl font-bold text-sm text-white flex items-center justify-center space-x-2 shadow-xl active:scale-95 transition-all"
          style={{ 
            backgroundColor: app.color || '#22c55e',
            boxShadow: `0 8px 24px ${app.color || '#22c55e'}40`
          }}
        >
          <ExternalLink size={16} />
          <span>Buka Aplikasi {app.name}</span>
        </button>

        {/* Subtle Web Alternative */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setUserChoseWebView(true);
          }}
          className="mt-6 text-xs text-white/40 hover:text-white/80 transition-colors py-1.5 px-3 rounded-lg hover:bg-white/5"
        >
          Gunakan versi web
        </button>
      </div>
    );
  }

  if (app.isBrowser) {
    return <ChromeMobileBrowser app={app} isDarkMode={isDarkMode} />;
  }

  return (
    <div className="w-full h-full relative overflow-hidden bg-[#0c0c14]">
      {/* 1. FLOATING MINI QUICK-NAV PILL */}
      <div className="fixed top-3 right-3 z-50 flex items-center">
        {isNavPillExpanded ? (
          <div className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-full bg-[#161622]/90 backdrop-blur-xl border border-white/15 shadow-2xl text-white animate-in fade-in slide-in-from-right-3 duration-200">
            <button
              onClick={handleGoBack}
              className="p-1 rounded-full hover:bg-white/10 active:scale-90 transition-transform text-white/80 hover:text-white"
              title="Kembali"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={handleReload}
              className="p-1 rounded-full hover:bg-white/10 active:scale-90 transition-transform text-white/80 hover:text-white"
              title="Muat Ulang"
            >
              <RotateCw size={13} className={isLoading ? 'animate-spin text-indigo-400' : ''} />
            </button>
            <button
              onClick={handleGoForward}
              className="p-1 rounded-full hover:bg-white/10 active:scale-90 transition-transform text-white/80 hover:text-white"
              title="Maju"
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => {
                if (window.RamboxUpdater && window.RamboxUpdater.openGoogleLogin) {
                  window.RamboxUpdater.openGoogleLogin(serviceUrl);
                } else {
                  window.open('https://accounts.google.com/ServiceLogin', '_blank');
                }
              }}
              className="p-1 rounded-full hover:bg-amber-500/20 active:scale-90 transition-transform text-amber-400 hover:text-amber-300"
              title="Login Akun Google Resmi"
            >
              <LogIn size={13} />
            </button>
            {onRemoveApp && (
              <button
                onClick={() => {
                  if (window.confirm(`Hapus layanan ${app.name} dari daftar?`)) {
                    onRemoveApp(app.id);
                  }
                }}
                className="p-1 rounded-full hover:bg-red-500/20 active:scale-90 transition-transform text-red-400 hover:text-red-300"
                title={`Hapus ${app.name}`}
              >
                <Trash2 size={13} />
              </button>
            )}
            <button
              onClick={() => setIsNavPillExpanded(false)}
              className="pl-1 border-l border-white/10 text-[10px] text-white/50 hover:text-white font-mono"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsNavPillExpanded(true)}
            className="p-2 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white/60 hover:text-white shadow-lg active:scale-90 transition-all opacity-60 hover:opacity-100"
            title="Navigasi Halaman"
          >
            <Compass size={15} />
          </button>
        )}
      </div>

      {/* 2. LOADING SKELETON */}
      {isLoading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0c0c14] text-white/70 space-y-3">
          <div className="w-9 h-9 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          <p className="text-xs font-medium tracking-wide">Menghubungkan ke {app.name}...</p>
        </div>
      )}

      {/* 3. ERROR FALLBACK */}
      {hasError && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#12121e] text-white p-6 text-center space-y-4">
          <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-400">
            <AlertTriangle size={32} />
          </div>
          <div>
            <h4 className="font-bold text-base mb-1">Gagal Menghubungkan</h4>
            <p className="text-xs text-white/50 max-w-xs">
              Pastikan Anda terhubung ke internet untuk mengakses {app.name}.
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleReload}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold flex items-center space-x-2 shadow-lg shadow-indigo-600/20 active:scale-95 transition-transform"
            >
              <RotateCw size={14} />
              <span>Coba Lagi</span>
            </button>
            <button
              onClick={() => {
                if (window.RamboxUpdater && window.RamboxUpdater.openGoogleLogin) {
                  window.RamboxUpdater.openGoogleLogin(serviceUrl);
                } else {
                  window.open('https://accounts.google.com/ServiceLogin', '_blank');
                }
              }}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-xs font-semibold flex items-center space-x-2 shadow-lg shadow-amber-600/20 active:scale-95 transition-transform"
            >
              <LogIn size={14} />
              <span>Login Google</span>
            </button>
          </div>
        </div>
      )}

      {/* 4. PRIMARY SERVICE IFRAME (NO SANDBOX: Allows ServiceWorkers, WebCrypto & IndexedDB) */}
      <iframe
        ref={iframeRef}
        src={serviceUrl}
        title={app.name}
        className="w-full h-full border-none bg-white"
        allow="camera; microphone; geolocation; clipboard-read; clipboard-write; autoplay; fullscreen"
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false);
          setHasError(true);
        }}
      />
    </div>
  );
}
