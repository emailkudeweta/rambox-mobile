import React, { useState, useEffect, useCallback } from 'react';
import { Download, Sparkles, X, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

export const CURRENT_APP_VERSION = '1.0.5';
const GITHUB_REPO = 'emailkudeweta/rambox-mobile';
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

export default function AutoUpdaterModal({ isOpenManual, onCloseManual }) {
  const [updateInfo, setUpdateInfo] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // Version comparison helper: returns true if vRemote > vLocal
  const isNewerVersion = (remoteTag, localVer) => {
    try {
      const cleanRemote = remoteTag.replace(/^[vV]/, '').trim();
      const cleanLocal = localVer.replace(/^[vV]/, '').trim();

      const rParts = cleanRemote.split('.').map(Number);
      const lParts = cleanLocal.split('.').map(Number);

      for (let i = 0; i < Math.max(rParts.length, lParts.length); i++) {
        const r = rParts[i] || 0;
        const l = lParts[i] || 0;
        if (r > l) return true;
        if (r < l) return false;
      }
      return false;
    } catch (e) {
      return false;
    }
  };

  const checkForUpdates = useCallback(async (isManual = false) => {
    setIsChecking(true);
    setStatusMessage('');
    try {
      const response = await fetch(GITHUB_API_URL, {
        headers: { Accept: 'application/vnd.github.v3+json' }
      });

      if (!response.ok) {
        if (isManual) {
          setStatusMessage('Belum ada rilis versi baru di GitHub.');
        }
        setIsChecking(false);
        return;
      }

      const data = await response.json();
      if (!data || !data.tag_name) {
        if (isManual) setStatusMessage('Belum ada pembaruan tersedia.');
        setIsChecking(false);
        return;
      }

      const hasUpdate = isNewerVersion(data.tag_name, CURRENT_APP_VERSION);
      if (hasUpdate) {
        // Find APK asset in release
        const apkAsset = (data.assets || []).find(a => 
          a.name && a.name.toLowerCase().endsWith('.apk')
        );

        const downloadUrl = apkAsset ? apkAsset.browser_download_url : data.html_url;
        const sizeMb = apkAsset ? (apkAsset.size / (1024 * 1024)).toFixed(1) : null;

        setUpdateInfo({
          tag: data.tag_name,
          title: data.name || data.tag_name,
          body: data.body || 'Pembaruan stabilitas dan peningkatan performa.',
          downloadUrl: downloadUrl,
          sizeMb: sizeMb,
          publishedAt: data.published_at ? new Date(data.published_at).toLocaleDateString('id-ID') : ''
        });
        setIsOpen(true);
      } else {
        if (isManual) {
          setStatusMessage(`Aplikasi Anda sudah dalam versi terbaru (v${CURRENT_APP_VERSION}).`);
        }
      }
    } catch (err) {
      if (isManual) {
        setStatusMessage('Gagal memeriksa pembaruan. Periksa koneksi internet Anda.');
      }
    } finally {
      setIsChecking(false);
    }
  }, []);

  // Silent automatic check on app startup (runs after 3 seconds)
  useEffect(() => {
    const timer = setTimeout(() => {
      checkForUpdates(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, [checkForUpdates]);

  // When manual check is requested from parent
  useEffect(() => {
    if (isOpenManual) {
      checkForUpdates(true);
    }
  }, [isOpenManual, checkForUpdates]);

  const handleStartUpdate = () => {
    if (!updateInfo || !updateInfo.downloadUrl) return;

    setIsDownloading(true);

    if (window.RamboxUpdater && window.RamboxUpdater.startApkDownload) {
      window.RamboxUpdater.startApkDownload(updateInfo.downloadUrl, updateInfo.tag);
      setStatusMessage('Mengunduh pembaruan di latar belakang... Periksa bilah notifikasi HP Anda.');
    } else {
      // Fallback
      window.open(updateInfo.downloadUrl, '_system');
      setStatusMessage('Membuka link download APK...');
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    if (onCloseManual) onCloseManual();
  };

  if (!isOpen && !isOpenManual) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="w-full max-w-sm bg-[#161622] border border-white/10 rounded-3xl p-5 shadow-2xl text-white flex flex-col space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Sparkles size={20} />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Pembaruan Tersedia!</h3>
              <p className="text-xs text-white/50">Rambox Mobile</p>
            </div>
          </div>
          <button 
            onClick={handleClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-white/50 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Update Card Info */}
        {updateInfo ? (
          <div className="space-y-3">
            <div className="p-3 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between text-xs">
              <div>
                <span className="text-white/40 block text-[10px]">Versi Baru</span>
                <span className="font-bold text-emerald-400 text-sm">{updateInfo.tag}</span>
              </div>
              <div className="text-right">
                <span className="text-white/40 block text-[10px]">Versi Saat Ini</span>
                <span className="font-medium text-white/70">v{CURRENT_APP_VERSION}</span>
              </div>
              {updateInfo.sizeMb && (
                <div className="text-right border-l border-white/10 pl-3">
                  <span className="text-white/40 block text-[10px]">Ukuran</span>
                  <span className="font-medium text-white/70">{updateInfo.sizeMb} MB</span>
                </div>
              )}
            </div>

            {/* Changelog Box */}
            <div className="p-3 rounded-2xl bg-black/30 border border-white/5 max-h-32 overflow-y-auto no-scrollbar text-xs space-y-1">
              <p className="text-[11px] font-bold text-white/60 uppercase tracking-wider">Catatan Rilis:</p>
              <p className="text-white/80 whitespace-pre-line leading-relaxed">{updateInfo.body}</p>
            </div>

            {statusMessage && (
              <p className="text-xs text-indigo-300 bg-indigo-500/10 p-2.5 rounded-xl border border-indigo-500/20 leading-relaxed text-center">
                {statusMessage}
              </p>
            )}

            {/* Action Buttons */}
            <div className="flex items-center space-x-2 pt-1">
              <button
                onClick={handleClose}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-white/70 transition-colors"
              >
                Nanti Saja
              </button>
              <button
                onClick={handleStartUpdate}
                disabled={isDownloading}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-lg shadow-indigo-600/30 flex items-center justify-center space-x-2 active:scale-95 transition-all disabled:opacity-50"
              >
                <Download size={14} />
                <span>{isDownloading ? 'Mengunduh...' : 'Perbarui'}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="py-6 flex flex-col items-center justify-center space-y-3 text-center">
            {isChecking ? (
              <>
                <RefreshCw size={24} className="animate-spin text-indigo-400" />
                <p className="text-xs text-white/60">Memeriksa pembaruan di GitHub...</p>
              </>
            ) : (
              <>
                <CheckCircle2 size={32} className="text-emerald-400" />
                <p className="text-xs font-medium text-white/80">
                  {statusMessage || `Aplikasi Anda sudah versi terbaru (v${CURRENT_APP_VERSION}).`}
                </p>
                <button
                  onClick={handleClose}
                  className="mt-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold"
                >
                  Tutup
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

