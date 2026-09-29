package com.rambox.mobile;

import android.app.Dialog;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Message;
import android.util.Log;
import android.util.TypedValue;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Environment;
import android.webkit.JavascriptInterface;
import androidx.core.content.FileProvider;
import java.io.File;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.BridgeWebViewClient;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "RamboxMainActivity";

    // Desktop Chrome UA: Necessary for WhatsApp Web to render the QR code / web interface without mobile redirection
    private static final String DESKTOP_CHROME_UA =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

    // Mobile Chrome UA for OAuth and other mobile-first services
    private static final String CLEAN_CHROME_MOBILE_UA =
        "Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";

    // Remote GitHub Pages live URL for 100% automated OTA updates without APK installation
    private static final String GITHUB_PAGES_URL = "https://emailkudeweta.github.io/rambox-mobile";

    private final OkHttpClient httpClient = new OkHttpClient.Builder()
        .followRedirects(true)
        .followSslRedirects(true)
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(25, TimeUnit.SECONDS)
        .build();

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebView webView = getBridge().getWebView();
        if (webView == null) return;

        WebSettings settings = webView.getSettings();

        // 1. Set Desktop Chrome UA as default for WhatsApp Web compatibility
        settings.setUserAgentString(DESKTOP_CHROME_UA);

        // 2. Enable modern HTML5, DOM Storage, Databases, and multi-window popups
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

        // 3. Configure Cookies (Must accept third-party cookies for embedded service iframes)
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        // 4. Attach enhanced WebChromeClient for Google OAuth popups and hardware permissions
        webView.setWebChromeClient(new RamboxWebChromeClient(getBridge()));

        // 5. Attach enhanced WebViewClient for X-Frame-Options stripping and Anti-Framebusting
        webView.setWebViewClient(new RamboxWebViewClient(getBridge()));

        // 6. Register Auto-Updater JavaScript Bridge
        webView.addJavascriptInterface(new RamboxAppUpdaterInterface(), "RamboxUpdater");

        Log.d(TAG, "Rambox Mobile WebEngine initialized successfully.");
    }

    /**
     * Native Auto-Updater Bridge:
     * - Uses Android DownloadManager to download APK from GitHub Releases.
     * - Displays system progress notification.
     * - Triggers Android Package Installer intent upon completion.
     */
    public class RamboxAppUpdaterInterface {
        @JavascriptInterface
        public void startApkDownload(String apkUrl, String versionName) {
            runOnUiThread(() -> {
                try {
                    DownloadManager.Request request = new DownloadManager.Request(Uri.parse(apkUrl));
                    request.setTitle("Mengunduh Rambox Mobile");
                    request.setDescription("Versi " + versionName);
                    request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);

                    File destDir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    if (destDir != null && !destDir.exists()) {
                        destDir.mkdirs();
                    }
                    File destFile = new File(destDir, "Rambox-Update-" + versionName + ".apk");
                    if (destFile.exists()) {
                        destFile.delete();
                    }
                    request.setDestinationUri(Uri.fromFile(destFile));
                    request.setMimeType("application/vnd.android.package-archive");

                    DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                    if (dm != null) {
                        long downloadId = dm.enqueue(request);

                        BroadcastReceiver receiver = new BroadcastReceiver() {
                            @Override
                            public void onReceive(Context context, Intent intent) {
                                long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                                if (id == downloadId) {
                                    try {
                                        unregisterReceiver(this);
                                    } catch (Exception ignored) {}

                                    try {
                                        Uri apkUri = FileProvider.getUriForFile(
                                            MainActivity.this,
                                            getApplicationContext().getPackageName() + ".fileprovider",
                                            destFile
                                        );
                                        Intent install = new Intent(Intent.ACTION_VIEW);
                                        install.setDataAndType(apkUri, "application/vnd.android.package-archive");
                                        install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                                        startActivity(install);
                                    } catch (Exception e) {
                                        Log.e(TAG, "Error installing downloaded APK", e);
                                    }
                                }
                            }
                        };

                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            registerReceiver(receiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), Context.RECEIVER_EXPORTED);
                        } else {
                            registerReceiver(receiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE));
                        }
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Error starting APK download", e);
                    try {
                        Intent browserIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(apkUrl));
                        startActivity(browserIntent);
                    } catch (Exception ignored) {}
                }
            });
        }

        @JavascriptInterface
        public void clearAppData() {
            runOnUiThread(() -> {
                try {
                    WebView wv = getBridge().getWebView();
                    if (wv != null) {
                        wv.clearCache(true);
                        wv.clearHistory();
                        wv.clearFormData();
                    }
                    CookieManager.getInstance().removeAllCookies(null);
                    CookieManager.getInstance().flush();
                    WebStorage.getInstance().deleteAllData();
                    Log.d(TAG, "Application data cleared successfully via Native Bridge.");
                } catch (Exception e) {
                    Log.e(TAG, "Error clearing app data", e);
                }
            });
        }
    }

    /**
     * Enhanced WebChromeClient:
     * - Handles 'window.open' (Google OAuth and popup logins) via native floating dialog.
     * - Auto-grants Camera and Microphone permissions for QR scanning and voice/video calls.
     */
    private class RamboxWebChromeClient extends BridgeWebChromeClient {

        public RamboxWebChromeClient(Bridge bridge) {
            super(bridge);
        }

        @Override
        public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
            Log.d(TAG, "onCreateWindow requested for OAuth / popup");

            final Dialog dialog = new Dialog(MainActivity.this, android.R.style.Theme_DeviceDefault_Light_NoActionBar_Fullscreen);

            LinearLayout layout = new LinearLayout(MainActivity.this);
            layout.setOrientation(LinearLayout.VERTICAL);
            layout.setBackgroundColor(Color.parseColor("#12121e"));

            // Top Header Bar
            LinearLayout header = new LinearLayout(MainActivity.this);
            header.setOrientation(LinearLayout.HORIZONTAL);
            header.setPadding(32, 24, 32, 24);
            header.setBackgroundColor(Color.parseColor("#1c1c2e"));

            TextView titleView = new TextView(MainActivity.this);
            titleView.setText("Autentikasi Akun / Google OAuth");
            titleView.setTextColor(Color.WHITE);
            titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
            titleView.setLayoutParams(new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.0f));
            header.addView(titleView);

            Button closeBtn = new Button(MainActivity.this);
            closeBtn.setText("Tutup ✕");
            closeBtn.setTextColor(Color.parseColor("#ef4444"));
            closeBtn.setBackgroundColor(Color.TRANSPARENT);
            closeBtn.setOnClickListener(v -> dialog.dismiss());
            header.addView(closeBtn);

            layout.addView(header);

            // Popup WebView
            WebView popupWebView = new WebView(MainActivity.this);
            popupWebView.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

            WebSettings pSettings = popupWebView.getSettings();
            pSettings.setJavaScriptEnabled(true);
            pSettings.setDomStorageEnabled(true);
            pSettings.setDatabaseEnabled(true);
            pSettings.setUserAgentString(CLEAN_CHROME_MOBILE_UA);
            pSettings.setSupportMultipleWindows(true);
            pSettings.setJavaScriptCanOpenWindowsAutomatically(true);

            CookieManager.getInstance().setAcceptCookie(true);
            CookieManager.getInstance().setAcceptThirdPartyCookies(popupWebView, true);

            popupWebView.setWebChromeClient(new WebChromeClient() {
                @Override
                public void onCloseWindow(WebView window) {
                    dialog.dismiss();
                }
            });

            popupWebView.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                    return false;
                }

                @Override
                public void onPageFinished(WebView v, String url) {
                    super.onPageFinished(v, url);
                    CookieManager.getInstance().flush();
                }
            });

            dialog.setOnDismissListener(d -> {
                popupWebView.destroy();
                CookieManager.getInstance().flush();
            });

            layout.addView(popupWebView);
            dialog.setContentView(layout);
            dialog.show();

            WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
            transport.setWebView(popupWebView);
            resultMsg.sendToTarget();
            return true;
        }

        @Override
        public void onPermissionRequest(final PermissionRequest request) {
            // Auto-grant Camera and Audio Capture for WhatsApp Web QR scanner and calls
            runOnUiThread(() -> {
                try {
                    request.grant(request.getResources());
                } catch (Exception e) {
                    super.onPermissionRequest(request);
                }
            });
        }

        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
            callback.invoke(origin, true, false);
        }
    }

    /**
     * Enhanced WebViewClient:
     * - Strips X-Frame-Options and Content-Security-Policy: frame-ancestors.
     * - Neutralizes window.top !== window.self frame-busting.
     * - Injects viewport and touch scrolling.
     */
    private class RamboxWebViewClient extends BridgeWebViewClient {

        public RamboxWebViewClient(Bridge bridge) {
            super(bridge);
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (uri == null) {
                return super.shouldInterceptRequest(view, request);
            }

            String host = uri.getHost();
            String scheme = uri.getScheme();

            // 1. Delegate local Capacitor asset requests
            if (host == null || host.equals("localhost") || host.equals("127.0.0.1") || "capacitor".equalsIgnoreCase(scheme)) {
                return super.shouldInterceptRequest(view, request);
            }

            // 2. Only handle HTTP / HTTPS
            if (!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme)) {
                return super.shouldInterceptRequest(view, request);
            }

            // Determine if request is an HTML document navigation
            Map<String, String> reqHeaders = request.getRequestHeaders();
            String accept = reqHeaders != null ? reqHeaders.get("Accept") : null;
            if (accept == null && reqHeaders != null) {
                accept = reqHeaders.get("accept");
            }
            boolean isHtmlRequest = accept != null && accept.contains("text/html");
            boolean isRoot = uri.getPath() == null || uri.getPath().isEmpty() || uri.getPath().equals("/");
            boolean isGet = "GET".equalsIgnoreCase(request.getMethod());

            boolean isDocument = isGet && (isHtmlRequest || isRoot);

            // ONLY intercept HTML document navigations!
            // Subresources (JS, CSS, WASM, WebWorkers, WebSockets, Images) MUST be handled natively
            // by Chromium to ensure full performance, proper caching, and persistent WebSocket streams.
            if (!isDocument) {
                return super.shouldInterceptRequest(view, request);
            }

            try {
                // Fetch upstream document using OkHttp
                Request.Builder reqBuilder = new Request.Builder()
                    .url(uri.toString())
                    .get();

                if (reqHeaders != null) {
                    for (Map.Entry<String, String> entry : reqHeaders.entrySet()) {
                        String k = entry.getKey();
                        String lowerK = k.toLowerCase(Locale.ROOT);
                        // Filter out iframe-specific Sec-Fetch and localhost headers that cause upstream HTTP 400
                        if (!lowerK.equals("host") &&
                            !lowerK.equals("accept-encoding") &&
                            !lowerK.equals("sec-fetch-site") &&
                            !lowerK.equals("sec-fetch-mode") &&
                            !lowerK.equals("sec-fetch-dest") &&
                            !lowerK.equals("sec-fetch-user") &&
                            !lowerK.equals("origin") &&
                            !lowerK.equals("referer")) {
                            reqBuilder.addHeader(k, entry.getValue());
                        }
                    }
                }

                boolean isWhatsApp = host != null && host.contains("whatsapp.com");

                // Headers customized per service type
                if (isWhatsApp) {
                    reqBuilder.header("User-Agent", DESKTOP_CHROME_UA);
                    reqBuilder.header("Sec-Fetch-Site", "none");
                    reqBuilder.header("Sec-Fetch-Mode", "navigate");
                    reqBuilder.header("Sec-Fetch-Dest", "document");
                    reqBuilder.header("Sec-Fetch-User", "?1");
                    reqBuilder.header("Upgrade-Insecure-Requests", "1");
                    reqBuilder.header("sec-ch-ua", "\"Chromium\";v=\"130\", \"Google Chrome\";v=\"130\", \"Not?A_Brand\";v=\"99\"");
                    reqBuilder.header("sec-ch-ua-mobile", "?0");
                    reqBuilder.header("sec-ch-ua-platform", "\"Windows\"");
                } else {
                    reqBuilder.header("User-Agent", CLEAN_CHROME_MOBILE_UA);
                    reqBuilder.header("sec-ch-ua-mobile", "?1");
                    reqBuilder.header("sec-ch-ua-platform", "\"Android\"");
                }

                // Pass existing cookies from CookieManager
                String cookies = CookieManager.getInstance().getCookie(uri.toString());
                if (cookies != null && !cookies.isEmpty()) {
                    reqBuilder.addHeader("Cookie", cookies);
                }

                Response response = httpClient.newCall(reqBuilder.build()).execute();

                // Save cookies returned by server
                for (String setCookie : response.headers("Set-Cookie")) {
                    CookieManager.getInstance().setCookie(uri.toString(), setCookie);
                }
                CookieManager.getInstance().flush();

                // Strip X-Frame-Options and Content-Security-Policy frame restrictions
                Map<String, String> respHeaders = new HashMap<>();
                for (String name : response.headers().names()) {
                    String lower = name.toLowerCase(Locale.ROOT);
                    if (lower.equals("x-frame-options") ||
                        lower.equals("content-security-policy") ||
                        lower.equals("content-security-policy-report-only") ||
                        lower.equals("x-content-security-policy")) {
                        continue; // Strip to enable iframe embedding
                    }
                    respHeaders.put(name, response.header(name));
                }
                respHeaders.put("Access-Control-Allow-Origin", "*");
                respHeaders.put("Access-Control-Allow-Credentials", "true");

                String contentType = response.header("Content-Type", "text/html; charset=UTF-8");
                String mimeType = "text/html";
                String encoding = "utf-8";
                if (contentType != null) {
                    String[] parts = contentType.split(";");
                    mimeType = parts[0].trim();
                    for (int i = 1; i < parts.length; i++) {
                        String p = parts[i].trim().toLowerCase(Locale.ROOT);
                        if (p.startsWith("charset=")) {
                            encoding = p.substring("charset=".length()).trim();
                        }
                    }
                }

                ResponseBody body = response.body();
                if (body == null) {
                    return super.shouldInterceptRequest(view, request);
                }

                if (mimeType.contains("text/html")) {
                    String html = body.string();
                    StringBuilder injection = new StringBuilder();
                    injection.append("\n<!-- RAMBOX CORE KERNEL -->\n");

                    // 1. Anti-Framebusting: Spoof window.top and window.parent
                    injection.append("<script id=\"rb-anti-framebust\">\n")
                        .append("try {\n")
                        .append("  Object.defineProperty(window, 'top', { get: function() { return window.self; }, configurable: true });\n")
                        .append("  Object.defineProperty(window, 'parent', { get: function() { return window.self; }, configurable: true });\n")
                        .append("  Object.defineProperty(window, 'frameElement', { get: function() { return null; }, configurable: true });\n")
                        .append("} catch(e) {}\n")
                        .append("</script>\n");

                    if (isWhatsApp) {
                        // Desktop Client Hints stealth for WhatsApp
                        injection.append("<script id=\"rb-wa-stealth\">\n")
                            .append("try {\n")
                            .append("  Object.defineProperty(navigator, 'platform', { get: function() { return 'Win32'; }, configurable: true });\n")
                            .append("  Object.defineProperty(navigator, 'maxTouchPoints', { get: function() { return 1; }, configurable: true });\n")
                            .append("  if (navigator.userAgentData) {\n")
                            .append("    var fakeUAData = {\n")
                            .append("      brands: [\n")
                            .append("        { brand: 'Chromium', version: '130' },\n")
                            .append("        { brand: 'Google Chrome', version: '130' },\n")
                            .append("        { brand: 'Not?A_Brand', version: '99' }\n")
                            .append("      ],\n")
                            .append("      mobile: false,\n")
                            .append("      platform: 'Windows',\n")
                            .append("      getHighEntropyValues: function() {\n")
                            .append("        return Promise.resolve({\n")
                            .append("          architecture: 'x86',\n")
                            .append("          bitness: '64',\n")
                            .append("          brands: [\n")
                            .append("            { brand: 'Chromium', version: '130' },\n")
                            .append("            { brand: 'Google Chrome', version: '130' },\n")
                            .append("            { brand: 'Not?A_Brand', version: '99' }\n")
                            .append("          ],\n")
                            .append("          mobile: false,\n")
                            .append("          model: '',\n")
                            .append("          platform: 'Windows',\n")
                            .append("          platformVersion: '10.0.0',\n")
                            .append("          uaFullVersion: '130.0.0.0'\n")
                            .append("        });\n")
                            .append("      },\n")
                            .append("      toJSON: function() {\n")
                            .append("        return { brands: this.brands, mobile: false, platform: 'Windows' };\n")
                            .append("      }\n")
                            .append("    };\n")
                            .append("    Object.defineProperty(navigator, 'userAgentData', { get: function() { return fakeUAData; }, configurable: true });\n")
                            .append("  }\n")
                            .append("} catch(e) {}\n")
                            .append("</script>\n");

                        // WhatsApp Single-Pane Adaptive Layout CSS (100% width, no horizontal scrolling)
                        injection.append("<style id=\"rb-wa-single-pane\">\n")
                            .append("div[data-testid='chat-list-wrapper'] { width: 100vw !important; min-width: 100vw !important; max-width: 100vw !important; flex: 0 0 100vw !important; }\n")
                            .append("div[data-testid='conversation-panel-wrapper'], #main { width: 100vw !important; min-width: 100vw !important; max-width: 100vw !important; flex: 0 0 100vw !important; }\n")
                            .append("body.wa-chat-open div[data-testid='chat-list-wrapper'] { display: none !important; }\n")
                            .append("body.wa-chat-open div[data-testid='conversation-panel-wrapper'], body.wa-chat-open #main { display: flex !important; }\n")
                            .append("#rb-wa-back { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 50%; background: rgba(255,255,255,0.1); color: #00a884; font-size: 20px; font-weight: bold; border: none; cursor: pointer; margin-right: 8px; }\n")
                            .append("</style>\n");

                        // Injected script to watch for active chat and add Back button
                        injection.append("<script id=\"rb-wa-nav-controller\">\n")
                            .append("(function() {\n")
                            .append("  function updateChatState() {\n")
                            .append("    var main = document.getElementById('main');\n")
                            .append("    var isOpen = !!main && main.offsetWidth > 0;\n")
                            .append("    if (isOpen) {\n")
                            .append("      document.body.classList.add('wa-chat-open');\n")
                            .append("      var header = main.querySelector('header');\n")
                            .append("      if (header && !document.getElementById('rb-wa-back')) {\n")
                            .append("        var btn = document.createElement('button');\n")
                            .append("        btn.id = 'rb-wa-back';\n")
                            .append("        btn.innerHTML = '&#8592;';\n")
                            .append("        btn.title = 'Kembali ke daftar obrolan';\n")
                            .append("        btn.onclick = function(e) {\n")
                            .append("          e.stopPropagation();\n")
                            .append("          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));\n")
                            .append("          document.body.classList.remove('wa-chat-open');\n")
                            .append("        };\n")
                            .append("        header.insertBefore(btn, header.firstChild);\n")
                            .append("      }\n")
                            .append("    } else {\n")
                            .append("      document.body.classList.remove('wa-chat-open');\n")
                            .append("    }\n")
                            .append("  }\n")
                            .append("  var obs = new MutationObserver(updateChatState);\n")
                            .append("  obs.observe(document.documentElement, { childList: true, subtree: true });\n")
                            .append("  window.addEventListener('load', updateChatState);\n")
                            .append("  setInterval(updateChatState, 500);\n")
                            .append("})();\n")
                            .append("</script>\n");
                    } else {
                        // General mobile services styling: enforce touch scrolling and prevent horizontal overflow
                        if (!html.toLowerCase(Locale.ROOT).contains("name=\"viewport\"")) {
                            injection.append("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=yes\">\n");
                        }
                        injection.append("<style id=\"rb-mobile-scroll\">\n")
                            .append("  * { -webkit-overflow-scrolling: touch !important; }\n")
                            .append("  html, body { overflow-x: hidden !important; width: 100% !important; }\n")
                            .append("</style>\n");
                    }

                    int headIdx = html.toLowerCase(Locale.ROOT).indexOf("<head>");
                    if (headIdx != -1) {
                        html = html.substring(0, headIdx + 6) + injection.toString() + html.substring(headIdx + 6);
                    } else {
                        html = injection.toString() + html;
                    }

                    byte[] bytes = html.getBytes(StandardCharsets.UTF_8);
                    InputStream is = new ByteArrayInputStream(bytes);
                    return new WebResourceResponse(
                        mimeType,
                        "utf-8",
                        response.code(),
                        response.message().isEmpty() ? "OK" : response.message(),
                        respHeaders,
                        is
                    );
                } else {
                    return new WebResourceResponse(
                        mimeType,
                        encoding,
                        response.code(),
                        response.message().isEmpty() ? "OK" : response.message(),
                        respHeaders,
                        body.byteStream()
                    );
                }

            } catch (Exception e) {
                Log.e(TAG, "Error intercepting request: " + uri, e);
                return super.shouldInterceptRequest(view, request);
            }
        }
    }
}
