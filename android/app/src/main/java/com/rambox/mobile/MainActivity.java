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
import android.provider.Settings;
import android.content.pm.PackageManager;
import android.webkit.JavascriptInterface;
import androidx.core.content.FileProvider;
import androidx.webkit.WebViewFeature;
import androidx.webkit.WebSettingsCompat;
import java.util.Collections;
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

    private String cachedRealChromeMobileUa = null;

    private String getRealChromeMobileUa() {
        if (cachedRealChromeMobileUa != null) {
            return cachedRealChromeMobileUa;
        }
        try {
            String baseUa = WebSettings.getDefaultUserAgent(this);
            cachedRealChromeMobileUa = baseUa
                .replace("; wv", "")
                .replace(";  wv", "")
                .replace(";wv", "")
                .replaceAll("Version/\\d+\\.\\d+\\s*", "");
        } catch (Exception e) {
            cachedRealChromeMobileUa = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
        }
        return cachedRealChromeMobileUa;
    }

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

        // 1. Set genuine Chrome Mobile UA by default for Google authentication & modern compatibility
        settings.setUserAgentString(getRealChromeMobileUa());

        // Suppress X-Requested-With header to prevent Google from detecting WebView
        try {
            if (WebViewFeature.isFeatureSupported(WebViewFeature.REQUESTED_WITH_HEADER_ALLOW_LIST)) {
                WebSettingsCompat.setRequestedWithHeaderOriginAllowList(settings, Collections.emptySet());
            }
        } catch (Throwable ignored) {}

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

        // 6. Register Auto-Updater & Native Direct Launcher JavaScript Bridges
        webView.addJavascriptInterface(new RamboxAppUpdaterInterface(), "RamboxUpdater");
        webView.addJavascriptInterface(new RamboxNativeBridge(), "RamboxNative");

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

        @JavascriptInterface
        public void openGoogleLogin(String targetUrl) {
            openGoogleLoginDialog(targetUrl);
        }
    }

    /**
     * Solusi 2: Direct Native Launcher Bridge & Floating Dynamic Island Controller
     */
    public class RamboxNativeBridge {
        @JavascriptInterface
        public boolean launchPackage(String packageName, String fallbackUrl) {
            runOnUiThread(() -> {
                try {
                    PackageManager pm = getPackageManager();
                    Intent intent = pm.getLaunchIntentForPackage(packageName);
                    if (intent != null) {
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
                        startActivity(intent);
                        startFloatingOverlay();
                    } else if (fallbackUrl != null && !fallbackUrl.isEmpty()) {
                        Intent viewIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(fallbackUrl));
                        viewIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(viewIntent);
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Error launching package: " + packageName, e);
                }
            });
            return true;
        }

        @JavascriptInterface
        public boolean isPackageInstalled(String packageName) {
            try {
                PackageManager pm = getPackageManager();
                pm.getPackageInfo(packageName, PackageManager.GET_ACTIVITIES);
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public boolean canDrawOverlays() {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                return Settings.canDrawOverlays(MainActivity.this);
            }
            return true;
        }

        @JavascriptInterface
        public void requestOverlayPermission() {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(MainActivity.this)) {
                Intent intent = new Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + getPackageName())
                );
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
            }
        }

        @JavascriptInterface
        public void startFloatingIsland() {
            runOnUiThread(() -> startFloatingOverlay());
        }

        @JavascriptInterface
        public void stopFloatingIsland() {
            runOnUiThread(() -> stopFloatingOverlay());
        }

        @JavascriptInterface
        public boolean isFloatingIslandRunning() {
            return FloatingIslandService.isRunning;
        }
    }

    public void startFloatingOverlay() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (!Settings.canDrawOverlays(this)) {
                return;
            }
        }
        try {
            Intent serviceIntent = new Intent(this, FloatingIslandService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent);
            } else {
                startService(serviceIntent);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error starting FloatingIslandService", e);
        }
    }

    public void stopFloatingOverlay() {
        try {
            Intent serviceIntent = new Intent(this, FloatingIslandService.class);
            stopService(serviceIntent);
        } catch (Exception e) {
            Log.e(TAG, "Error stopping FloatingIslandService", e);
        }
    }

    /**
     * Dedicated Native Google Authentication Dialog:
     * - Top-level window context (First-party, NOT an iframe).
     * - Uses real Chrome on Android User-Agent (strips ; wv and Version/4.0).
     * - Syncs all session cookies directly into CookieManager.
     * - Automatically detects login completion and signals active services to reload.
     */
    public void openGoogleLoginDialog(String targetUrl) {
        runOnUiThread(() -> {
            try {
                final Dialog dialog = new Dialog(MainActivity.this, android.R.style.Theme_DeviceDefault_Light_NoActionBar_Fullscreen);

                LinearLayout layout = new LinearLayout(MainActivity.this);
                layout.setOrientation(LinearLayout.VERTICAL);
                layout.setBackgroundColor(Color.parseColor("#12121e"));

                // Top Header Bar
                LinearLayout header = new LinearLayout(MainActivity.this);
                header.setOrientation(LinearLayout.HORIZONTAL);
                header.setPadding(32, 28, 32, 28);
                header.setBackgroundColor(Color.parseColor("#1c1c2e"));

                TextView titleView = new TextView(MainActivity.this);
                titleView.setText("Login Akun Google Resmi");
                titleView.setTextColor(Color.WHITE);
                titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
                titleView.setTypeface(null, android.graphics.Typeface.BOLD);
                titleView.setLayoutParams(new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.0f));
                header.addView(titleView);

                Button closeBtn = new Button(MainActivity.this);
                closeBtn.setText("Selesai / Tutup ✕");
                closeBtn.setTextColor(Color.parseColor("#818cf8"));
                closeBtn.setBackgroundColor(Color.TRANSPARENT);
                closeBtn.setOnClickListener(v -> dialog.dismiss());
                header.addView(closeBtn);

                layout.addView(header);

                WebView loginWebView = new WebView(MainActivity.this);
                loginWebView.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

                WebSettings lSettings = loginWebView.getSettings();
                lSettings.setJavaScriptEnabled(true);
                lSettings.setDomStorageEnabled(true);
                lSettings.setDatabaseEnabled(true);
                lSettings.setSupportMultipleWindows(true);
                lSettings.setJavaScriptCanOpenWindowsAutomatically(true);

                // Authentic Chrome Mobile UA bypasses Google's disallowed_useragent block
                lSettings.setUserAgentString(getRealChromeMobileUa());

                // Suppress X-Requested-With header so Google doesn't block WebView
                try {
                    if (WebViewFeature.isFeatureSupported(WebViewFeature.REQUESTED_WITH_HEADER_ALLOW_LIST)) {
                        WebSettingsCompat.setRequestedWithHeaderOriginAllowList(lSettings, Collections.emptySet());
                    }
                } catch (Throwable ignored) {}

                CookieManager cm = CookieManager.getInstance();
                cm.setAcceptCookie(true);
                cm.setAcceptThirdPartyCookies(loginWebView, true);

                loginWebView.setWebChromeClient(new WebChromeClient());
                loginWebView.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                        Uri reqUri = req.getUrl();
                        if (reqUri != null) {
                            String s = reqUri.getScheme();
                            if (s != null && !s.equalsIgnoreCase("http") && !s.equalsIgnoreCase("https")) {
                                try {
                                    Intent intent = new Intent(Intent.ACTION_VIEW, reqUri);
                                    startActivity(intent);
                                    return true;
                                } catch (Exception ignored) {}
                            }
                        }
                        return false;
                    }

                    @Override
                    public void onPageFinished(WebView v, String url) {
                        super.onPageFinished(v, url);
                        CookieManager.getInstance().flush();

                        // Detect successful login: redirected away from accounts.google.com signin/challenge
                        if (url != null && (
                            url.contains("myaccount.google.com") ||
                            url.contains("mail.google.com") ||
                            url.contains("drive.google.com") ||
                            url.contains("accounts.google.com/SignOutOptions") ||
                            url.contains("accounts.google.com/b/0/AddSession") ||
                            (!url.contains("accounts.google.com") && !url.contains("about:blank")) ||
                            (url.contains("google.com") && !url.contains("signin") && !url.contains("ServiceLogin") && !url.contains("InteractiveLogin") && !url.contains("oauth"))
                        )) {
                            titleView.setText("Login Berhasil! ✓");
                            titleView.setTextColor(Color.parseColor("#34d399"));
                            loginWebView.postDelayed(() -> {
                                try {
                                    if (dialog.isShowing()) {
                                        dialog.dismiss();
                                    }
                                } catch (Exception ignored) {}
                            }, 1200);
                        }
                    }
                });

                dialog.setOnDismissListener(d -> {
                    CookieManager.getInstance().flush();
                    loginWebView.destroy();
                    runOnUiThread(() -> {
                        WebView mainWv = getBridge().getWebView();
                        if (mainWv != null) {
                            mainWv.evaluateJavascript(
                                "window.dispatchEvent(new CustomEvent('google-login-done'));",
                                null
                            );
                        }
                    });
                });

                layout.addView(loginWebView);
                dialog.setContentView(layout);
                dialog.show();

                String urlToLoad = (targetUrl != null && !targetUrl.isEmpty()) 
                    ? targetUrl 
                    : "https://accounts.google.com/ServiceLogin";
                loginWebView.loadUrl(urlToLoad);

            } catch (Exception e) {
                Log.e(TAG, "Error opening Google Login Dialog", e);
            }
        });
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
            pSettings.setUserAgentString(getRealChromeMobileUa());
            pSettings.setSupportMultipleWindows(true);
            pSettings.setJavaScriptCanOpenWindowsAutomatically(true);

            // Suppress X-Requested-With header so Google doesn't block WebView
            try {
                if (WebViewFeature.isFeatureSupported(WebViewFeature.REQUESTED_WITH_HEADER_ALLOW_LIST)) {
                    WebSettingsCompat.setRequestedWithHeaderOriginAllowList(pSettings, Collections.emptySet());
                }
            } catch (Throwable ignored) {}

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
                    Uri reqUri = req.getUrl();
                    if (reqUri != null) {
                        String s = reqUri.getScheme();
                        if (s != null && !s.equalsIgnoreCase("http") && !s.equalsIgnoreCase("https")) {
                            try {
                                Intent intent = new Intent(Intent.ACTION_VIEW, reqUri);
                                startActivity(intent);
                                return true;
                            } catch (Exception ignored) {}
                        }
                    }
                    return false;
                }

                @Override
                public void onPageFinished(WebView v, String url) {
                    super.onPageFinished(v, url);
                    CookieManager.getInstance().flush();

                    // Detect OAuth popup completion
                    if (url != null && (
                        url.contains("myaccount.google.com") ||
                        url.contains("/oauth/callback") ||
                        url.contains("/callback") ||
                        url.contains("/auth/success") ||
                        url.contains("accounts.google.com/SignOutOptions") ||
                        (!url.contains("accounts.google.com") && !url.contains("about:blank") && !url.contains("/oauth") && !url.contains("/signin"))
                    )) {
                        titleView.setText("Autentikasi Berhasil! ✓");
                        titleView.setTextColor(Color.parseColor("#34d399"));
                        popupWebView.postDelayed(() -> {
                            try {
                                if (dialog.isShowing()) {
                                    dialog.dismiss();
                                }
                            } catch (Exception ignored) {}
                        }, 1200);
                    }
                }
            });

            dialog.setOnDismissListener(d -> {
                popupWebView.destroy();
                CookieManager.getInstance().flush();
                runOnUiThread(() -> {
                    WebView mainWv = getBridge().getWebView();
                    if (mainWv != null) {
                        mainWv.evaluateJavascript(
                            "window.dispatchEvent(new CustomEvent('google-login-done'));",
                            null
                        );
                    }
                });
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
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (uri != null) {
                String host = uri.getHost();
                if (host != null && (host.equalsIgnoreCase("accounts.google.com") || host.endsWith(".accounts.google.com"))) {
                    String path = uri.getPath() != null ? uri.getPath().toLowerCase(Locale.ROOT) : "";
                    if (!path.endsWith(".js") && !path.contains("/gsi/")) {
                        Log.d(TAG, "accounts.google.com requested in shouldOverrideUrlLoading, opening native sheet: " + uri);
                        openGoogleLoginDialog(uri.toString());
                        return true;
                    }
                }
            }
            return super.shouldOverrideUrlLoading(view, request);
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

            // 3. Delegate accounts.google.com document navigations to the secure native Google Login Sheet
            if (host != null && (host.equalsIgnoreCase("accounts.google.com") || host.endsWith(".accounts.google.com"))) {
                String path = uri.getPath() != null ? uri.getPath().toLowerCase(Locale.ROOT) : "";
                boolean isSubresource = path.endsWith(".js") || path.endsWith(".css") || path.endsWith(".png") || path.endsWith(".svg") || path.contains("/gsi/");
                if (!isSubresource && isDocument) {
                    Log.d(TAG, "accounts.google.com document navigation detected in shouldInterceptRequest, launching native sheet: " + uri);
                    openGoogleLoginDialog(uri.toString());
                    String noticeHtml = "<!DOCTYPE html><html><head><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"><style>body{background:#0c0c14;color:#fff;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;padding:24px;box-sizing:border-box;text-align:center;}h3{color:#818cf8;margin-bottom:8px;font-size:17px;}p{font-size:13px;opacity:0.75;line-height:1.5;max-width:320px;}</style></head><body><div style=\"width:48px;height:48px;border-radius:16px;background:rgba(99,102,241,0.2);display:flex;align-items:center;justify-content:center;margin-bottom:12px;\"><svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#818cf8\" stroke-width=\"2\"><path d=\"M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3\"/></svg></div><h3>Autentikasi Akun Google</h3><p>Membuka lembar login resmi Google di atas layar. Silakan selesaikan proses masuk Anda.</p></body></html>";
                    return new WebResourceResponse("text/html", "UTF-8", new ByteArrayInputStream(noticeHtml.getBytes(StandardCharsets.UTF_8)));
                } else {
                    // Let subresources (JS scripts like /gsi/client) fetch natively
                    return super.shouldInterceptRequest(view, request);
                }
            }

            // Local asset bridge for WhatsApp Mobile Clone engine
            String reqPath = uri != null ? uri.getPath() : "";
            if (reqPath != null && reqPath.contains("/wa-clone/")) {
                try {
                    String subPath = reqPath.substring(reqPath.indexOf("/wa-clone/") + "/wa-clone/".length());
                    String assetPath = "public/whatsapp/" + subPath;
                    InputStream is = getAssets().open(assetPath);
                    String mime = "application/javascript";
                    if (subPath.endsWith(".css")) mime = "text/css";
                    else if (subPath.endsWith(".html")) mime = "text/html";
                    else if (subPath.endsWith(".png")) mime = "image/png";
                    else if (subPath.endsWith(".svg")) mime = "image/svg+xml";
                    Map<String, String> headers = new HashMap<>();
                    headers.put("Access-Control-Allow-Origin", "*");
                    headers.put("Cache-Control", "no-cache");
                    return new WebResourceResponse(mime, "UTF-8", 200, "OK", headers, is);
                } catch (Exception e) {
                    Log.e(TAG, "Error intercepting wa-clone asset: " + reqPath, e);
                }
            }

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
                        // Filter out iframe-specific Sec-Fetch, localhost, and x-requested-with headers
                        if (!lowerK.equals("host") &&
                            !lowerK.equals("accept-encoding") &&
                            !lowerK.equals("sec-fetch-site") &&
                            !lowerK.equals("sec-fetch-mode") &&
                            !lowerK.equals("sec-fetch-dest") &&
                            !lowerK.equals("sec-fetch-user") &&
                            !lowerK.equals("origin") &&
                            !lowerK.equals("referer") &&
                            !lowerK.equals("x-requested-with")) {
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
                    reqBuilder.header("User-Agent", getRealChromeMobileUa());
                    reqBuilder.header("sec-ch-ua-mobile", "?1");
                    reqBuilder.header("sec-ch-ua-platform", "\"Android\"");
                }

                // Pass existing cookies from CookieManager
                String cookies = CookieManager.getInstance().getCookie(uri.toString());
                if (cookies != null && !cookies.isEmpty()) {
                    reqBuilder.addHeader("Cookie", cookies);
                }

                Response response = httpClient.newCall(reqBuilder.build()).execute();

                // Check if upstream service redirected to Google Login (e.g. Gmail, Drive, or OAuth)
                okhttp3.HttpUrl finalUrl = response.request().url();
                if (finalUrl.host().equalsIgnoreCase("accounts.google.com") || finalUrl.host().endsWith(".accounts.google.com")) {
                    Log.d(TAG, "OkHttp redirected to accounts.google.com: " + finalUrl + ", launching native sheet!");
                    openGoogleLoginDialog(finalUrl.toString());
                    String noticeHtml = "<!DOCTYPE html><html><head><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"><style>body{background:#0c0c14;color:#fff;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;padding:24px;box-sizing:border-box;text-align:center;}h3{color:#818cf8;margin-bottom:8px;font-size:17px;}p{font-size:13px;opacity:0.75;line-height:1.5;max-width:320px;}</style></head><body><div style=\"width:48px;height:48px;border-radius:16px;background:rgba(99,102,241,0.2);display:flex;align-items:center;justify-content:center;margin-bottom:12px;\"><svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#818cf8\" stroke-width=\"2\"><path d=\"M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3\"/></svg></div><h3>Autentikasi Akun Google</h3><p>Membuka lembar login resmi Google di atas layar. Silakan selesaikan proses masuk Anda.</p></body></html>";
                    return new WebResourceResponse("text/html", "UTF-8", new ByteArrayInputStream(noticeHtml.getBytes(StandardCharsets.UTF_8)));
                }

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

                    // 1. Anti-Framebusting: Spoof window.top and window.parent (NEVER inject on Google domains)
                    boolean isGoogle = host != null && (host.contains("google.") || host.contains("gstatic.") || host.contains("googleapis."));
                    if (!isGoogle && !isWhatsApp) {
                        injection.append("<script id=\"rb-anti-framebust\">\n")
                            .append("try {\n")
                            .append("  Object.defineProperty(window, 'top', { get: function() { return window.self; }, configurable: true });\n")
                            .append("  Object.defineProperty(window, 'parent', { get: function() { return window.self; }, configurable: true });\n")
                            .append("  Object.defineProperty(window, 'frameElement', { get: function() { return null; }, configurable: true });\n")
                            .append("} catch(e) {}\n")
                            .append("</script>\n");
                    }

                    if (isWhatsApp) {
                        // Desktop Client Hints stealth for WhatsApp
                        injection.append("<script id=\"rb-wa-stealth\">\n")
                            .append("try {\n")
                            .append("  window.__rb_parent = window.parent;\n")
                            .append("  Object.defineProperty(window, 'top', { get: function() { return window.self; }, configurable: true });\n")
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

                        // Inject Background Multi-Device Session Bridge into web.whatsapp.com
                        injection.append("<script src=\"/wa-clone/wppconnect-wa.js\"></script>\n");
                        injection.append("<script src=\"/wa-clone/wa-bridge.js\"></script>\n");
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
