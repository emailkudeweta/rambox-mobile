import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  ArrowLeft, ArrowRight, RotateCw, X, Search, Globe, Lock, Plus, 
  Layers, Home, Shield, Trash2, ChevronDown, ChevronUp, Share2 
} from 'lucide-react';

export default function ChromeMobileBrowser({ app, isDarkMode = true }) {
  const [tabs, setTabs] = useState([
    {
      id: `tab-${Date.now()}-1`,
      url: app?.url || 'https://www.google.com',
      title: 'Google',
      isLoading: false
    }
  ]);
  const [activeTabId, setActiveTabId] = useState(tabs[0].id);
  const [inputUrl, setInputUrl] = useState(tabs[0].url);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isTabSwitcherOpen, setIsTabSwitcherOpen] = useState(false);
  const [isFindOpen, setIsFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  
  const iframeRefs = useRef({});
  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

  useEffect(() => {
    if (activeTab && !isInputFocused) {
      setInputUrl(activeTab.url);
    }
  }, [activeTab, isInputFocused]);

  const handleNewTab = (url = 'https://www.google.com') => {
    const newId = `tab-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newTab = { id: newId, url, title: 'Tab Baru', isLoading: false };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newId);
    setInputUrl(url);
    setIsTabSwitcherOpen(false);
  };

  const handleCloseTab = (tabIdToClose, e) => {
    if (e) e.stopPropagation();
    if (tabs.length <= 1) {
      setTabs([{ ...tabs[0], url: 'https://www.google.com', title: 'Google' }]);
      setInputUrl('https://www.google.com');
      return;
    }
    const index = tabs.findIndex(t => t.id === tabIdToClose);
    const newTabs = tabs.filter(t => t.id !== tabIdToClose);
    if (activeTabId === tabIdToClose) {
      const nextIndex = Math.max(0, index - 1);
      setActiveTabId(newTabs[nextIndex].id);
      setInputUrl(newTabs[nextIndex].url);
    }
    setTabs(newTabs);
  };

  const handleNavigate = (rawInput) => {
    let target = rawInput.trim();
    if (!target) return;

    if (!target.includes('.') || target.includes(' ') || !target.includes('://') && !target.match(/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/)) {
      target = `https://www.google.com/search?q=${encodeURIComponent(target)}`;
    } else if (!target.startsWith('http://') && !target.startsWith('https://')) {
      target = `https://${target}`;
    }

    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, url: target, title: target, isLoading: true } : t));
    setInputUrl(target);
  };

  const isHttps = (activeTab?.url || '').startsWith('https://');

  return (
    <div className="w-full h-full flex flex-col bg-[#101018] text-white relative overflow-hidden">
      
      {/* 1. TOP STATUS BAR (Judul & URL Ringkas) */}
      <div className="h-10 px-3 bg-[#181824] border-b border-white/5 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2 min-w-0 flex-1">
          <img src="./Icon/chrome.ico" alt="Chrome" className="w-4 h-4 shrink-0" />
          <span className="text-xs font-semibold truncate text-white/90">{activeTab?.title || 'Google Chrome'}</span>
        </div>
        <div className="flex items-center space-x-1 shrink-0">
          <button 
            onClick={() => setIsFindOpen(!isFindOpen)}
            className="p-1.5 text-white/60 hover:text-white rounded-lg transition-colors"
            title="Cari"
          >
            <Search size={14} />
          </button>
          <button 
            onClick={() => handleNewTab('https://www.google.com')}
            className="p-1.5 text-white/60 hover:text-white rounded-lg transition-colors"
            title="Tab Baru"
          >
            <Plus size={15} />
          </button>
        </div>
      </div>

      {/* Floating Find Bar */}
      {isFindOpen && (
        <div className="bg-[#1c1c2b] border-b border-white/10 px-3 py-2 flex items-center space-x-2 shrink-0 animate-in fade-in duration-150">
          <Search size={14} className="text-white/40" />
          <input 
            type="text" 
            value={findQuery} 
            onChange={(e) => setFindQuery(e.target.value)}
            placeholder="Cari teks di halaman..." 
            className="flex-1 bg-transparent text-xs text-white outline-none"
          />
          <button onClick={() => setIsFindOpen(false)} className="p-1 text-white/50 hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}

      {/* 2. WEB CONTENT CONTAINER */}
      <div className="flex-1 w-full h-full relative overflow-hidden bg-white">
        {tabs.map((tab) => {
          const isCurrent = tab.id === activeTabId;
          return (
            <div 
              key={tab.id}
              className="absolute inset-0 w-full h-full"
              style={{ 
                visibility: isCurrent ? 'visible' : 'hidden', 
                zIndex: isCurrent ? 10 : 0 
              }}
            >
              <iframe
                ref={el => { if (el) iframeRefs.current[tab.id] = el; }}
                src={tab.url}
                title={tab.title}
                className="w-full h-full border-none"
                allow="camera; microphone; geolocation; clipboard-read; clipboard-write; autoplay; fullscreen"
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads"
              />
            </div>
          );
        })}
      </div>

      {/* 3. MOBILE BOTTOM OMNIBOX & TOOLBAR (Sangat ramah jempol) */}
      <div className="bg-[#181824] border-t border-white/10 p-2 pb-3 shrink-0 flex items-center space-x-2 z-30">
        <button 
          onClick={() => {
            const iframe = iframeRefs.current[activeTabId];
            if (iframe && iframe.contentWindow) iframe.contentWindow.history.back();
          }}
          className="p-2 text-white/70 hover:text-white active:scale-95 transition-all"
        >
          <ArrowLeft size={16} />
        </button>

        <button 
          onClick={() => {
            const iframe = iframeRefs.current[activeTabId];
            if (iframe && iframe.contentWindow) iframe.contentWindow.history.forward();
          }}
          className="p-2 text-white/70 hover:text-white active:scale-95 transition-all"
        >
          <ArrowRight size={16} />
        </button>

        {/* Address Bar */}
        <div className="flex-1 flex items-center bg-[#252538] rounded-full px-3 py-1.5 border border-white/5 focus-within:border-blue-500 transition-colors">
          <span className="mr-2 text-white/40 shrink-0">
            {isHttps ? <Lock size={12} className="text-emerald-400" /> : <Globe size={12} />}
          </span>
          <input 
            type="text" 
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setIsInputFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleNavigate(inputUrl);
                e.target.blur();
              }
            }}
            placeholder="Telusuri atau ketik URL..."
            className="w-full bg-transparent text-xs text-white outline-none truncate"
            spellCheck="false"
          />
          {inputUrl && isInputFocused && (
            <button onMouseDown={() => setInputUrl('')} className="p-0.5 text-white/40 hover:text-white">
              <X size={12} />
            </button>
          )}
        </div>

        {/* Tab Switcher Button with Badge */}
        <button 
          onClick={() => setIsTabSwitcherOpen(true)}
          className="relative p-2 rounded-lg border border-white/20 text-white font-mono text-xs font-bold w-8 h-8 flex items-center justify-center active:scale-90 transition-transform"
        >
          {tabs.length}
        </button>

        {/* Reload button */}
        <button 
          onClick={() => {
            const iframe = iframeRefs.current[activeTabId];
            if (iframe) iframe.src = activeTab.url;
          }}
          className="p-2 text-white/70 hover:text-white active:scale-95 transition-all"
        >
          <RotateCw size={15} />
        </button>
      </div>

      {/* 4. TAB SWITCHER OVERLAY / MODAL */}
      {isTabSwitcherOpen && (
        <div className="fixed inset-0 z-[500] bg-black/85 backdrop-blur-md flex flex-col p-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
            <div className="flex items-center space-x-2">
              <Layers size={18} className="text-blue-400" />
              <h4 className="font-bold text-sm">Tab Terbuka ({tabs.length})</h4>
            </div>
            <div className="flex items-center space-x-2">
              <button 
                onClick={() => handleNewTab('https://www.google.com')}
                className="px-3 py-1.5 rounded-full bg-blue-600 hover:bg-blue-500 text-xs font-semibold flex items-center space-x-1"
              >
                <Plus size={14} />
                <span>Tab Baru</span>
              </button>
              <button 
                onClick={() => setIsTabSwitcherOpen(false)}
                className="p-2 rounded-full hover:bg-white/10 text-white/70 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Tab Cards Grid */}
          <div className="grid grid-cols-2 gap-3 overflow-y-auto no-scrollbar py-4 flex-1">
            {tabs.map((tab) => {
              const isSelected = tab.id === activeTabId;
              return (
                <div 
                  key={tab.id}
                  onClick={() => {
                    setActiveTabId(tab.id);
                    setInputUrl(tab.url);
                    setIsTabSwitcherOpen(false);
                  }}
                  className={`p-3 rounded-2xl border flex flex-col justify-between h-36 relative transition-all cursor-pointer ${
                    isSelected 
                      ? 'bg-blue-900/30 border-blue-500 shadow-lg shadow-blue-500/20' 
                      : 'bg-white/5 border-white/10 hover:border-white/30'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <span className="text-xs font-bold line-clamp-2 pr-2">{tab.title || tab.url}</span>
                    <button 
                      onClick={(e) => handleCloseTab(tab.id, e)}
                      className="p-1 rounded-full bg-black/40 hover:bg-red-500/40 text-white/60 hover:text-white"
                    >
                      <X size={12} />
                    </button>
                  </div>
                  <div className="text-[10px] text-white/40 truncate font-mono">
                    {tab.url}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
