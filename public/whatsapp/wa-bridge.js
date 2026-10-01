/**
 * Rambox Mobile WhatsApp Session Bridge
 * Injected into web.whatsapp.com background session iframe.
 * Relays authentication, chat list, messages, and commands
 * to and from the foreground WhatsApp Mobile Clone UI.
 */
(function () {
  'use strict';

  if (window.__RAMBOX_WA_BRIDGE_INJECTED__) return;
  window.__RAMBOX_WA_BRIDGE_INJECTED__ = true;

  console.log('[WA Bridge] Background WhatsApp Web session bridge started.');

  // Always use the real parent window (even if window.parent was tampered)
  function getParentWindow() {
    try {
      if (window.__rb_parent && window.__rb_parent !== window) return window.__rb_parent;
      if (window.parent && window.parent !== window) return window.parent;
    } catch (e) {}
    return null;
  }

  function postToParent(type, payload) {
    const parentWin = getParentWindow();
    if (!parentWin) return;
    try {
      parentWin.postMessage({ type: type || 'WA_BRIDGE', ...payload }, '*');
    } catch (err) {
      console.warn('[WA Bridge] postToParent failed:', err);
    }
  }

  // Safe JSON cleaners to prevent DataCloneError across postMessage
  function cleanChat(c) {
    if (!c) return null;
    try {
      const id = c.id?._serialized || (typeof c.id === 'string' ? c.id : (c.id?.user ? c.id.user + '@c.us' : ''));
      const isGroup = !!c.isGroup;
      const name = c.name || c.formattedTitle || (c.contact && (c.contact.pushname || c.contact.name)) || id.split('@')[0] || 'Kontak';
      let preview = '';
      if (typeof c.previewMessage === 'string') {
        preview = c.previewMessage;
      } else if (c.previewMessage && typeof c.previewMessage === 'object') {
        preview = c.previewMessage.body || c.previewMessage.caption || '';
      } else if (c.msgs && c.msgs.length > 0) {
        const lastM = c.msgs[c.msgs.length - 1];
        preview = lastM.body || lastM.caption || '';
      }

      const timestamp = c.t || (c.timestamp ? Math.floor(c.timestamp / 1000) : 0);
      const avatar = (c.contact && c.contact.profilePicThumb && c.contact.profilePicThumb.eurl) || '';

      return {
        id,
        name,
        isGroup,
        unreadCount: c.unreadCount || 0,
        isPinned: !!c.isPinned,
        isMuted: !!c.isMuted,
        archive: !!c.archive,
        timestamp,
        previewMessage: preview,
        avatar
      };
    } catch (e) {
      return null;
    }
  }

  function cleanMsg(m) {
    if (!m) return null;
    try {
      const id = m.id?._serialized || (typeof m.id === 'string' ? m.id : '');
      const from = m.from?._serialized || m.from || '';
      const to = m.to?._serialized || m.to || '';
      const body = m.body || m.caption || '';
      const fromMe = !!m.fromMe;
      const type = m.type || 'chat';
      const t = m.t || Math.floor(Date.now() / 1000);
      const ack = typeof m.ack === 'number' ? m.ack : (fromMe ? 1 : 0);

      let quoted = null;
      if (m.quotedMsg) {
        quoted = {
          body: m.quotedMsg.body || m.quotedMsg.caption || ''
        };
      }

      return {
        id,
        from,
        to,
        fromMe,
        type,
        body,
        caption: m.caption || '',
        t,
        ack,
        star: !!m.star,
        filename: m.filename || '',
        quotedMsg: quoted
      };
    } catch (e) {
      return null;
    }
  }

  // -------------------------------------------------------------
  // Bridge Command Handlers (called when parent sends WA_BRIDGE_CMD)
  // -------------------------------------------------------------
  async function handleCommand(cmd, args) {
    if (!window.WPP) {
      throw new Error('WPP engine not ready yet');
    }

    switch (cmd) {
      case 'GET_STATUS': {
        const isAuth = !!(WPP.conn && WPP.conn.isAuthenticated && WPP.conn.isAuthenticated());
        return { isAuthenticated: isAuth };
      }

      case 'GET_MY_PROFILE': {
        if (!WPP.profile) return null;
        const prof = await WPP.profile.getMyProfile();
        return {
          name: prof?.name || prof?.pushname || 'Saya',
          status: prof?.status || 'Ada',
          phone: prof?.id?.user ? '+' + prof.id.user : ''
        };
      }

      case 'GET_MY_PIC': {
        if (!WPP.profile) return null;
        try {
          return await WPP.profile.getMyProfilePic();
        } catch (e) {
          return null;
        }
      }

      case 'GET_CHATS': {
        if (!WPP.chat) return [];
        const raw = await WPP.chat.list();
        if (!Array.isArray(raw)) return [];
        return raw.map(cleanChat).filter(Boolean);
      }

      case 'GET_MESSAGES': {
        if (!WPP.chat || !args.chatId) return [];
        const rawMsgs = await WPP.chat.getMessages(args.chatId, { count: args.count || 50 });
        if (!Array.isArray(rawMsgs)) return [];
        return rawMsgs.map(cleanMsg).filter(Boolean);
      }

      case 'SEND_TEXT': {
        if (!WPP.chat || !args.chatId || !args.text) {
          throw new Error('Invalid send arguments');
        }
        const sent = await WPP.chat.sendTextMessage(args.chatId, args.text);
        return {
          id: sent?.id?._serialized || sent?.id,
          ack: sent?.ack || 1
        };
      }

      case 'MARK_READ': {
        if (WPP.chat && args.chatId) {
          await WPP.chat.markIsRead(args.chatId);
        }
        return { ok: true };
      }

      case 'MARK_COMPOSING': {
        if (WPP.chat && args.chatId) {
          await WPP.chat.markIsComposing(args.chatId, args.duration || 2000);
        }
        return { ok: true };
      }

      case 'PAIRING_CODE': {
        if (!WPP.conn || !WPP.conn.genLinkDeviceCodeForPhoneNumber) {
          throw new Error('Pairing code generation not supported');
        }
        const code = await WPP.conn.genLinkDeviceCodeForPhoneNumber(args.phone);
        return { code };
      }

      case 'LOGOUT': {
        if (WPP.conn && WPP.conn.logout) {
          await WPP.conn.logout();
        }
        return { ok: true };
      }

      case 'GET_STATUSES': {
        if (!WPP.status) return [];
        try {
          const raw = await WPP.status.getStatuses();
          if (!Array.isArray(raw)) return [];
          return raw.map(s => ({
            id: s.id?._serialized || s.id,
            name: s.name || (s.contact && (s.contact.pushname || s.contact.name)) || 'Status',
            avatar: (s.contact && s.contact.profilePicThumb && s.contact.profilePicThumb.eurl) || '',
            total: (s.msgs && s.msgs.length) || 1,
            time: s.t ? Math.floor(s.t) : 0
          }));
        } catch (e) {
          return [];
        }
      }

      case 'GET_COMMUNITIES': {
        if (!WPP.community) return [];
        try {
          const comms = await WPP.community.list();
          if (!Array.isArray(comms)) return [];
          return comms.map(c => ({
            id: c.id?._serialized || c.id,
            name: c.name || c.subject || 'Komunitas',
            desc: c.desc || '',
            avatar: (c.contact && c.contact.profilePicThumb && c.contact.profilePicThumb.eurl) || ''
          }));
        } catch (e) {
          return [];
        }
      }

      case 'GET_NEWSLETTERS': {
        if (!WPP.newsletter) return [];
        try {
          const list = await WPP.newsletter.list();
          if (!Array.isArray(list)) return [];
          return list.map(c => ({
            id: c.id?._serialized || c.id,
            name: c.name || 'Saluran',
            desc: c.description || '',
            subscribers: c.subscribersCount || 0,
            avatar: c.picture?.url || ''
          }));
        } catch (e) {
          return [];
        }
      }

      case 'GET_CALLS': {
        if (!WPP.call) return [];
        try {
          const calls = await WPP.call.getCalls();
          if (!Array.isArray(calls)) return [];
          return calls.slice(0, 30).map(cl => ({
            id: cl.id,
            name: (cl.peerJid && cl.peerJid.user) || 'Panggilan',
            isVideo: !!cl.isVideo,
            isIncoming: !!cl.isIncoming,
            time: cl.time ? Math.floor(cl.time / 1000) : 0
          }));
        } catch (e) {
          return [];
        }
      }

      default:
        throw new Error('Unknown bridge command: ' + cmd);
    }
  }

  // Listen to command messages from the parent Mobile Clone window
  window.addEventListener('message', async (event) => {
    if (!event.data || event.data.type !== 'WA_BRIDGE_CMD') return;
    const { cmdId, cmd, args } = event.data;

    try {
      const result = await handleCommand(cmd, args || {});
      postToParent('WA_BRIDGE_RESP', { cmdId, success: true, result });
    } catch (err) {
      console.warn(`[WA Bridge] Command ${cmd} failed:`, err);
      postToParent('WA_BRIDGE_RESP', { cmdId, success: false, error: err.message || String(err) });
    }
  });

  // -------------------------------------------------------------
  // QR Code & Session Monitor
  // -------------------------------------------------------------
  let lastQrDataUrl = null;
  let qrPollTimer = null;
  let authAnnounced = false;

  function pollQrCanvas() {
    try {
      // Find WhatsApp Web canvas element
      const waCanvas = document.querySelector('div[data-ref] canvas') ||
                       document.querySelector('canvas[aria-label]') ||
                       document.querySelector('canvas');
      if (waCanvas && waCanvas.width > 0) {
        const dataUrl = waCanvas.toDataURL('image/png');
        if (dataUrl && dataUrl !== lastQrDataUrl) {
          lastQrDataUrl = dataUrl;
          console.log('[WA Bridge] New QR Code detected, relaying to mobile clone UI...');
          postToParent('WA_BRIDGE', { action: 'QR_DATA_URL', dataUrl });
        }
      }
    } catch (err) {
      // Canvas might be tainted or not rendered yet
    }
  }

  function setupRealtimeListeners() {
    if (!window.WPP) return;

    try {
      WPP.on('chat.new_message', (rawMsg) => {
        const clean = cleanMsg(rawMsg);
        if (clean) {
          postToParent('WA_BRIDGE', { action: 'NEW_MSG', msg: clean });
        }
      });

      WPP.on('chat.msg_ack', (ackData) => {
        postToParent('WA_BRIDGE', {
          action: 'MSG_ACK',
          ack: {
            id: ackData?.id?._serialized || ackData?.id,
            ack: ackData?.ack
          }
        });
      });

      WPP.on('conn.logout', () => {
        authAnnounced = false;
        postToParent('WA_BRIDGE', { action: 'LOGOUT' });
        startPollingForAuth();
      });

      WPP.on('conn.authenticated', () => {
        announceAuth();
      });

      WPP.on('conn.qrcode_updated', () => {
        setTimeout(pollQrCanvas, 300);
      });
    } catch (e) {
      console.warn('[WA Bridge] Error registering WPP events:', e);
    }
  }

  function announceAuth() {
    if (authAnnounced) return;
    authAnnounced = true;
    if (qrPollTimer) {
      clearInterval(qrPollTimer);
      qrPollTimer = null;
    }
    console.log('[WA Bridge] Authenticated successfully, notifying parent!');
    postToParent('WA_BRIDGE', { action: 'AUTH_SUCCESS' });
  }

  function startPollingForAuth() {
    if (qrPollTimer) clearInterval(qrPollTimer);
    qrPollTimer = setInterval(() => {
      if (window.WPP && WPP.conn && WPP.conn.isAuthenticated && WPP.conn.isAuthenticated()) {
        announceAuth();
        return;
      }
      pollQrCanvas();
    }, 1000);
  }

  // -------------------------------------------------------------
  // Main Entry: Wait for WPP and Webpack
  // -------------------------------------------------------------
  let initPollCount = 0;
  const initInterval = setInterval(() => {
    initPollCount++;

    // Continuously check for QR canvas even before WPP is ready
    pollQrCanvas();

    if (window.WPP && WPP.webpack) {
      clearInterval(initInterval);
      console.log('[WA Bridge] WPP webpack detected. Waiting for onReady...');

      WPP.webpack.onReady(() => {
        console.log('[WA Bridge] WPP webpack onReady triggered.');
        setupRealtimeListeners();

        if (WPP.conn && WPP.conn.isAuthenticated && WPP.conn.isAuthenticated()) {
          announceAuth();
        } else {
          postToParent('WA_BRIDGE', { action: 'NEED_AUTH' });
          startPollingForAuth();
        }
      });
    } else if (initPollCount > 60) {
      // 30 seconds passed without WPP
      clearInterval(initInterval);
      console.warn('[WA Bridge] WPP initialization timeout, maintaining DOM canvas polling.');
      startPollingForAuth();
    }
  }, 500);

  // Send initial ping to parent
  postToParent('WA_BRIDGE', { action: 'BRIDGE_INIT' });
})();
