/**
 * WhatsApp Mobile Clone Engine for Rambox Mobile
 * Integrates WhatsApp Web Multi-Device Session (WPPConnect/WA-JS)
 * with the full native WhatsApp Mobile Clone UI.
 */

(function () {
  'use strict';

  // Prevent double injection
  if (window.__RAMBOX_WA_CLONE_LOADED__) return;
  window.__RAMBOX_WA_CLONE_LOADED__ = true;

  console.log('[Rambox WA Clone] Initializing WhatsApp Mobile Engine...');

  /* ============================================================== */
  /* 1. DOM CONTAINER SETUP                                         */
  /* ============================================================== */
  function ensureRoot() {
    let root = document.getElementById('rb-wa-root');
    if (!root && document.body) {
      root = document.createElement('div');
      root.id = 'rb-wa-root';
      root.innerHTML = `
        <div id="app-clone" class="h-full w-full bg-white flex flex-col relative overflow-hidden"></div>
        <div id="pages"></div>
        <div id="toast" class="fixed bottom-24 left-1/2 -translate-x-1/2 bg-[#323232] text-white text-[14px] px-4 py-2 rounded-lg opacity-0 transition-opacity pointer-events-none" style="z-index:9999999"></div>
      `;
      document.body.appendChild(root);
    }
    return root;
  }

  /* ============================================================== */
  /* 1.5. POSTMESSAGE SESSION BRIDGE CLIENT                        */
  /* ============================================================== */
  const pendingCmds = new Map();
  let cmdCounter = 0;
  let isWaAuthenticated = false;
  const bridgeListeners = {};

  function sendBridgeCmd(cmd, args = {}) {
    return new Promise((resolve, reject) => {
      const bridgeIframe = document.getElementById('wa-session-bridge');
      if (!bridgeIframe || !bridgeIframe.contentWindow) {
        return reject(new Error('Session bridge iframe not found'));
      }
      const cmdId = ++cmdCounter;
      pendingCmds.set(cmdId, { resolve, reject });
      try {
        bridgeIframe.contentWindow.postMessage({ type: 'WA_BRIDGE_CMD', cmdId, cmd, args }, '*');
      } catch (err) {
        pendingCmds.delete(cmdId);
        return reject(err);
      }
      setTimeout(() => {
        if (pendingCmds.has(cmdId)) {
          pendingCmds.delete(cmdId);
          reject(new Error('Bridge command timeout: ' + cmd));
        }
      }, 15000);
    });
  }

  // Transparent window.WPP proxy that delegates all calls to the session bridge
  window.WPP = {
    chat: {
      list: () => sendBridgeCmd('GET_CHATS'),
      getMessages: (chatId, opts = {}) => sendBridgeCmd('GET_MESSAGES', { chatId, count: opts.count || 50 }),
      sendTextMessage: (chatId, text) => sendBridgeCmd('SEND_TEXT', { chatId, text }),
      markIsRead: (chatId) => sendBridgeCmd('MARK_READ', { chatId }),
      markIsComposing: (chatId, duration) => sendBridgeCmd('MARK_COMPOSING', { chatId, duration })
    },
    profile: {
      getMyProfile: () => sendBridgeCmd('GET_MY_PROFILE'),
      getMyProfilePic: () => sendBridgeCmd('GET_MY_PIC')
    },
    status: {
      getStatuses: () => sendBridgeCmd('GET_STATUSES')
    },
    community: {
      list: () => sendBridgeCmd('GET_COMMUNITIES')
    },
    newsletter: {
      list: () => sendBridgeCmd('GET_NEWSLETTERS')
    },
    call: {
      getCalls: () => sendBridgeCmd('GET_CALLS')
    },
    conn: {
      isAuthenticated: () => isWaAuthenticated,
      genLinkDeviceCodeForPhoneNumber: (phone) => sendBridgeCmd('PAIRING_CODE', { phone }).then(r => r?.code),
      logout: () => sendBridgeCmd('LOGOUT')
    },
    on: (evt, cb) => {
      bridgeListeners[evt] = bridgeListeners[evt] || [];
      bridgeListeners[evt].push(cb);
    },
    emit: (evt, data) => {
      if (bridgeListeners[evt]) {
        bridgeListeners[evt].forEach(cb => { try { cb(data); } catch(e){} });
      }
    }
  };

  // Listen to bridge messages from the hidden iframe
  window.addEventListener('message', (event) => {
    if (!event.data) return;

    // Hardware back action from Rambox Mobile
    if (event.data.action === 'goBack') {
      const pages = document.getElementById('pages');
      if (pages && pages.children.length > 0) {
        back();
      }
      return;
    }

    // Response from bridge command
    if (event.data.type === 'WA_BRIDGE_RESP') {
      const { cmdId, success, result, error } = event.data;
      const pending = pendingCmds.get(cmdId);
      if (pending) {
        pendingCmds.delete(cmdId);
        if (success) pending.resolve(result);
        else pending.reject(new Error(error));
      }
      return;
    }

    // Proactive event from bridge
    if (event.data.type === 'WA_BRIDGE') {
      const action = event.data.action;
      if (action === 'QR_DATA_URL') {
        isWaAuthenticated = false;
        displayQrCode(event.data.dataUrl);
      } else if (action === 'AUTH_SUCCESS') {
        isWaAuthenticated = true;
        WPP.emit('conn.authenticated');
        startAuthenticatedApp();
      } else if (action === 'NEED_AUTH') {
        isWaAuthenticated = false;
        renderQrScreen();
      } else if (action === 'NEW_MSG') {
        handleIncomingMessage(event.data.msg);
        WPP.emit('chat.new_message', event.data.msg);
      } else if (action === 'MSG_ACK') {
        handleMessageAck(event.data.ack);
        WPP.emit('chat.msg_ack', event.data.ack);
      } else if (action === 'LOGOUT') {
        isWaAuthenticated = false;
        WPP.emit('conn.logout');
        renderQrScreen();
      }
    }
  });

  /* ============================================================== */
  /* 2. HELPERS & UTILITIES (from WhatsApp Mobile Clone)           */
  /* ============================================================== */
  const $ = (s, e = document) => e.querySelector(s);
  const ic = (n, c = '', s = '') => `<span class="material-symbols-rounded ${c}" style="${s}">${n}</span>`;
  const FI = "font-variation-settings:'FILL' 1";
  const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const now = () => new Date().toTimeString().slice(0, 5);
  const COL = ['#5B8DEF', '#E0658A', '#F2994A', '#27AE9C', '#9B6DFF', '#C9A400', '#2D9CDB', '#EB5757'];
  const WP = ['#EFEAE2', '#DCEBDD', '#E3E9F5', '#F3E2E2', '#CFD8DC'];
  const TITLES = ['WhatsApp', 'Pembaruan', 'Komunitas', 'Panggilan'];
  const EMO = '😀😃😄😁😆😅😂🤣😊😇🙂😉😍🥰😘😋😎🤩🥳😏😒😞😔😢😭😤😡🤯😱🤔🤗🙄😴👍👎👏🙏💪👌✌️🤝❤️💖💔🔥✨🎉🎂🌹☕🍕🍔🍜🚗✈️📷💻📱'.match(/\p{Extended_Pictographic}\uFE0F?/gu) || [];
  const BGS = ['linear-gradient(135deg,#f6d365,#fda085)', 'linear-gradient(135deg,#43cea2,#185a9d)', 'linear-gradient(135deg,#a18cd1,#fbc2eb)', '#075E54', '#5B4B8A'];

  let z = 50;
  let tab = 0;
  let flt = 0;
  let sel = new Set();
  let lpf = 0;
  let wp = WP[0];
  let PCB = null;
  let activeChatId = null;
  let activeChatIndex = -1;

  // Real App Data State
  let me = { n: 'Saya', a: 'Ada', phone: '', avatar: '' };
  let C = [];       // Real Chats list
  let calls = [];   // Real Calls list
  let ST = [];      // Real Status list
  let MS = [];      // My status
  let CH = [];      // Real Channels
  let COM = [];     // Real Communities
  const G = { ST, MS };

  function toast(t) {
    const e = $('#toast');
    if (!e) return;
    e.textContent = t;
    e.style.opacity = 1;
    clearTimeout(e._t);
    e._t = setTimeout(() => { e.style.opacity = 0; }, 1800);
  }
  const T = t => () => toast(t);

  function formatWaTime(timestamp, full = false) {
    if (!timestamp) return '';
    const date = new Date(typeof timestamp === 'number' && timestamp < 1e11 ? timestamp * 1000 : timestamp);
    if (isNaN(date.getTime())) return '';
    const nowD = new Date();
    const isToday = date.toDateString() === nowD.toDateString();
    
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    if (full || isToday) return timeStr;

    const yesterday = new Date(nowD);
    yesterday.setDate(nowD.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'Kemarin';

    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  const av = (c, s = 50) => {
    if (!c) return '';
    if (c.avatar) {
      return `<img src="${c.avatar}" style="width:${s}px;height:${s}px;object-fit:cover" class="rounded-full shrink-0" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><div style="display:none;width:${s}px;height:${s}px;background:${COL[String(c.n || 'A').charCodeAt(0) % 8]}" class="rounded-full items-center justify-center shrink-0 text-white"><span style="font-size:${s * 0.44}px">${[...(c.n || 'A')][0]}</span></div>`;
    }
    const g = c.g || c.ch;
    const initial = [...(c.n || '?')][0] || '?';
    const bgCol = g ? '#DFE5E7' : COL[initial.charCodeAt(0) % 8];
    return `<div style="width:${s}px;height:${s}px;background:${bgCol}" class="rounded-full flex items-center justify-center shrink-0 ${g ? 'text-wa-subtext' : 'text-white'}">${c.g ? ic('groups', '', `font-size:${s * 0.55}px`) : c.ch ? ic('campaign', '', `font-size:${s * 0.55}px`) : `<span style="font-size:${s * 0.44}px">${initial}</span>`}</div>`;
  };

  function page(html, cls = 'bg-white') {
    const d = document.createElement('div');
    d.className = `fixed inset-y-0 left-0 right-0 w-full flex flex-col ${cls} anim`;
    d.style.zIndex = ++z;
    d.innerHTML = html;
    $('#pages').appendChild(d);
    d.close = () => {
      d.remove();
      z--;
    };
    return d;
  }

  const back = () => {
    const p = $('#pages').lastElementChild;
    if (p && p.close) p.close();
  };

  const ib = (n, a = '') => `<div ${a} class="w-10 h-10 rounded-full flex items-center justify-center active:bg-gray-100 shrink-0">${ic(n, 'text-[24px]')}</div>`;
  const hdr = (t, r = '', s = '') => `<header class="h-[60px] flex items-center px-2 bg-white shrink-0 shadow-sm">${ib('arrow_back', 'onclick="window.__wa_back()"')}<div class="ml-2 flex-1 min-w-0"><h1 class="text-[20px] leading-tight truncate">${t}</h1>${s ? `<p class="text-[13px] text-wa-subtext leading-tight">${s}</p>` : ''}</div>${r}</header>`;
  window.__wa_back = back;

  function menu(items, pos = 'top-[52px] right-2') {
    closeMenu();
    const m = document.createElement('div');
    m.id = 'pm';
    m.className = 'fixed inset-0';
    m.style.zIndex = 9999;
    m.innerHTML = `<div class="relative h-full w-full"><div class="absolute ${pos} w-[225px] bg-white rounded-xl shadow-[0_4px_20px_rgba(0,0,0,.2)] py-2">${items.map((x, i) => `<div data-i="${i}" class="px-4 py-2.5 text-[15px] active:bg-[#EAEBEE]">${x[0]}</div>`).join('')}</div></div>`;
    m.onclick = e => {
      const i = e.target.dataset.i;
      closeMenu();
      if (i != null && items[i] && items[i][1]) items[i][1]();
    };
    document.body.appendChild(m);
  }
  const closeMenu = () => { const m = $('#pm'); m && m.remove(); };

  function sheet(html) {
    const s = document.createElement('div');
    s.style.zIndex = 9999;
    s.className = 'fixed inset-0 bg-black/40 flex items-end';
    s.onclick = e => { if (e.target === s) s.remove(); };
    s.innerHTML = `<div class="w-full bg-white rounded-t-3xl p-5 anim">${html}</div>`;
    document.body.appendChild(s);
    return s;
  }

  function dlg(t, o, cur, cb) {
    const s = document.createElement('div');
    s.style.zIndex = 10000;
    s.className = 'fixed inset-0 bg-black/40 flex items-center justify-center p-8';
    s.innerHTML = `<div class="bg-white rounded-3xl w-full max-w-[380px] p-6"><h3 class="text-[19px] mb-3 font-medium">${t}</h3>${o.map((x, i) => `<div data-i="${i}" class="flex items-center py-2.5"><div class="w-5 h-5 rounded-full border-2 ${x == cur ? 'border-wa-green' : 'border-gray-400'} flex items-center justify-center mr-4">${x == cur ? '<div class="w-2.5 h-2.5 rounded-full bg-wa-green"></div>' : ''}</div><span class="text-[16px]">${x}</span></div>`).join('')}<div class="text-right mt-3"><span class="text-wa-dark font-medium p-2 cursor-pointer" id="dc">Batal</span></div></div>`;
    s.onclick = e => {
      const r = e.target.closest('[data-i]');
      if (r) { cb(o[r.dataset.i]); s.remove(); }
      else if (e.target === s || e.target.id === 'dc') s.remove();
    };
    document.body.appendChild(s);
  }

  function ask(t, v, cb) {
    const s = document.createElement('div');
    s.style.zIndex = 10000;
    s.className = 'fixed inset-0 bg-black/40 flex items-center justify-center p-8';
    s.innerHTML = `<div class="bg-white rounded-3xl w-full max-w-[380px] p-6"><h3 class="text-[19px] mb-3 font-medium">${t}</h3><input value="${esc(v)}" class="w-full border-b-2 border-wa-green outline-none py-2 text-[16px]" style="user-select:text"><div class="text-right mt-5 space-x-6 text-wa-dark font-medium"><span id="dc" class="cursor-pointer">Batal</span><span id="ok" class="cursor-pointer">Simpan</span></div></div>`;
    s.onclick = e => {
      if (e.target.id === 'ok') {
        const x = $('input', s).value.trim();
        if (x) { cb(x); s.remove(); }
      } else if (e.target === s || e.target.id === 'dc') s.remove();
    };
    document.body.appendChild(s);
    $('input', s).focus();
  }

  const rowUI = (t, s = '', tg, icon = '', cls = '') => `<div onclick="window.__wa_rc(this)" class="flex items-center px-5 py-3.5 ab ${cls}">${icon ? `<div class="w-[36px] shrink-0 text-gray-600">${ic(icon, 'text-[22px]')}</div>` : ''}<div class="flex-1 pr-3"><h3 class="text-[16px]">${t}</h3>${s ? `<p class="text-[13px] text-wa-subtext mt-[1px]">${s}</p>` : ''}</div>${tg != null ? `<div class="tg ${tg ? 'on' : ''}"></div>` : ''}</div>`;
  window.__wa_rc = el => {
    const g = $('.tg', el);
    g ? g.classList.toggle('on') : toast($('h3', el).textContent);
  };

  const fab = (icon, a, cls = 'bottom-6 right-4') => `<button ${a ? `onclick="${a}"` : ''} class="absolute ${cls} w-[56px] h-[56px] bg-wa-green text-white rounded-[16px] shadow-[0_4px_12px_rgba(0,0,0,.2)] flex items-center justify-center active:bg-wa-dark z-20">${ic(icon, 'text-[26px]')}</button>`;
  const lab = m => ({ v: '🎤 Pesan suara', img: '📷 Foto', doc: '📄 ' + (m.x || 'Dokumen'), loc: '📍 Lokasi', ct: '👤 Kontak', poll: '📊 Poll' }[m.k] || m.x);

  /* ============================================================== */
  /* 3. HOME VIEWS (Chats, Status, Communities, Calls)              */
  /* ============================================================== */
  const ci = () => C.map((c, i) => [c, i]);

  const chatRow = (c, i) => {
    const s = sel.has(i);
    return `<div data-c="${i}" onclick="window.__wa_cr(${i})" class="flex items-center px-4 py-3 ab ${s ? 'bg-[#E9F5EE]' : ''}">
      <div class="relative">${av(c)}${s ? `<div class="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-wa-green rounded-full border-2 border-white text-white flex items-center justify-center">${ic('check', 'text-[14px]')}</div>` : ''}</div>
      <div class="ml-3.5 flex-1 min-w-0">
        <div class="flex justify-between items-center">
          <h3 class="text-[16px] ${c.u ? 'font-semibold text-wa-text' : 'font-medium'} truncate">${esc(c.n)}</h3>
          <span class="text-[12px] ${c.u ? 'text-wa-green font-semibold' : 'text-wa-subtext'}">${c.t || ''}</span>
        </div>
        <div class="flex justify-between items-center mt-[1px]">
          <p class="text-[14px] truncate flex items-center ${c.ty ? 'text-wa-green font-medium' : 'text-wa-subtext'}">
            ${c.ck && !c.ty ? ic('done_all', 'text-[#34B7F1] text-[18px] mr-1') : ''}
            <span class="truncate">${c.ty ? 'Mengetik...' : esc(c.l)}</span>
          </p>
          <div class="flex items-center space-x-1.5 pl-2">
            ${c.mu ? ic('volume_off', 'text-wa-subtext text-[16px]') : ''}
            ${c.pin ? ic('push_pin', 'text-wa-subtext text-[18px] rotate-45') : ''}
            ${c.u ? `<div class="bg-wa-green text-white text-[11px] font-bold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center">${c.u}</div>` : ''}
          </div>
        </div>
      </div>
    </div>`;
  };

  window.__wa_cr = function (i) {
    if (lpf) { lpf = 0; return; }
    if (sel.size) {
      sel.has(i) ? sel.delete(i) : sel.add(i);
      render();
    } else {
      openChat(i);
    }
  };

  function chatsTab() {
    const L = ci()
      .filter(([x]) => !x.a && !x.h && !x.x && [1, x.u > 0, x.fav, x.g][flt])
      .sort((a, b) => (b[0].pin || 0) - (a[0].pin || 0) || (b[0].rawTime || 0) - (a[0].rawTime || 0));
    
    const na = C.filter(x => x.a).length;
    return `
      <div class="px-4 py-1">
        <div onclick="window.__wa_openSearch()" class="bg-[#F5F6F6] h-[48px] rounded-full flex items-center px-4 cursor-pointer">
          <svg viewBox="0 0 24 24" width="22" height="22">
            <defs>
              <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#3385FF"/><stop offset=".5" stop-color="#9933FF"/><stop offset="1" stop-color="#FF3399"/>
              </linearGradient>
            </defs>
            <circle cx="12" cy="12" r="8.5" fill="none" stroke="url(#g)" stroke-width="2.5"/>
          </svg>
          <span class="ml-3 text-wa-subtext text-[15px]">Tanyakan ke Meta AI atau Cari</span>
        </div>
      </div>
      <div class="px-4 py-2 pb-3 flex space-x-2 overflow-x-auto no-scrollbar">
        ${['Semua', 'Belum dibaca', 'Favorit', 'Grup'].map((f, i) => `
          <button onclick="window.__wa_setFilter(${i})" class="px-4 py-1.5 rounded-full text-[14px] font-medium whitespace-nowrap ${i == flt ? 'bg-[#D8FDD2] text-[#0f5132]' : 'bg-[#F5F6F6] text-wa-subtext'}">${f}</button>
        `).join('')}
        <button onclick="window.__wa_newList()" class="px-3 py-1.5 rounded-full bg-[#F5F6F6] text-wa-subtext">${ic('add', 'text-[18px]')}</button>
      </div>
      ${na ? `<div onclick="window.__wa_openArchive()" class="flex items-center px-4 py-3 ab cursor-pointer"><div class="w-[50px] flex justify-center text-wa-subtext">${ic('archive', 'text-[24px]')}</div><h3 class="ml-3.5 flex-1 font-medium text-[16px]">Diarsipkan</h3><span class="text-wa-green text-[12px] font-medium">${na}</span></div>` : ''}
      ${L.length ? L.map(([x, i]) => chatRow(x, i)).join('') : `<div class="text-center text-wa-subtext py-20 px-8 flex flex-col items-center"><div class="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 mb-3">${ic('chat', 'text-[32px]')}</div><p class="text-sm font-medium">Belum ada percakapan</p><p class="text-xs text-gray-400 mt-1">Mulai chat baru dengan menekan tombol pesan di bawah</p></div>`}
      <div class="py-8 text-center text-wa-subtext text-[12px] flex justify-center items-center">${ic('lock', 'text-[14px] mr-1')}Pesan Anda <span class="text-wa-green font-medium ml-1">terenkripsi secara end-to-end</span></div>
    `;
  }
  window.__wa_setFilter = i => { flt = i; render(); };
  window.__wa_newList = () => ask('Daftar baru', '', n => toast('Daftar ' + n + ' dibuat'));

  const ring = (o, i, a) => `
    <div onclick="window.__wa_vs('${a}',${i})" class="flex flex-col items-center space-y-1.5 shrink-0 cursor-pointer">
      <div class="w-[62px] h-[62px] rounded-full p-[2.5px] border-[2.5px] ${o.seen ? 'border-gray-300' : 'border-wa-green'}">${av({ n: o.n }, 52)}</div>
      <span class="text-[13px] font-medium ${o.seen ? 'text-wa-subtext' : ''} max-w-[70px] truncate">${esc(o.n)}</span>
    </div>
  `;

  function updatesTab() {
    return `
      <div class="px-4 py-3"><h2 class="text-[19px] font-medium">Status</h2></div>
      <div class="flex space-x-4 px-4 py-2 overflow-x-auto no-scrollbar">
        <div class="flex flex-col items-center space-y-1.5 shrink-0 cursor-pointer" onclick="${MS.length ? `window.__wa_vs('MS',${MS.length - 1})` : 'window.__wa_stText()'}">
          <div class="relative w-[62px] h-[62px]">${av({ n: me.n }, 62)}<div onclick="event.stopPropagation();window.__wa_stText()" class="absolute bottom-0 right-0 bg-wa-green text-white rounded-full w-6 h-6 flex items-center justify-center border-[2.5px] border-white">${ic('add', 'text-[16px]')}</div></div>
          <span class="text-[13px] font-medium">Status saya</span>
        </div>
        ${ST.map((s, i) => ring(s, i, 'ST')).join('')}
      </div>
      <hr class="mx-4 my-2 border-wa-divider">
      <div class="px-4 py-3 flex justify-between items-center"><h2 class="text-[19px] font-medium">Saluran</h2><span onclick="window.__wa_explore()" class="text-wa-green font-medium text-[14px] cursor-pointer">Jelajahi</span></div>
      ${CH.map((c, i) => c.f ? `
        <div onclick="window.__wa_chPage(${i})" class="flex items-center px-4 py-3 ab cursor-pointer">${av(c)}<div class="ml-3.5 flex-1 min-w-0"><div class="flex justify-between"><h3 class="font-medium text-[16px]">${esc(c.n)}</h3><span class="text-wa-subtext text-[12px]">${c.t || ''}</span></div><p class="text-wa-subtext text-[14px] truncate">${esc(c.p[c.p.length - 1] || '')}</p></div></div>
      ` : '').join('')}
      <div class="py-6 text-center"><button onclick="window.__wa_explore()" class="bg-[#D8FDD2] text-[#0f5132] px-6 py-2 rounded-full text-[14px] font-medium">Cari saluran</button></div>
    `;
  }

  function commTab() {
    return `
      <div onclick="window.__wa_comIntro()" class="flex items-center px-4 py-4 ab cursor-pointer">
        <div class="w-[50px] h-[50px] rounded-xl bg-gray-200 flex items-center justify-center relative text-gray-500">${ic('groups', 'text-[32px]')}<div class="absolute -bottom-1 -right-1 bg-wa-green text-white rounded-full w-[22px] h-[22px] flex items-center justify-center border-2 border-white">${ic('add', 'text-[16px]')}</div></div>
        <h3 class="font-medium text-[16px] ml-3.5">Komunitas baru</h3>
      </div>
      <div class="h-2 bg-[#F5F6F6]"></div>
      ${COM.map(c => `
        <div class="flex items-center px-4 py-3 mt-2"><div class="w-[50px] h-[50px] rounded-xl bg-[#D8FDD2] flex items-center justify-center text-wa-dark">${ic('diversity_3', 'text-[28px]')}</div><h3 class="font-medium text-[16px] ml-3.5">${esc(c.n)}</h3></div>
        <div class="h-2 bg-[#F5F6F6]"></div>
      `).join('')}
    `;
  }

  function callsTab() {
    const fv = ci().filter(([c]) => c.fav);
    return `
      <div onclick="window.__wa_linkSheet()" class="flex items-center px-4 py-3 ab cursor-pointer">
        <div class="w-[46px] h-[46px] rounded-full bg-[#D8FDD2] flex items-center justify-center text-wa-dark">${ic('link', 'text-[24px]')}</div>
        <h3 class="font-medium text-[16px] ml-4">Buat tautan panggilan</h3>
      </div>
      <div class="px-4 py-2">
        <h2 class="text-[16px] font-medium mb-2">Favorit</h2>
        ${fv.map(([c, i]) => `
          <div onclick="window.__wa_callScreen(${i},0)" class="flex items-center py-2 cursor-pointer">${av(c, 46)}<h3 class="ml-4 flex-1 text-[16px]">${esc(c.n)}</h3>${ic('call', 'text-[24px] text-wa-dark')}</div>
        `).join('')}
        <div onclick="window.__wa_pickContact('Tambah ke Favorit', i => { C[i].fav = 1; render(); toast('Ditambahkan ke Favorit'); })" class="flex items-center space-x-4 py-1 cursor-pointer">
          <div class="w-[46px] h-[46px] rounded-full bg-wa-green flex items-center justify-center text-white">${ic('favorite', 'text-[24px]')}</div>
          <h3 class="font-medium text-[16px]">Tambah ke Favorit</h3>
        </div>
      </div>
      <div class="px-4 mt-2 mb-1"><h2 class="text-[16px] font-medium">Terbaru</h2></div>
      ${calls.map(([i, d, w, v]) => `
        <div onclick="window.__wa_callScreen(${i},${v})" class="flex items-center px-4 py-3 ab cursor-pointer">
          ${av(C[i] || { n: 'Kontak' })}
          <div class="ml-3.5 flex-1">
            <h3 class="font-medium text-[16px] ${d == 'in-miss' ? 'text-red-500' : ''}">${esc(C[i] ? C[i].n : 'Panggilan')}</h3>
            <div class="flex items-center text-wa-subtext text-[14px]">
              ${ic(d == 'in-miss' ? 'call_missed' : d == 'in' ? 'call_received' : 'call_made', (d == 'in-miss' ? 'text-red-500' : 'text-wa-green') + ' text-[18px] mr-1')}
              ${w}
            </div>
          </div>
          ${ic(v ? 'videocam' : 'call', 'text-[26px]')}
        </div>
      `).join('') || '<p class="text-center text-wa-subtext py-10">Belum ada riwayat panggilan</p>'}
    `;
  }

  function render() {
    const badge = C.reduce((a, c) => a + (c.u > 0 && !c.a && !c.x ? 1 : 0), 0);
    const body = [chatsTab, updatesTab, commTab, callsTab][tab]();
    const mai = C.findIndex(c => c.ai);
    const ai = mai !== -1 ? `<button onclick="window.__wa_openChat(${mai})" class="absolute right-5 w-[44px] h-[44px] bg-white rounded-[14px] shadow-[0_4px_12px_rgba(0,0,0,.15)] flex items-center justify-center z-20" style="bottom:170px"><svg viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="8.5" fill="none" stroke="url(#g)" stroke-width="2.5"/></svg></button>` : '';
    
    const fabs = [
      ai + fab('chat_add_on', 'window.__wa_openPicker()', 'bottom-24 right-4'),
      `<button onclick="window.__wa_stText()" class="absolute right-5 w-[44px] h-[44px] bg-[#E8F3F1] text-wa-darker rounded-[14px] shadow flex items-center justify-center z-20" style="bottom:170px">${ic('edit', 'text-[22px]')}</button>` + fab('photo_camera', "toast('Buka kamera')", 'bottom-24 right-4'),
      '',
      fab('add_call', "window.__wa_pickContact('Pilih kontak', i => window.__wa_callScreen(i,0))", 'bottom-24 right-4')
    ][tab];

    const H = sel.size ? `
      <header class="h-[60px] flex items-center px-2 shrink-0 bg-white">
        ${ib('arrow_back', 'onclick="window.__wa_clearSel()"')}
        <span class="text-[20px] flex-1 ml-2 font-medium">${sel.size}</span>
        ${['push_pin', 'volume_off', 'archive', 'delete'].map((n, k) => ib(n, `onclick="window.__wa_selAct(${k})"`)).join('')}
        ${ib('more_vert', 'onclick="window.__wa_selMenu()"')}
      </header>
    ` : `
      <header class="h-[60px] flex items-center justify-between px-4 shrink-0">
        <div class="text-wa-green font-semibold text-[24px] tracking-tight">${TITLES[tab]}</div>
        <div class="flex items-center space-x-5 text-[26px]">
          <span onclick="${tab == 0 || tab == 1 ? 'window.__wa_openSearch()' : "toast('Buka kamera')"}" class="material-symbols-rounded active:opacity-50 cursor-pointer">${tab == 0 || tab == 1 ? 'search' : 'photo_camera'}</span>
          ${tab == 0 ? `<span onclick="toast('Buka kamera')" class="material-symbols-rounded active:opacity-50 cursor-pointer">photo_camera</span>` : ''}
          <span onclick="window.__wa_mainMenu()" class="material-symbols-rounded active:opacity-50 cursor-pointer">more_vert</span>
        </div>
      </header>
    `;

    $('#app-clone').innerHTML = `
      ${H}
      <main class="flex-1 overflow-y-auto no-scrollbar pb-24">${body}</main>
      ${fabs}
      <nav class="absolute bottom-0 h-20 w-full bg-white flex items-center justify-around pb-2 px-2 z-30 border-t border-gray-100">
        ${[['chat', 'Chat'], ['data_usage', 'Pembaruan'], ['groups', 'Komunitas'], ['call', 'Panggilan']].map((t, i) => `
          <div onclick="window.__wa_setTab(${i})" class="flex flex-col items-center justify-center w-20 h-full relative cursor-pointer ${i == tab ? '' : 'text-wa-text/70'}">
            <div class="absolute top-2 w-16 h-8 rounded-full ${i == tab ? 'bg-[#D8FDD2]' : ''}"></div>
            ${ic(t[0], 'text-[26px] z-10 mt-1 ' + (i == tab ? 'text-wa-darker' : ''), `font-variation-settings:'FILL' ${i == tab ? 1 : 0},'wght' 300`)}
            <span class="text-[11px] mt-1 z-10 ${i == tab ? 'font-bold' : 'font-medium'}">${t[1]}</span>
            ${i == 0 && badge ? `<div class="absolute top-1 right-3 bg-red-500 text-white text-[10px] font-bold rounded-full border-2 border-white w-[18px] h-[18px] flex items-center justify-center z-20">${badge}</div>` : ''}
            ${i == 1 && ST.some(s => !s.seen) ? '<div class="absolute top-2 right-5 bg-wa-green w-2 h-2 rounded-full border-[1.5px] border-white z-20"></div>' : ''}
          </div>
        `).join('')}
      </nav>
    `;
  }
  window.__wa_setTab = i => { tab = i; sel.clear(); render(); };
  window.__wa_clearSel = () => { sel.clear(); render(); };

  window.__wa_selAct = function (k) {
    const ix = [...sel];
    if (k == 0) {
      const v = !C[ix[0]].pin;
      ix.forEach(i => {
        C[i].pin = v ? 1 : 0;
        if (window.WPP && WPP.chat) WPP.chat.pin(C[i].id, v).catch(() => {});
      });
    } else if (k == 1) {
      const v = !C[ix[0]].mu;
      ix.forEach(i => {
        C[i].mu = v;
        if (window.WPP && WPP.chat) WPP.chat.mute(C[i].id, { expiration: v ? -1 : 0 }).catch(() => {});
      });
    } else if (k == 2) {
      ix.forEach(i => {
        C[i].a = 1;
        if (window.WPP && WPP.chat) WPP.chat.archive(C[i].id, true).catch(() => {});
      });
      toast(ix.length + ' chat diarsipkan');
    } else {
      ix.sort((a, b) => b - a).forEach(i => {
        const item = C.splice(i, 1)[0];
        if (window.WPP && WPP.chat) WPP.chat.delete(item.id).catch(() => {});
      });
      toast('Chat dihapus');
    }
    sel.clear();
    render();
  };

  window.__wa_selMenu = function () {
    menu([
      ['Pilih semua', () => { ci().forEach(([c, i]) => { if (!c.a && !c.h && !c.x) sel.add(i); }); render(); }],
      ['Tandai belum dibaca', () => {
        sel.forEach(i => {
          C[i].u = C[i].u || 1;
          if (window.WPP && WPP.chat) WPP.chat.markIsUnread(C[i].id).catch(() => {});
        });
        sel.clear();
        render();
      }],
      ['Tambahkan pintasan chat', () => toast('Pintasan ditambahkan')],
      ['Blokir', () => {
        sel.forEach(i => {
          C[i].blk = 1;
          if (window.WPP && WPP.blocklist) WPP.blocklist.blockContact(C[i].id).catch(() => {});
        });
        sel.clear();
        render();
        toast('Kontak diblokir');
      }]
    ]);
  };

  window.__wa_mainMenu = function () {
    const m = {
      0: [
        ['Grup baru', () => pickMulti('Grup baru', s => newGroup(s))],
        ['Komunitas baru', comIntro],
        ['Daftar siaran', () => pickMulti('Siaran baru', s => {
          C.unshift({ id: 'broadcast_' + Date.now(), n: 'Siaran (' + s.length + ' penerima)', g: 1, u: 0, l: 'Daftar siaran dibuat', t: now(), m: [] });
          render();
          openChat(0);
        })],
        ['Perangkat tertaut', linked],
        ['Pesan berbintang', starred],
        ['Baca semua', () => {
          C.forEach(c => {
            c.u = 0;
            if (window.WPP && WPP.chat) WPP.chat.markIsRead(c.id).catch(() => {});
          });
          render();
          toast('Semua chat ditandai dibaca');
        }],
        ['Pengaturan', settings]
      ],
      1: [
        ['Buat saluran', () => ask('Nama saluran', '', n => {
          if (window.WPP && WPP.newsletter) WPP.newsletter.create(n, 'Saluran resmi').catch(() => {});
          CH.unshift({ n, ch: 1, t: now(), f: 1, p: ['Saluran dibuat'] });
          render();
        })],
        ['Privasi status', () => dlg('Privasi status', ['Kontak saya', 'Kontak saya kecuali...', 'Hanya bagikan dengan...'], 'Kontak saya', v => toast(v))],
        ['Pengaturan', settings]
      ],
      2: [['Pengaturan', settings]],
      3: [['Hapus riwayat panggilan', () => { calls.length = 0; render(); }], ['Pengaturan', settings]]
    }[tab];
    menu(m);
  };

  /* ============================================================== */
  /* 4. CHAT ROOM & MESSAGE ENGINE                                  */
  /* ============================================================== */
  const BODY = {
    v: m => `<div class="flex items-center gap-2 w-52 py-1">${ic('play_arrow', 'text-[30px] text-gray-500', FI)}<div class="flex-1 h-1 bg-gray-300 rounded"></div><span class="text-[12px] text-wa-subtext">${m.x || '0:15'}</span></div>`,
    img: m => `<div class="w-56 h-40 rounded bg-gradient-to-br from-sky-300 to-indigo-400 flex items-center justify-center text-white overflow-hidden">${m.mediaUrl ? `<img src="${m.mediaUrl}" class="w-full h-full object-cover" />` : ic('image', 'text-[48px]')}</div>`,
    doc: m => `<div class="flex items-center gap-2 bg-black/5 rounded p-2 w-56">${ic('description', 'text-[32px] text-red-500')}<span class="text-[14px] truncate">${esc(m.x || 'Dokumen.pdf')}</span></div>`,
    loc: () => `<div class="w-56 h-28 rounded bg-[#CFE8D5] flex items-center justify-center text-red-500">${ic('location_on', 'text-[44px]', FI)}</div>`,
    ct: m => `<div class="flex items-center gap-2 w-56 py-1">${av({ n: m.x }, 40)}<span>${esc(m.x)}</span></div>`,
    poll: () => `<div class="w-56"><p class="font-medium mb-2">Polling</p>${['Pilihan A', 'Pilihan B'].map(o => `<div class="flex items-center gap-2 py-1 text-[14px]"><div class="w-4 h-4 rounded-full border-2 border-gray-400"></div>${o}</div>`).join('')}</div>`
  };

  const bub = (m, j) => {
    let tick = '';
    if (m.o) {
      if (m.ack === 3 || m.ack === 4) {
        tick = ic('done_all', 'text-[#34B7F1] text-[16px]'); // blue double check
      } else if (m.ack === 2) {
        tick = ic('done_all', 'text-wa-subtext text-[16px]'); // gray double check
      } else if (m.ack === 1) {
        tick = ic('check', 'text-wa-subtext text-[16px]'); // single check
      } else {
        tick = ic('schedule', 'text-wa-subtext text-[14px]'); // clock pending
      }
    }
    return `
      <div data-j="${j}" class="flex ${m.o ? 'justify-end' : ''}">
        <div class="${m.o ? 'bg-wa-bubble rounded-tr-none' : 'bg-white rounded-tl-none'} px-2.5 py-1.5 rounded-lg shadow-sm max-w-[82%]">
          ${m.r ? `<div class="border-l-4 border-wa-green bg-black/5 rounded px-2 py-1 mb-1 text-[13px] text-wa-subtext truncate">${esc(m.r)}</div>` : ''}
          ${(BODY[m.k] || (m => `<p class="text-[15px] leading-snug whitespace-pre-wrap select-text">${esc(m.x)}</p>`))(m)}
          <div class="flex justify-end items-center gap-0.5 text-[11px] text-wa-subtext mt-0.5">
            ${m.s ? ic('star', 'text-[13px]', FI) : ''}
            <span>${m.t}</span>
            ${tick}
          </div>
        </div>
      </div>
    `;
  };

  const ATT = [
    ['description', 'Dokumen', '#7F66FF', { x: 'Laporan.pdf', k: 'doc' }],
    ['photo_camera', 'Kamera', '#FF2E74', { x: '', k: 'img' }],
    ['image', 'Galeri', '#C861F9', { x: '', k: 'img' }],
    ['headphones', 'Audio', '#F96533', { x: '0:42', k: 'v' }],
    ['location_on', 'Lokasi', '#1FA855', { x: '', k: 'loc' }],
    ['person', 'Kontak', '#009DE2', { x: 'Kontak WhatsApp', k: 'ct' }],
    ['poll', 'Poll', '#FFBC38', { x: '', k: 'poll' }]
  ];

  async function openChat(i) {
    const c = C[i];
    if (!c) return;
    c.u = 0;
    c.ty = 0;
    activeChatIndex = i;
    activeChatId = c.id;
    render();

    // Mark as read in real WhatsApp
    if (window.WPP && WPP.chat && c.id) {
      WPP.chat.markIsRead(c.id).catch(() => {});
    }

    let rp = null, q = '', rec = 0;
    const p = page(`
      <header class="h-[60px] flex items-center px-1 bg-white shrink-0 shadow-sm">
        <div onclick="window.__wa_back()" class="flex items-center pl-1 pr-2 h-10 rounded-full active:bg-gray-100 cursor-pointer">
          ${ic('arrow_back', 'text-[24px]')}
          <div class="ml-1">${av(c, 36)}</div>
        </div>
        <div onclick="window.__wa_contactInfo(${i})" class="ml-1 flex-1 min-w-0 cursor-pointer">
          <h1 class="text-[17px] font-medium leading-tight truncate">${esc(c.n)}</h1>
          <p id="st" class="text-[13px] text-wa-subtext">${c.g ? 'ketuk untuk info grup' : c.ai ? 'AI' : 'Online'}</p>
        </div>
        <div class="flex items-center space-x-3 pr-2">
          ${c.g || c.ai ? '' : `
            <span onclick="window.__wa_callScreen(${i},1)" class="material-symbols-rounded cursor-pointer">videocam</span>
            <span onclick="window.__wa_callScreen(${i},0)" class="material-symbols-rounded cursor-pointer">call</span>
          `}
          <span id="mm" class="material-symbols-rounded cursor-pointer">more_vert</span>
        </div>
      </header>
      <div id="sq" class="hidden bg-white px-3 py-2 shadow-sm">
        <input placeholder="Cari di chat..." class="w-full bg-[#F5F6F6] rounded-full px-4 py-2 outline-none text-sm" style="user-select:text">
      </div>
      <div id="ma" class="flex-1 overflow-y-auto p-3 space-y-2 no-scrollbar"></div>
      <div id="rpb"></div>
      <div class="flex items-end px-2 pb-2">
        <div class="flex-1 bg-white rounded-[24px] flex items-end shadow-sm min-h-[48px] py-1 px-1 mr-2">
          <div id="em" class="w-10 h-10 flex items-center justify-center text-wa-subtext cursor-pointer">${ic('mood', 'text-[26px]')}</div>
          <textarea rows="1" placeholder="Pesan" class="flex-1 max-h-[100px] outline-none resize-none py-2.5 text-[16px] bg-transparent no-scrollbar" style="user-select:text"></textarea>
          <div id="at" class="w-10 h-10 flex items-center justify-center text-wa-subtext cursor-pointer">${ic('attach_file', 'text-[24px] -rotate-45')}</div>
          <div id="cm" class="w-10 h-10 flex items-center justify-center text-wa-subtext cursor-pointer">${ic('photo_camera', 'text-[24px]')}</div>
        </div>
        <div id="sb" class="w-12 h-12 bg-wa-green text-white rounded-full flex items-center justify-center shadow-sm cursor-pointer">${ic('mic', 'text-[24px]', FI)}</div>
      </div>
      <div id="ep" class="hidden bg-white h-56 overflow-y-auto p-3 grid grid-cols-8 gap-2 text-[24px] text-center select-none">${EMO.map(e => `<span>${e}</span>`).join('')}</div>
    `, '');

    p.style.background = wp + ' radial-gradient(#0000000d 1.5px,transparent 1.5px) 0 0/18px 18px';

    const ma = $('#ma', p);
    const ta = $('textarea', p);
    const sb = $('#sb', p);
    const st = $('#st', p);

    const draw = () => {
      ma.innerHTML = `
        <div class="flex justify-center"><span class="bg-white text-wa-subtext text-[12px] px-3 py-1 rounded-lg shadow-sm">Hari ini</span></div>
        <div class="flex justify-center"><div class="bg-[#FFEECD] text-wa-subtext text-[12px] px-4 py-2 rounded-lg shadow-sm text-center">${ic('lock', 'text-[14px] align-middle mr-1')}Pesan dan panggilan dienkripsi secara end-to-end.</div></div>
      ` + (c.m || []).map((m, j) => [m, j]).filter(([m]) => !q || (m.x || '').toLowerCase().includes(q)).map(([m, j]) => bub(m, j)).join('');
      ma.scrollTop = ma.scrollHeight;
    };
    window.__wa_current_draw = draw;

    // Fetch real historical messages if empty
    if ((!c.m || c.m.length === 0) && window.WPP && WPP.chat && c.id) {
      try {
        const msgs = await WPP.chat.getMessages(c.id, { count: 40 });
        if (Array.isArray(msgs)) {
          c.m = msgs.map(mapWppMsg);
          draw();
        }
      } catch (err) {
        console.warn('Error fetching messages:', err);
      }
    }
    draw();

    const rpb = () => {
      $('#rpb', p).innerHTML = rp ? `
        <div class="mx-2 mb-1 bg-white rounded-xl px-3 py-2 flex items-center border-l-4 border-wa-green">
          <div class="flex-1 min-w-0">
            <p class="text-wa-dark text-[13px] font-medium">Membalas</p>
            <p class="text-[13px] text-wa-subtext truncate">${esc(rp)}</p>
          </div>
          <span id="rx" class="cursor-pointer">${ic('close', 'text-[20px]')}</span>
        </div>
      ` : '';
      const x = $('#rx', p);
      if (x) x.onclick = () => { rp = null; rpb(); };
    };

    // REAL SENDING ENGINE
    const send = async (m) => {
      if (c.blk) return toast('Kontak diblokir. Buka blokir untuk mengirim pesan');
      m.o = 1;
      m.t = now();
      m.ack = 0; // pending
      if (rp) {
        m.r = rp;
        rp = null;
        rpb();
      }
      c.m = c.m || [];
      c.m.push(m);
      c.l = lab(m);
      c.t = m.t;
      c.ck = 0;
      draw();

      // Transmit to real WhatsApp Web session
      if (window.WPP && WPP.chat && c.id) {
        try {
          const sent = await WPP.chat.sendTextMessage(c.id, m.x);
          m.ack = 1;
          c.ck = 1;
          draw();
        } catch (err) {
          console.error('[Rambox WA Clone] Send message error:', err);
          toast('Gagal mengirim pesan ke WhatsApp');
        }
      }
    };

    ta.oninput = () => {
      sb.innerHTML = ic(ta.value.trim() ? 'send' : 'mic', 'text-[24px]', FI);
      if (window.WPP && WPP.chat && c.id) {
        WPP.chat.markIsComposing(c.id, 2000).catch(() => {});
      }
    };

    sb.onpointerdown = () => {
      if (!ta.value.trim()) {
        rec = Date.now();
        toast('Merekam... lepaskan untuk kirim');
      }
    };

    sb.onpointerup = () => {
      if (rec) {
        const d = (Date.now() - rec) / 1000;
        rec = 0;
        d < 1 ? toast('Tahan untuk merekam pesan suara') : send({ x: '0:' + String(d | 0).padStart(2, '0'), k: 'v' });
      }
    };

    sb.onclick = () => {
      const v = ta.value.trim();
      if (v) {
        send({ x: v });
        ta.value = '';
        ta.oninput();
      }
    };

    $('#em', p).onclick = () => { $('#ep', p).classList.toggle('hidden'); };
    $('#ep', p).onclick = e => {
      if (e.target.tagName === 'SPAN') {
        ta.value += e.target.textContent;
        ta.oninput();
      }
    };

    $('#cm', p).onclick = () => {
      const fi = document.createElement('input');
      fi.type = 'file';
      fi.accept = 'image/*';
      fi.capture = 'environment';
      fi.onchange = e => {
        const file = e.target.files[0];
        if (file) {
          const r = new FileReader();
          r.onload = ev => send({ x: '', k: 'img', mediaUrl: ev.target.result });
          r.readAsDataURL(file);
          if (window.WPP && WPP.chat && c.id) {
            WPP.chat.sendFileMessage(c.id, file).catch(() => {});
          }
        }
      };
      fi.click();
    };

    $('#at', p).onclick = () => {
      const s = sheet(`
        <div class="grid grid-cols-3 gap-y-5 text-center">
          ${ATT.map((a, k) => `
            <div data-t="${k}" class="cursor-pointer">
              <div class="w-14 h-14 mx-auto rounded-full flex items-center justify-center text-white" style="background:${a[2]};pointer-events:none">${ic(a[0], 'text-[26px]')}</div>
              <p class="text-[13px] mt-1.5 text-wa-subtext" style="pointer-events:none">${a[1]}</p>
            </div>
          `).join('')}
        </div>
      `);
      s.onclick = e => {
        const t = e.target.closest('[data-t]');
        if (t) {
          s.remove();
          const selAtt = ATT[t.dataset.t];
          if (selAtt[0] === 'description') {
            const fi = document.createElement('input');
            fi.type = 'file';
            fi.onchange = ev => {
              const file = ev.target.files[0];
              if (file) {
                send({ x: file.name, k: 'doc' });
                if (window.WPP && WPP.chat && c.id) WPP.chat.sendFileMessage(c.id, file).catch(() => {});
              }
            };
            fi.click();
          } else {
            send({ ...selAtt[3] });
          }
        } else if (e.target === s) s.remove();
      };
    };

    // Long press message actions
    let lt;
    p.addEventListener('pointerdown', e => {
      const r = e.target.closest('[data-j]');
      if (!r) return;
      lt = setTimeout(() => {
        const m = c.m[r.dataset.j];
        menu([
          ['Balas', () => { rp = m.x || lab(m); rpb(); ta.focus(); }],
          ['Salin', () => { navigator.clipboard && navigator.clipboard.writeText(m.x || ''); toast('Disalin'); }],
          [m.s ? 'Hapus bintang' : 'Bintangi', () => {
            m.s = !m.s;
            draw();
            if (window.WPP && WPP.chat && m.id) WPP.chat.starMessage(m.id, m.s).catch(() => {});
          }],
          ['Teruskan', () => window.__wa_pickContact('Teruskan ke...', k => {
            C[k].m.push({ ...m, o: 1, t: now() });
            C[k].l = lab(m);
            render();
            if (window.WPP && WPP.chat && m.id && C[k].id) WPP.chat.forwardMessage(C[k].id, m.id).catch(() => {});
            toast('Pesan diteruskan');
          })],
          ['Info', () => toast('Terkirim & dibaca ' + m.t)],
          ['Hapus', () => {
            const deleted = c.m.splice(r.dataset.j, 1)[0];
            draw();
            if (window.WPP && WPP.chat && deleted && deleted.id && c.id) WPP.chat.deleteMessage(c.id, deleted.id, true).catch(() => {});
          }]
        ], 'top-1/3 left-1/2 -translate-x-1/2');
      }, 450);
    });

    ['pointerup', 'pointermove', 'pointercancel'].forEach(ev => p.addEventListener(ev, () => clearTimeout(lt)));

    $('input', $('#sq', p)).oninput = e => {
      q = e.target.value.toLowerCase();
      draw();
    };

    $('#mm', p).onclick = () => menu([
      ['Lihat kontak', () => window.__wa_contactInfo(i)],
      ['Media, tautan, dan dokumen', () => toast('Media, tautan, dan dokumen')],
      ['Cari', () => { $('#sq', p).classList.toggle('hidden'); $('input', $('#sq', p)).focus(); }],
      [c.mu ? 'Aktifkan notifikasi' : 'Bisukan notifikasi', () => {
        c.mu = !c.mu;
        toast(c.mu ? 'Notifikasi dibisukan' : 'Notifikasi aktif');
        if (window.WPP && WPP.chat) WPP.chat.mute(c.id, { expiration: c.mu ? -1 : 0 }).catch(() => {});
        render();
      }],
      ['Wallpaper', () => dlg('Wallpaper', ['Default', 'Hijau', 'Biru', 'Merah muda', 'Abu-abu'], '', v => {
        wp = WP[['Default', 'Hijau', 'Biru', 'Merah muda', 'Abu-abu'].indexOf(v)];
        p.style.background = wp + ' radial-gradient(#0000000d 1.5px,transparent 1.5px) 0 0/18px 18px';
      })],
      [c.a ? 'Keluarkan dari arsip' : 'Arsipkan chat', () => {
        c.a = !c.a;
        if (window.WPP && WPP.chat) WPP.chat.archive(c.id, c.a).catch(() => {});
        render();
        back();
      }],
      [c.blk ? 'Buka blokir' : 'Blokir', () => {
        c.blk = !c.blk;
        toast(c.blk ? 'Kontak diblokir' : 'Blokir dibuka');
        if (window.WPP && WPP.blocklist) {
          c.blk ? WPP.blocklist.blockContact(c.id).catch(() => {}) : WPP.blocklist.unblockContact(c.id).catch(() => {});
        }
      }],
      ['Bersihkan chat', () => {
        c.m = [];
        c.l = '';
        draw();
        render();
        if (window.WPP && WPP.chat) WPP.chat.clear(c.id).catch(() => {});
      }]
    ]);

    // Handle clean close
    const origClose = p.close;
    p.close = () => {
      activeChatId = null;
      activeChatIndex = -1;
      window.__wa_current_draw = null;
      origClose();
    };
  }
  window.__wa_openChat = openChat;

  function contactInfo(i) {
    const c = C[i];
    const mem = contacts().map(x => x[0]);
    page(
      hdr(c.g ? 'Info grup' : 'Info kontak', ib('more_vert', `onclick="menu([['Bagikan',T('Bagikan')],['Ekspor chat',T('Ekspor chat')]])"`)) + `
      <div class="flex-1 overflow-y-auto bg-[#F5F6F6] no-scrollbar">
        <div class="bg-white flex flex-col items-center py-6">
          ${av(c, 110)}
          <h2 class="text-[24px] mt-3 font-semibold">${esc(c.n)}</h2>
          <p class="text-wa-subtext">${c.g ? 'Grup · ' + (mem.length + 1) + ' peserta' : (c.id ? c.id.split('@')[0] : '+62 812-3456-7890')}</p>
          <div class="flex space-x-3 mt-4">
            ${[['call', 'Audio'], ['videocam', 'Video'], ['search', 'Cari']].map(a => `
              <div onclick="toast('${a[1]}')" class="w-24 py-3 border border-gray-200 rounded-xl flex flex-col items-center text-wa-dark cursor-pointer">
                ${ic(a[0], 'text-[24px]')}
                <span class="text-[13px] mt-1">${a[1]}</span>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="bg-white mt-2">${rowUI('Info', 'Sedang di WhatsApp')}</div>
        <div class="bg-white mt-2">
          ${rowUI('Media, tautan, dan dokumen', '12')}
          ${rowUI('Pesan berbintang', (c.m || []).filter(m => m.s).length || 'Tidak ada')}
          ${rowUI('Bisukan notifikasi', '', c.mu ? 1 : 0)}
          ${rowUI('Enkripsi', 'Pesan dienkripsi end-to-end')}
        </div>
      </div>
    `);
  }
  window.__wa_contactInfo = contactInfo;

  /* ============================================================== */
  /* 5. CONTACTS & PICKERS                                         */
  /* ============================================================== */
  const contacts = () => ci().filter(([c]) => !c.g && !c.h && !c.ai);
  const crow = (c, i, a) => `
    <div ${a} class="flex items-center px-4 py-3 ab cursor-pointer">
      ${av(c, 44)}
      <div class="ml-4">
        <h3 class="text-[16px] font-medium">${esc(c.n)}</h3>
        <p class="text-wa-subtext text-[14px]">${esc(c.l || 'Available')}</p>
      </div>
    </div>
  `;

  function pickContact(t, cb) {
    PCB = cb;
    page(hdr(t) + `<div class="flex-1 overflow-y-auto no-scrollbar">${contacts().map(([c, i]) => crow(c, i, `onclick="window.__wa_back();PCB(${i})"`)).join('')}</div>`);
  }
  window.__wa_pickContact = pickContact;

  function openPicker() {
    page(
      hdr('Pilih kontak', ib('search', `onclick="window.__wa_openSearch()"`) + ib('more_vert', `onclick="menu([['Undang teman',T('Undang teman')],['Kontak',T('Kontak')],['Refresh',T('Menyegarkan...')],['Bantuan',T('Bantuan')]])"`), contacts().length + ' kontak') + `
      <div class="flex-1 overflow-y-auto no-scrollbar">
        ${[['groups', 'Grup baru', "pickMulti('Grup baru',s=>newGroup(s))"], ['person_add', 'Kontak baru', "window.__wa_newContact()"], ['diversity_3', 'Komunitas baru', 'window.__wa_comIntro()']].map(a => `
          <div onclick="${a[2]}" class="flex items-center px-4 py-3 ab cursor-pointer">
            <div class="w-11 h-11 rounded-full bg-wa-green text-white flex items-center justify-center">${ic(a[0], 'text-[24px]')}</div>
            <h3 class="ml-4 text-[16px] font-medium">${a[1]}</h3>
          </div>
        `).join('')}
        <p class="px-4 py-3 text-[14px] font-medium text-wa-subtext">Kontak di WhatsApp</p>
        ${contacts().map(([c, i]) => crow(c, i, `onclick="window.__wa_back();window.__wa_openChat(${i})"`)).join('')}
      </div>
    `);
  }
  window.__wa_openPicker = openPicker;

  function newContact() {
    const p = page(hdr('Kontak baru') + `
      <div class="p-6 space-y-6">
        <input placeholder="Nama" class="w-full border-b-2 border-wa-green outline-none py-2 text-[16px]" style="user-select:text">
        <input placeholder="Nomor telepon" inputmode="tel" class="w-full border-b-2 border-gray-300 outline-none py-2 text-[16px]" style="user-select:text">
      </div>
      ${fab('check')}
    `);
    $('button', p).onclick = () => {
      const n = $('input', p).value.trim();
      if (!n) return toast('Isi nama kontak');
      C.push({ id: 'contact_' + Date.now(), n, u: 0, l: '', t: '', m: [] });
      p.close();
      render();
      toast('Kontak disimpan');
    };
  }
  window.__wa_newContact = newContact;

  function pickMulti(t, cb) {
    const sel2 = new Set();
    const p = page(hdr(t, ib('search', `onclick="toast('Cari kontak')"`), '0 dari ' + contacts().length + ' dipilih') + `
      <div class="flex-1 overflow-y-auto no-scrollbar pb-24">
        ${contacts().map(([c, i]) => `
          <div data-i="${i}" class="flex items-center px-4 py-3 ab cursor-pointer">
            <div class="relative">${av(c, 44)}<div class="ck hidden absolute -bottom-1 -right-1 w-5 h-5 bg-wa-green rounded-full border-2 border-white text-white items-center justify-center">${ic('check', 'text-[14px]')}</div></div>
            <div class="ml-4"><h3 class="text-[16px] font-medium">${esc(c.n)}</h3><p class="text-wa-subtext text-[14px]">Available</p></div>
          </div>
        `).join('')}
      </div>
      ${fab('arrow_forward')}
    `);
    p.onclick = e => {
      const r = e.target.closest('[data-i]');
      if (r) {
        const i = +r.dataset.i;
        sel2.has(i) ? sel2.delete(i) : sel2.add(i);
        const k = $('.ck', r);
        k.classList.toggle('hidden', !sel2.has(i));
        k.classList.toggle('flex', sel2.has(i));
        $('header p', p).textContent = sel2.size + ' dari ' + contacts().length + ' dipilih';
      } else if (e.target.closest('button')) {
        sel2.size ? cb([...sel2]) : toast('Pilih minimal 1 peserta');
      }
    };
  }

  function newGroup(s) {
    const p = page(hdr('Grup baru', '', 'Beri nama grup') + `
      <div class="p-6 flex items-center space-x-4">
        <div class="w-14 h-14 rounded-full bg-[#F0F2F5] flex items-center justify-center text-wa-subtext">${ic('photo_camera', 'text-[26px]')}</div>
        <input placeholder="Ketik subjek grup di sini" class="flex-1 border-b-2 border-wa-green outline-none py-2 text-[16px]" style="user-select:text">
      </div>
      <p class="px-6 text-[13px] text-wa-subtext">Peserta: ${s.length}</p>
      ${fab('check')}
    `);
    $('button', p).onclick = () => {
      const n = $('input', p).value.trim();
      if (!n) return toast('Isi subjek grup');
      C.unshift({ id: 'group_' + Date.now(), n, g: 1, u: 0, l: 'Anda membuat grup ini', t: now(), m: [] });
      p.close();
      back();
      back();
      render();
      openChat(0);
    };
  }

  function openSearch() {
    const p = page(`
      <header class="h-[60px] flex items-center px-2 bg-white shadow-sm shrink-0">
        ${ib('arrow_back', 'onclick="window.__wa_back()"')}
        <input id="si" placeholder="Cari..." class="flex-1 outline-none text-[17px] ml-2" style="user-select:text">
      </header>
      <div class="flex gap-2 px-4 py-2 overflow-x-auto no-scrollbar">
        ${['Foto', 'Video', 'Tautan', 'GIF', 'Audio', 'Dokumen', 'Poll'].map(x => `
          <span onclick="toast('${x}')" class="px-4 py-1.5 rounded-full bg-[#F5F6F6] text-wa-subtext text-[14px] cursor-pointer">${x}</span>
        `).join('')}
      </div>
      <div id="sr" class="flex-1 overflow-y-auto no-scrollbar"></div>
    `);
    const f = () => {
      const q = $('#si', p).value.toLowerCase();
      const L = ci().filter(([c]) => !c.h && !c.x && (c.n + ' ' + (c.l || '')).toLowerCase().includes(q));
      $('#sr', p).innerHTML = L.length ? L.map(([c, i]) => `
        <div onclick="window.__wa_openChat(${i})" class="flex items-center px-4 py-3 ab cursor-pointer">
          ${av(c, 44)}
          <div class="ml-4 min-w-0">
            <h3 class="text-[16px] font-medium">${esc(c.n)}</h3>
            <p class="text-wa-subtext text-[14px] truncate">${esc(c.l)}</p>
          </div>
        </div>
      `).join('') : '<p class="text-center text-wa-subtext py-16">Tidak ada hasil</p>';
    };
    $('#si', p).oninput = f;
    f();
    $('#si', p).focus();
  }
  window.__wa_openSearch = openSearch;

  function openArchive() {
    page(hdr('Diarsipkan') + `
      <div class="flex-1 overflow-y-auto no-scrollbar">
        ${ci().map(([c, i]) => c.a ? chatRow(c, i) : '').join('') || '<p class="text-center text-wa-subtext py-16">Tidak ada chat diarsipkan</p>'}
      </div>
    `);
  }
  window.__wa_openArchive = openArchive;

  /* ============================================================== */
  /* 6. STATUS, CHANNELS, COMMUNITIES & CALLS SCREENS               */
  /* ============================================================== */
  function comIntro() {
    const p = page(hdr('Komunitas baru') + `
      <div class="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <div class="w-32 h-32 rounded-3xl bg-[#D8FDD2] flex items-center justify-center text-wa-dark">${ic('diversity_3', 'text-[72px]')}</div>
        <h2 class="text-[22px] mt-6 font-semibold">Satukan anggota dalam komunitas</h2>
        <p class="text-wa-subtext mt-2 text-[15px]">Buat komunitas baru untuk mengelola grup dan mengirim pengumuman.</p>
      </div>
      <div class="p-6">
        <button class="w-full bg-wa-green text-white py-3 rounded-full font-medium">Mulai komunitas Anda</button>
      </div>
    `);
    $('button', p).onclick = () => ask('Nama komunitas', '', n => {
      COM.push({ n });
      p.close();
      tab = 2;
      render();
    });
  }
  window.__wa_comIntro = comIntro;

  function vs(a, i) {
    const o = G[a][i];
    if (!o) return;
    o.seen = 1;
    render();
    const n = o.n || me.n;
    const p = page(`
      <div class="absolute top-3 left-3 right-3 h-[3px] bg-white/30 rounded z-10"><div class="pb h-full bg-white rounded"></div></div>
      <div class="absolute top-6 left-3 right-3 flex items-center text-white z-10">
        ${av({ n }, 40)}
        <div class="ml-3 flex-1"><p class="font-medium">${esc(o.n || 'Status saya')}</p><p class="text-[12px] opacity-80">Hari ini, ${o.t || now()}</p></div>
        ${ic('more_vert')}
      </div>
      <div class="flex-1 flex items-center justify-center px-8 text-center text-white text-[26px] font-medium" style="background:${o.bg}">${esc(o.txt)}</div>
      <div class="p-3 bg-black/70 text-white/80 flex items-center gap-2">
        <input placeholder="Balas" class="flex-1 bg-transparent outline-none text-white placeholder-white/60" style="user-select:text">
        ${ic('send')}
      </div>
    `, 'bg-black');
    $('.pb', p).onanimationend = () => p.isConnected && p.close();
    p.onclick = e => { if (!e.target.closest('input')) p.close(); };
  }
  window.__wa_vs = vs;

  function stText() {
    let b = 0;
    const p = page(`
      <div class="flex items-center px-3 h-[60px] text-white z-10">
        ${ib('close', 'onclick="window.__wa_back()"')}
        <div class="flex-1"></div>
        ${ib('mood')}
        ${ib('palette', 'id="pl"')}
      </div>
      <div class="flex-1 flex items-center justify-center px-8">
        <textarea placeholder="Ketik status" class="w-full bg-transparent text-white text-[28px] text-center outline-none resize-none placeholder-white/60" rows="4" style="user-select:text"></textarea>
      </div>
      ${fab('send')}
    `, '');
    const ap = () => p.style.background = BGS[b];
    ap();
    $('#pl', p).onclick = () => { b = (b + 1) % BGS.length; ap(); };
    $('button', p).onclick = () => {
      const v = $('textarea', p).value.trim();
      if (!v) return toast('Ketik status terlebih dahulu');
      MS.push({ txt: v, bg: BGS[b] });
      p.close();
      render();
      if (window.WPP && WPP.status) WPP.status.sendTextStatus(v, { backgroundColor: BGS[b] }).catch(() => {});
      toast('Status diperbarui');
    };
  }
  window.__wa_stText = stText;

  function chPage(i) {
    const c = CH[i];
    if (!c) return;
    const p = page(`
      <header class="h-[60px] flex items-center px-1 bg-white shrink-0 shadow-sm">
        ${ib('arrow_back', 'onclick="window.__wa_back()"')}
        ${av(c, 36)}
        <div class="ml-2 flex-1 min-w-0"><h1 class="text-[17px] font-medium leading-tight truncate">${esc(c.n)}</h1><p class="text-[13px] text-wa-subtext">${(i + 1) * 12}rb pengikut</p></div>
        ${ib('more_vert', `onclick="menu([['Bagikan',T('Tautan disalin')],['Laporkan',T('Dilaporkan')]])"`)}
      </header>
      <div class="flex-1 overflow-y-auto p-3 space-y-2">
        ${c.p.map(x => `
          <div class="bg-white rounded-lg shadow-sm px-3 py-2 max-w-[85%]"><p class="text-[15px]">${esc(x)}</p><p class="text-[11px] text-wa-subtext text-right">${c.t || 'Hari ini'}</p></div>
        `).join('')}
      </div>
      <div class="p-3 bg-white text-center">
        <button class="px-8 py-2 rounded-full ${c.f ? 'bg-[#F5F6F6] text-wa-subtext' : 'bg-wa-green text-white'} font-medium">${c.f ? 'Mengikuti' : 'Ikuti'}</button>
      </div>
    `, 'cbg');
    $('button', p).onclick = e => {
      c.f = c.f ? 0 : 1;
      e.target.textContent = c.f ? 'Mengikuti' : 'Ikuti';
      e.target.className = `px-8 py-2 rounded-full ${c.f ? 'bg-[#F5F6F6] text-wa-subtext' : 'bg-wa-green text-white'} font-medium`;
      render();
    };
  }
  window.__wa_chPage = chPage;

  function explore() {
    const p = page(hdr('Jelajahi saluran', ib('search', `onclick="toast('Cari saluran')"`)) + `<div class="flex-1 overflow-y-auto no-scrollbar"></div>`);
    const f = () => {
      $('div.flex-1', p).innerHTML = CH.map((c, i) => `
        <div class="flex items-center px-4 py-3 ab">
          ${av(c)}
          <div onclick="window.__wa_chPage(${i})" class="ml-3.5 flex-1 min-w-0 cursor-pointer">
            <h3 class="text-[16px] font-medium truncate">${esc(c.n)}</h3>
            <p class="text-[13px] text-wa-subtext">${(i + 1) * 12}rb pengikut</p>
          </div>
          <button data-i="${i}" class="px-4 py-1.5 rounded-full text-[14px] font-medium ${c.f ? 'bg-[#F5F6F6] text-wa-subtext' : 'bg-[#D8FDD2] text-[#0f5132]'}">${c.f ? 'Mengikuti' : 'Ikuti'}</button>
        </div>
      `).join('');
    };
    f();
    p.onclick = e => {
      const b = e.target.closest('button');
      if (b) {
        CH[b.dataset.i].f ^= 1;
        f();
        render();
      }
    };
  }
  window.__wa_explore = explore;

  function linkSheet() {
    const s = sheet(`
      <h3 class="text-[19px] mb-3 font-medium">Tautan panggilan</h3>
      <p class="text-wa-subtext mb-4">Bagikan tautan agar siapa pun bisa bergabung ke panggilan.</p>
      <div class="bg-[#F5F6F6] rounded-xl p-3 text-wa-dark select-all font-mono text-sm">call.whatsapp.com/video/x7Kq29Zp</div>
      <button class="w-full mt-4 bg-wa-green text-white py-3 rounded-full font-medium">Salin tautan</button>
    `);
    $('button', s).onclick = () => {
      s.remove();
      toast('Tautan disalin');
    };
  }
  window.__wa_linkSheet = linkSheet;

  function callScreen(i, v) {
    const c = C[i] || { n: 'Kontak WhatsApp' };
    let s = 0;
    const p = page(`
      <div class="flex-1 flex flex-col items-center pt-24 text-white">
        <p class="text-[24px] font-medium">${esc(c.n)}</p>
        <p id="cs" class="opacity-70 mt-1">Memanggil...</p>
        <div class="mt-10">${av(c, 140)}</div>
      </div>
      <div class="mx-4 mb-8 bg-[#1F2C34] rounded-3xl p-5 flex justify-around text-white">
        ${['videocam', 'volume_up', 'mic_off'].map(b => `
          <div onclick="this.classList.toggle('bg-white');this.classList.toggle('text-black')" class="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center cursor-pointer ${b == 'videocam' && v ? 'bg-white text-black' : ''}">
            ${ic(b, 'text-[26px]')}
          </div>
        `).join('')}
        <div id="end" class="w-14 h-14 rounded-full bg-red-500 flex items-center justify-center cursor-pointer">${ic('call_end', 'text-[26px]')}</div>
      </div>
    `, 'bg-[#0B141A]');
    $('#end', p).onclick = () => p.close();
    setTimeout(() => {
      const t = setInterval(() => {
        if (!p.isConnected) return clearInterval(t);
        s++;
        $('#cs', p).textContent = String((s / 60) | 0).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
      }, 1000);
    }, 2000);
  }
  window.__wa_callScreen = callScreen;

  /* ============================================================== */
  /* 7. SETTINGS & PROFILE SCREENS                                  */
  /* ============================================================== */
  const O = {
    pv: ['Semua orang', 'Kontak saya', 'Tidak ada'],
    sz: ['Kecil', 'Sedang', 'Besar'],
    th: ['Sistem default', 'Terang', 'Gelap'],
    dm: ['Nonaktif', '24 jam', '7 hari', '90 hari'],
    dl: ['Tanpa media', 'Foto', 'Audio', 'Video', 'Semua media'],
    tn: ['Nada default', 'Note', 'Pop', 'Chime'],
    lk: ['Nonaktif', 'Segera', 'Setelah 1 menit', 'Setelah 30 menit']
  };

  const S = {
    'Langganan': [['Meta Verified', 'Dapatkan lencana terverifikasi'], ['WhatsApp Business', 'Kelola bisnis Anda']],
    'Akun': [['Passkey', 'Masuk dengan sidik jari'], ['Alamat email', 'Tambah email'], ['Verifikasi dua langkah', 'Nonaktif', null], ['Ganti nomor'], ['Minta info akun'], ['Hapus akun']],
    'Privasi': [['Terakhir dilihat dan online', 'Semua orang', , O.pv], ['Foto profil', 'Kontak saya', , O.pv], ['Info', 'Semua orang', , O.pv], ['Status', 'Kontak saya', , O.pv], ['Tanda dibaca', 'Nonaktif berarti Anda tidak mengirim/menerima tanda dibaca', 1], ['Pesan sementara', 'Nonaktif', , O.dm], ['Grup', 'Semua orang', , O.pv], ['Panggilan', 'Bisukan penelepon tak dikenal', 0], ['Kunci aplikasi', 'Nonaktif', , O.lk], ['Akun diblokir', '0 kontak']],
    'Daftar': [['Daftar baru'], ['Semua', 'Semua chat'], ['Belum dibaca'], ['Favorit'], ['Grup']],
    'Chat': [['Tema', 'Sistem default', , O.th], ['Wallpaper'], ['Tampilkan media di galeri', '', 1], ['Enter untuk kirim', '', 0], ['Ukuran font', 'Sedang', , O.sz], ['Cadangan chat', 'Google Drive'], ['Pindahkan chat'], ['Riwayat chat'], ['Tetap arsipkan chat', '', 1]],
    'Tampilan': [['Tema aplikasi', 'Sistem default', , O.th], ['Ikon aplikasi', 'Default'], ['Tema obrolan'], ['Warna obrolan']],
    'Siaran': [['Daftar siaran baru'], ['Kirim siaran']],
    'Notifikasi': [['Nada percakapan', '', 1], ['Pesan', 'Nada default', , O.tn], ['Getar', 'Default'], ['Notifikasi popup', 'Selalu'], ['Grup', 'Nada default', , O.tn], ['Panggilan', 'Nada dering default', , O.tn], ['Pengingat', '', 1]],
    'Penyimpanan dan data': [['Kelola penyimpanan', '1,2 GB'], ['Penggunaan jaringan', '3,4 GB terkirim'], ['Kurangi data panggilan', '', 0], ['Kualitas unggah media', 'Standar', , ['Standar', 'HD']], ['Unduh otomatis data seluler', 'Foto', , O.dl], ['Unduh otomatis Wi-Fi', 'Semua media', , O.dl], ['Unduh otomatis roaming', 'Tanpa media', , O.dl]],
    'Kontrol orang tua': [['Atur kontrol orang tua', 'Tautkan akun anak']],
    'Aksesibilitas': [['Tingkatkan kontras', '', 0], ['Animasi', '', 1], ['Ukuran font', 'Sedang', , O.sz]],
    'Bahasa Aplikasi': [['Bahasa Indonesia', 'Bahasa perangkat'], ['English'], ['Melayu'], ['Jawa'], ['العربية']],
    'Bantuan dan masukan': [['Pusat Bantuan'], ['Hubungi kami'], ['Kebijakan Privasi'], ['Info aplikasi', 'Versi Rambox WA 2.25.20']],
    'Pusat Akun': [['Facebook'], ['Instagram'], ['Kata sandi dan keamanan']]
  };

  const L = k => S[k].map((r, j) => `
    <div onclick="window.__wa_rw('${k}',${j})" class="flex items-center px-5 py-3.5 ab cursor-pointer">
      <div class="flex-1 pr-3"><h3 class="text-[16px]">${r[0]}</h3>${r[1] ? `<p class="text-[13px] text-wa-subtext mt-[1px]">${r[1]}</p>` : ''}</div>
      ${r[2] != null ? `<div class="tg ${r[2] ? 'on' : ''}"></div>` : ''}
    </div>
  `).join('');

  window.__wa_rw = function (k, j) {
    const r = S[k][j];
    const p = $('#pages').lastElementChild;
    const rf = () => $('#sl', p).innerHTML = L(k);
    if (r[2] != null) {
      r[2] = r[2] ? 0 : 1;
      rf();
    } else if (r[3]) {
      dlg(r[0], r[3], r[1], v => { r[1] = v; rf(); });
    } else {
      toast(r[0]);
    }
  };

  function sub(k) {
    page(hdr(k) + `<div id="sl" class="flex-1 overflow-y-auto no-scrollbar">${L(k)}</div>`);
  }

  function profile() {
    page(hdr('Profil') + `
      <div class="flex-1 overflow-y-auto">
        <div class="flex justify-center py-8 relative">
          ${av({ n: me.n, avatar: me.avatar }, 140)}
          <div class="absolute bottom-6 right-[calc(50%-70px)] w-11 h-11 bg-wa-green text-white rounded-full flex items-center justify-center cursor-pointer shadow-md">${ic('photo_camera')}</div>
        </div>
        ${[['person', 'Nama', me.n, 'n'], ['info', 'Info', me.a, 'a']].map(a => `
          <div onclick="ask('${a[1]}',me.${a[3]},v=>{me.${a[3]}=v;back();profile();if(window.WPP&&WPP.profile){a[3]=='n'?WPP.profile.setMyProfileName(v).catch(()=>{}) : WPP.profile.setMyStatus(v).catch(()=>{})}})" class="flex items-center px-5 py-3 ab cursor-pointer">
            <div class="w-[40px] text-gray-500">${ic(a[0])}</div>
            <div class="flex-1"><p class="text-[13px] text-wa-subtext">${a[1]}</p><p class="text-[16px] font-medium">${esc(a[2])}</p></div>
            ${ic('edit', 'text-wa-dark')}
          </div>
        `).join('')}
        <div class="flex items-center px-5 py-3">
          <div class="w-[40px] text-gray-500">${ic('call')}</div>
          <div><p class="text-[13px] text-wa-subtext">Telepon</p><p class="text-[16px] font-medium">${esc(me.phone || '+62 812-3456-7890')}</p></div>
        </div>
      </div>
    `);
  }

  function settings() {
    const it = [
      ['workspace_premium', 'Langganan', 'Jelajahi keuntungan premium'],
      ['devices', 'Perangkat tertaut', 'Gunakan WhatsApp di perangkat lain'],
      ['vpn_key', 'Akun', 'Notifikasi keamanan, ganti nomor'],
      ['lock', 'Privasi', 'Akun diblokir, pesan sementara'],
      ['contacts', 'Daftar', 'Kelola orang dan grup'],
      ['chat', 'Chat', 'Riwayat obrolan, cadangan'],
      ['palette', 'Tampilan', 'Tema obrolan, ikon aplikasi'],
      ['campaign', 'Siaran', 'Kelola daftar dan kirim siaran'],
      ['notifications', 'Notifikasi', 'Pesan, grup & nada dering'],
      ['data_usage', 'Penyimpanan dan data', 'Penggunaan jaringan, unduh otomatis'],
      ['health_and_safety', 'Kontrol orang tua', 'Pengaturan untuk keluarga Anda'],
      ['accessibility_new', 'Aksesibilitas', 'Tingkatkan kontras, animasi'],
      ['language', 'Bahasa Aplikasi', 'Bahasa Indonesia (bahasa perangkat)'],
      ['help_outline', 'Bantuan dan masukan', 'Pusat Bantuan, hubungi kami'],
      ['group_add', 'Undang teman', ''],
      ['all_inclusive', 'Pusat Akun', 'Kendalikan pengalaman Anda di WhatsApp, Facebook, Instagram']
    ];
    const p = page(`
      <header class="h-[60px] flex items-center px-1 bg-white shrink-0">
        ${ib('arrow_back', 'onclick="window.__wa_back()"')}
        <div class="flex-1"></div>
        ${ib('search', `onclick="toast('Cari pengaturan')"`)}
        ${ib('qr_code_scanner', `onclick="toast('Kode QR saya')"`)}
        ${ib('edit', 'data-p="1"')}
      </header>
      <div class="flex-1 overflow-y-auto no-scrollbar">
        <div data-p="1" class="flex flex-col items-center pb-6 cursor-pointer">
          ${av({ n: me.n, avatar: me.avatar }, 85)}
          <h2 id="sn" class="text-[24px] mt-3 font-semibold">${esc(me.n)}</h2>
          <p id="sa" class="text-wa-subtext text-[14px]">${esc(me.a)}</p>
        </div>
        ${it.map(a => `
          <div data-k="${a[1]}" class="flex items-center px-5 py-3.5 ab cursor-pointer">
            <div class="w-[36px] shrink-0 text-gray-600">${ic(a[0], 'text-[22px]')}</div>
            <div class="flex-1"><h3 class="text-[16px] ${a[1] == 'Pusat Akun' ? 'font-medium' : ''}">${a[1]}</h3>${a[2] ? `<p class="text-wa-subtext text-[13px]">${a[2]}</p>` : ''}</div>
          </div>
        `).join('')}
        <div class="text-center text-wa-subtext text-[13px] py-8">from<br><b class="text-wa-text tracking-widest">∞ Meta</b></div>
      </div>
    `);
    p.onclick = e => {
      if (e.target.closest('[data-p]')) return profile();
      const r = e.target.closest('[data-k]');
      if (!r) return;
      const k = r.dataset.k;
      k == 'Perangkat tertaut' ? linked() : S[k] ? sub(k) : toast(k);
    };
  }

  function linked() {
    const p = page(hdr('Perangkat tertaut') + `
      <div class="flex-1 overflow-y-auto bg-[#F5F6F6] no-scrollbar">
        <div class="bg-white flex flex-col items-center py-8 px-4">
          <div class="w-28 h-28 rounded-full bg-[#D8FDD2]/60 flex items-center justify-center text-wa-dark">${ic('laptop_mac', 'text-[64px]')}</div>
          <h2 class="text-[20px] text-center mt-4 font-semibold">Gunakan WhatsApp di Web, Desktop, dan perangkat lainnya</h2>
          <button id="logout-btn" class="mt-6 w-full max-w-[320px] bg-red-500 text-white py-2.5 rounded-full font-medium shadow active:scale-95 transition-transform">Keluar dari Sesi Ini</button>
        </div>
        <p class="px-5 pt-4 pb-2 text-[14px] text-wa-subtext font-medium">Status sesi</p>
        <div class="bg-white">
          ${rowUI('Rambox Mobile Client', 'Aktif sekarang')}
        </div>
      </div>
    `);
    $('#logout-btn', p).onclick = () => {
      if (window.confirm('Yakin ingin keluar dari WhatsApp Web?')) {
        if (window.WPP && WPP.conn) WPP.conn.logout().catch(() => {});
        location.reload();
      }
    };
  }

  function starred() {
    const L = [];
    C.forEach(c => (c.m || []).forEach(m => m.s && L.push([c, m])));
    page(
      hdr('Pesan berbintang', ib('search', `onclick="toast('Cari')"`)) +
      (L.length ? `
        <div class="flex-1 overflow-y-auto no-scrollbar bg-[#F5F6F6]">
          ${L.map(([c, m]) => `
            <div class="bg-white mt-1 px-4 py-3">
              <p class="text-[13px] text-wa-dark font-medium">${esc(c.n)}</p>
              <p class="text-[15px]">${esc(lab(m))}</p>
              <p class="text-[12px] text-wa-subtext text-right">${m.t}</p>
            </div>
          `).join('')}
        </div>
      ` : `
        <div class="flex-1 flex flex-col items-center justify-center px-10 text-center pb-20">
          <div class="w-[140px] h-[140px] rounded-full bg-[#EAEBEE] flex items-center justify-center text-wa-subtext">${ic('star', 'text-[72px]', FI)}</div>
          <p class="text-wa-subtext text-[15px] mt-6">Ketuk dan tahan pesan di chat mana pun untuk membintanginya, sehingga Anda dapat menemukannya dengan mudah di lain waktu.</p>
        </div>
      `)
    );
  }

  /* ============================================================== */
  /* 8. QR CODE & LINKING SCREEN                                    */
  /* ============================================================== */
  function renderQrScreen() {
    document.body.classList.remove('wa-clone-active');
    document.body.classList.add('wa-clone-qr');

    $('#app-clone').innerHTML = `
      <div class="w-full h-full flex flex-col bg-white overflow-y-auto no-scrollbar">
        <!-- Header -->
        <div class="bg-[#008069] text-white p-5 flex items-center shadow-md">
          <div class="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center mr-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.81 13.47 3.81 11.91C3.81 7.37 7.5 3.67 12.05 3.67Z"/>
            </svg>
          </div>
          <div>
            <h1 class="text-xl font-bold">Tautkan WhatsApp</h1>
            <p class="text-xs text-white/80">Rambox Mobile Client</p>
          </div>
        </div>

        <!-- Instructions -->
        <div class="p-6 flex-1 flex flex-col items-center">
          <h2 class="text-lg font-semibold text-gray-800 text-center mb-4">Gunakan WhatsApp di Rambox</h2>
          <div class="w-full bg-[#f0f2f5] rounded-2xl p-4 mb-6 text-sm text-gray-700 space-y-2.5">
            <div class="flex items-start"><span class="w-5 h-5 rounded-full bg-wa-green text-white text-xs font-bold flex items-center justify-center mr-2.5 shrink-0 mt-0.5">1</span><span>Buka aplikasi <b>WhatsApp</b> di ponsel Anda.</span></div>
            <div class="flex items-start"><span class="w-5 h-5 rounded-full bg-wa-green text-white text-xs font-bold flex items-center justify-center mr-2.5 shrink-0 mt-0.5">2</span><span>Ketuk <b>Menu ⋮</b> atau <b>Pengaturan</b> lalu pilih <b>Perangkat tertaut</b>.</span></div>
            <div class="flex items-start"><span class="w-5 h-5 rounded-full bg-wa-green text-white text-xs font-bold flex items-center justify-center mr-2.5 shrink-0 mt-0.5">3</span><span>Ketuk <b>Tautkan Perangkat</b> lalu arahkan kamera ke kode QR berikut:</span></div>
          </div>

          <!-- QR Canvas Viewport -->
          <div id="wa-qr-box" class="relative w-64 h-64 border-4 border-wa-green/30 rounded-2xl p-2 flex items-center justify-center bg-white shadow-xl">
            <div id="qr-loading-spinner" class="flex flex-col items-center space-y-3">
              <div class="w-8 h-8 border-3 border-wa-green/30 border-t-wa-green rounded-full animate-spin"></div>
              <p class="text-xs text-wa-subtext">Menyiapkan kode QR...</p>
            </div>
            <div id="qr-canvas-holder" class="w-full h-full flex items-center justify-center"></div>
          </div>

          <!-- Alternative: Phone number pairing -->
          <div class="mt-6 w-full text-center">
            <button onclick="window.__wa_togglePhonePairing()" class="text-wa-dark font-medium text-sm hover:underline py-2">
              Tautkan dengan nomor telepon
            </button>
          </div>

          <div id="phone-pairing-box" class="hidden mt-4 w-full bg-[#f0f2f5] p-4 rounded-2xl">
            <p class="text-xs text-gray-600 mb-2">Masukkan nomor HP lengkap (contoh: 628123456789):</p>
            <div class="flex space-x-2">
              <input id="pair-phone-input" type="tel" placeholder="628xxxxxxxx" class="flex-1 bg-white px-3 py-2 rounded-xl text-sm border border-gray-300 outline-none" style="user-select:text">
              <button onclick="window.__wa_requestPairingCode()" class="bg-wa-green text-white px-4 py-2 rounded-xl text-sm font-semibold">Kirim</button>
            </div>
            <div id="pairing-code-display" class="hidden mt-4 text-center">
              <p class="text-xs text-gray-500 mb-1">Masukkan kode ini di HP Anda:</p>
              <div id="pairing-code-value" class="text-2xl font-mono font-bold tracking-widest text-wa-darker py-2 bg-white rounded-xl border border-wa-green"></div>
            </div>
          </div>
        </div>

        <div class="p-4 text-center text-xs text-wa-subtext">
          Pesan Anda dienkripsi secara end-to-end oleh WhatsApp resmi.
        </div>
      </div>
    `;

    pollQrCanvas();
  }

  function displayQrCode(dataUrl) {
    if (!document.body.classList.contains('wa-clone-qr')) {
      renderQrScreen();
    }
    const holder = document.getElementById('qr-canvas-holder');
    const spinner = document.getElementById('qr-loading-spinner');
    if (spinner) spinner.style.display = 'none';
    if (holder) {
      holder.innerHTML = `<img src="${dataUrl}" alt="WhatsApp QR Code" class="w-full h-full object-contain rounded-xl select-none" />`;
    }
  }

  window.__wa_togglePhonePairing = function () {
    const box = document.getElementById('phone-pairing-box');
    if (box) box.classList.toggle('hidden');
  };

  window.__wa_requestPairingCode = async function () {
    const input = document.getElementById('pair-phone-input');
    const display = document.getElementById('pairing-code-display');
    const valElem = document.getElementById('pairing-code-value');
    if (!input || !input.value.trim()) return toast('Masukkan nomor telepon');
    
    const phone = input.value.trim().replace(/[^0-9]/g, '');
    toast('Meminta kode pairing...');
    
    try {
      const code = await WPP.conn.genLinkDeviceCodeForPhoneNumber(phone);
      if (code && display && valElem) {
        valElem.textContent = code;
        display.classList.remove('hidden');
      } else {
        toast('Gagal mendapatkan kode pairing. Gunakan kode QR.');
      }
    } catch (err) {
      console.error('Pairing code error:', err);
      toast('Gagal mendapatkan kode pairing. Gunakan kode QR.');
    }
  };

  function pollQrCanvas() {
    sendBridgeCmd('GET_STATUS').catch(() => {});
  }

  /* ============================================================== */
  /* 9. WPP REAL DATA SYNCHRONIZATION                               */
  /* ============================================================== */
  function mapWppMsg(m) {
    let kind = null;
    const t = m.type || '';
    if (t === 'image') kind = 'img';
    else if (t === 'audio' || t === 'ptt') kind = 'v';
    else if (t === 'document') kind = 'doc';
    else if (t === 'location') kind = 'loc';
    else if (t === 'vcard' || t === 'multi_vcard') kind = 'ct';
    else if (t === 'poll_creation') kind = 'poll';

    let quotedText = null;
    if (m.quotedMsg) {
      quotedText = m.quotedMsg.body || m.quotedMsg.caption || '';
    }

    return {
      id: m.id?._serialized || m.id,
      x: m.body || m.caption || (kind === 'img' ? 'Foto' : kind === 'doc' ? (m.filename || 'Dokumen') : ''),
      o: m.fromMe ? 1 : 0,
      t: formatWaTime(m.t, true),
      k: kind,
      s: m.star ? 1 : 0,
      r: quotedText,
      ack: m.ack || (m.fromMe ? 1 : 0),
      mediaUrl: m.mediaData?.preview?.url || null
    };
  }

  async function syncProfile() {
    if (!window.WPP || !WPP.profile) return;
    try {
      const myp = await WPP.profile.getMyProfile();
      if (myp) {
        me.n = myp.name || myp.pushname || me.n;
        me.a = myp.status || me.a;
        if (myp.id?.user) me.phone = '+' + myp.id.user;
      }
      const myPic = await WPP.profile.getMyProfilePic();
      if (myPic) me.avatar = myPic;
    } catch (e) {
      console.warn('Sync profile error:', e);
    }
  }

  async function syncChats() {
    if (!window.WPP || !WPP.chat) return;
    try {
      const rawList = await WPP.chat.list();
      if (!Array.isArray(rawList)) return;

      C = rawList.map(c => {
        const id = c.id?._serialized || c.id || '';
        const isGroup = !!c.isGroup;
        const name = c.name || c.formattedTitle || (c.contact && (c.contact.pushname || c.contact.name)) || id.split('@')[0] || 'Kontak';

        let lastMsgText = '';
        if (c.previewMessage) {
          lastMsgText = typeof c.previewMessage === 'string' ? c.previewMessage : (c.previewMessage.body || c.previewMessage.caption || '');
        } else if (c.msgs && c.msgs.length > 0) {
          const lastM = c.msgs[c.msgs.length - 1];
          lastMsgText = lastM.body || lastM.caption || '';
        }

        const rawTime = c.t || (c.timestamp ? Math.floor(c.timestamp / 1000) : 0);
        const timeStr = formatWaTime(rawTime);

        const existing = C.find(x => x.id === id);
        return {
          id,
          n: name,
          t: timeStr,
          rawTime,
          l: lastMsgText || '',
          ty: 0,
          u: c.unreadCount || 0,
          pin: c.isPinned ? 1 : 0,
          mu: c.isMuted ? 1 : 0,
          fav: existing ? existing.fav : 0,
          g: isGroup ? 1 : 0,
          a: c.archive ? 1 : 0,
          ck: 1,
          avatar: (c.contact && c.contact.profilePicThumb && c.contact.profilePicThumb.eurl) || '',
          m: existing ? existing.m : []
        };
      });

      render();
    } catch (err) {
      console.warn('Sync chats error:', err);
    }
  }

  async function syncStatuses() {
    if (!window.WPP || !WPP.status) return;
    try {
      const raw = await WPP.status.getStatuses();
      if (Array.isArray(raw)) {
        ST = raw.map(s => ({
          n: s.contact?.name || s.contact?.pushname || s.id?.user || 'Kontak',
          txt: s.msgs?.[0]?.caption || s.msgs?.[0]?.body || 'Status baru',
          bg: 'linear-gradient(135deg,#128C7E,#075E54)',
          t: formatWaTime(s.msgs?.[0]?.t || Date.now() / 1000),
          seen: 0
        }));
        if (tab === 1) render();
      }
    } catch (e) {}
  }

  async function syncCommunities() {
    if (!window.WPP || !WPP.community) return;
    try {
      const comms = await WPP.community.list();
      if (Array.isArray(comms) && comms.length > 0) {
        COM = comms.map(c => ({
          id: c.id._serialized || c.id,
          n: c.name || c.formattedTitle || 'Komunitas'
        }));
        if (tab === 2) render();
      }
    } catch (e) {}
  }

  async function syncChannels() {
    if (!window.WPP || !WPP.newsletter) return;
    try {
      const list = await WPP.newsletter.list();
      if (Array.isArray(list) && list.length > 0) {
        CH = list.map(c => ({
          id: c.id._serialized || c.id,
          n: c.name || 'Saluran',
          t: '',
          f: 1,
          p: [c.description || 'Saluran resmi']
        }));
        if (tab === 1) render();
      }
    } catch (e) {}
  }

  async function syncCalls() {
    if (!window.WPP || !WPP.call) return;
    try {
      const rawCalls = await WPP.call.getCalls();
      if (Array.isArray(rawCalls) && rawCalls.length > 0) {
        calls = rawCalls.slice(0, 30).map(cl => {
          const peer = cl.peerJid?._serialized || cl.peerJid;
          let chatIdx = C.findIndex(x => x.id === peer);
          if (chatIdx === -1) chatIdx = 0;
          const direction = cl.outgoing ? 'out' : cl.isVideo ? 'in' : 'in-miss';
          return [chatIdx, direction, formatWaTime(cl.time), cl.isVideo ? 1 : 0];
        });
        if (tab === 3) render();
      }
    } catch (e) {}
  }

  function handleIncomingMessage(msg) {
    const chatId = msg.chatId?._serialized || msg.chatId || (msg.fromMe ? msg.to : msg.from);
    if (!chatId) return;

    const mapped = mapWppMsg(msg);
    const chat = C.find(x => x.id === chatId);
    if (chat) {
      chat.l = mapped.x || lab(mapped);
      chat.t = mapped.t;
      chat.rawTime = msg.t || Math.floor(Date.now() / 1000);
      chat.m = chat.m || [];
      if (activeChatId === chatId) {
        chat.m.push(mapped);
        if (typeof window.__wa_current_draw === 'function') window.__wa_current_draw();
        if (window.WPP && WPP.chat) WPP.chat.markIsRead(chatId).catch(() => {});
      } else {
        chat.u = (chat.u || 0) + 1;
      }
    } else {
      syncChats();
      return;
    }

    C.sort((a, b) => (b.pin || 0) - (a.pin || 0) || (b.rawTime || 0) - (a.rawTime || 0));
    render();
  }

  function handleMessageAck(ackData) {
    if (!ackData || !ackData.id) return;
    const msgId = ackData.id._serialized || ackData.id;
    const ack = ackData.ack;

    for (const c of C) {
      if (c.m) {
        const found = c.m.find(m => m.id === msgId);
        if (found) {
          found.ack = ack;
          if (activeChatId === c.id && window.__wa_current_draw) {
            window.__wa_current_draw();
          }
          break;
        }
      }
    }
  }

  function startAuthenticatedApp() {
    console.log('[Rambox WA Clone] Starting Authenticated WhatsApp Mobile App...');
    document.body.classList.remove('wa-clone-qr');
    document.body.classList.add('wa-clone-active');

    // Initial render
    render();

    // Sync all live data
    syncProfile();
    syncChats();
    syncStatuses();
    syncCommunities();
    syncChannels();
    syncCalls();

    // Listen to real-time events from WA-JS
    if (window.WPP) {
      try {
        WPP.on('chat.new_message', handleIncomingMessage);
        WPP.on('chat.msg_ack', handleMessageAck);
        WPP.on('conn.logout', () => {
          renderQrScreen();
        });
      } catch (e) {
        console.warn('WPP event listener error:', e);
      }
    }
  }

  /* ============================================================== */
  /* 10. SYSTEM INITIALIZATION & POLLING                            */
  /* ============================================================== */
  function initEngine() {
    ensureRoot();

    // Attach row long-press event safely
    const appClone = $('#app-clone');
    if (appClone && !appClone._eventsAttached) {
      appClone._eventsAttached = true;
      let ltRow;
      appClone.addEventListener('pointerdown', e => {
        lpf = 0;
        const r = e.target.closest('[data-c]');
        if (!r || tab != 0) return;
        ltRow = setTimeout(() => {
          lpf = 1;
          sel.add(+r.dataset.c);
          render();
        }, 450);
      });
      ['pointerup', 'pointermove', 'pointercancel'].forEach(ev => appClone.addEventListener(ev, () => clearTimeout(ltRow)));
    }

    const splash = `
      <div id="wa-splash" class="w-full h-full flex flex-col items-center justify-between p-8 bg-white text-wa-text select-none">
        <div class="flex-1 flex flex-col items-center justify-center">
          <div class="w-20 h-20 rounded-3xl bg-[#25D366] flex items-center justify-center text-white shadow-xl mb-4">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.81 13.47 3.81 11.91C3.81 7.37 7.5 3.67 12.05 3.67Z"/>
            </svg>
          </div>
          <h1 class="text-2xl font-bold text-gray-800 tracking-tight">WhatsApp</h1>
          <div class="mt-6 flex items-center space-x-2.5 text-sm text-wa-subtext">
            <div class="w-4 h-4 border-2 border-wa-green border-t-transparent rounded-full animate-spin"></div>
            <span>Menghubungkan ke WhatsApp...</span>
          </div>
        </div>
        <div class="text-center text-xs text-wa-subtext">
          from <b class="tracking-widest text-black">META</b>
        </div>
      </div>
    `;
    if ($('#app-clone')) $('#app-clone').innerHTML = splash;

    // Check status via bridge
    let authChecked = false;
    let pollCount = 0;
    const interval = setInterval(async () => {
      pollCount++;
      try {
        const st = await sendBridgeCmd('GET_STATUS');
        if (st && st.isAuthenticated) {
          clearInterval(interval);
          authChecked = true;
          isWaAuthenticated = true;
          startAuthenticatedApp();
          return;
        }
      } catch (e) {}

      // Fallback: If not authenticated after 4 seconds, show QR screen
      if (pollCount > 8 && !authChecked) {
        clearInterval(interval);
        authChecked = true;
        renderQrScreen();
      }
    }, 500);
  }

  // Start engine when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEngine);
  } else {
    initEngine();
  }
})();
