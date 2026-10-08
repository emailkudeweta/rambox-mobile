package com.rambox.mobile;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ValueAnimator;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.DisplayCutout;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.view.WindowMetrics;
import android.view.animation.DecelerateInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import java.util.List;

public class FloatingIslandService extends Service {
    private static final String TAG = "RamboxFloatingIsland";
    public static final String CHANNEL_ID = "rambox_floating_island_channel";
    public static final int NOTIFICATION_ID = 2002;

    public static final String ACTION_SHOW = "com.rambox.mobile.ACTION_SHOW_ISLAND";
    public static final String ACTION_HIDE = "com.rambox.mobile.ACTION_HIDE_ISLAND";
    public static final String ACTION_KEEP_ALIVE = "com.rambox.mobile.ACTION_KEEP_ALIVE";
    public static final String EXTRA_APP_NAME = "EXTRA_APP_NAME";
    public static final String EXTRA_PACKAGE_NAME = "EXTRA_PACKAGE_NAME";

    public enum CameraPosition {
        CENTER,
        LEFT,
        RIGHT
    }

    private WindowManager windowManager;
    private FrameLayout floatingView;
    private WindowManager.LayoutParams params;
    private boolean isViewAdded = false;

    // Persistent View Containers (Never destroyed during lifetime to prevent dropped clicks/touch lag)
    private LinearLayout idleLayout;
    private LinearLayout centerExpandedLayout;
    private LinearLayout cornerExpandedLayout;

    // UI Element References
    private TextView centerTitleTv;
    private ImageView centerIconIv;
    private TextView cornerTitleTv;
    private ImageView cornerIconIv;

    // Geometry & Camera Cutout
    private CameraPosition cameraPosition = CameraPosition.CENTER;
    private int cameraCenterX = -1;
    private int cameraCenterY = -1;
    private int cameraWidth = 0;
    private int cameraHeight = 0;
    private int manualOffsetX = 0;
    private int manualOffsetY = 0;
    private boolean cutoutProcessed = false;

    // State & Animation
    private boolean isExpanded = false;
    private ValueAnimator boundsAnimator;
    private final Handler collapseHandler = new Handler(Looper.getMainLooper());
    private final Runnable autoCollapseRunnable = this::collapseIsland;

    private String currentAppName = "WhatsApp";
    private String currentPackageName = "com.whatsapp";

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        startForegroundServiceNotification();
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);

        SharedPreferences prefs = getSharedPreferences("rambox_island_overlay", MODE_PRIVATE);
        manualOffsetX = prefs.getInt("manual_offset_x", 0);
        manualOffsetY = prefs.getInt("manual_offset_y", 0);

        initLayoutParams();
        buildPersistentViews();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String action = intent.getAction();
            if (ACTION_HIDE.equals(action)) {
                hideFloatingView();
                updateNotificationContent("Rambox Mobile Aktif di Latar Belakang", "Ketuk untuk membuka Rambox Workspace");
            } else if (ACTION_SHOW.equals(action) || ACTION_KEEP_ALIVE.equals(action) || action == null) {
                String appName = intent.getStringExtra(EXTRA_APP_NAME);
                String packageName = intent.getStringExtra(EXTRA_PACKAGE_NAME);
                if (appName != null && !appName.trim().isEmpty()) {
                    currentAppName = appName.trim();
                }
                if (packageName != null && !packageName.trim().isEmpty()) {
                    currentPackageName = packageName.trim();
                }
                updateViewData();
                showFloatingView();
                updateNotificationContent("Dynamic Island: " + currentAppName, "Ketuk untuk membuka Rambox Workspace");
            }
        } else {
            showFloatingView();
        }
        return START_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        Log.d(TAG, "Rambox task removed from Recents. Re-arming service to keep Dynamic Island alive.");

        try {
            Intent restartServiceIntent = new Intent(getApplicationContext(), FloatingIslandService.class);
            restartServiceIntent.setPackage(getPackageName());
            restartServiceIntent.setAction(ACTION_SHOW);
            restartServiceIntent.putExtra(EXTRA_APP_NAME, currentAppName);
            restartServiceIntent.putExtra(EXTRA_PACKAGE_NAME, currentPackageName);

            PendingIntent restartPendingIntent = PendingIntent.getService(
                getApplicationContext(),
                101,
                restartServiceIntent,
                PendingIntent.FLAG_ONE_SHOT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
            );

            AlarmManager alarmService = (AlarmManager) getApplicationContext().getSystemService(Context.ALARM_SERVICE);
            if (alarmService != null) {
                long restartTime = SystemClock.elapsedRealtime() + 1000;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    alarmService.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, restartTime, restartPendingIntent);
                } else {
                    alarmService.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, restartTime, restartPendingIntent);
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error scheduling service revival in onTaskRemoved", e);
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Rambox Dynamic Island",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Dynamic Island & Servis Latar Belakang Rambox Mobile");
            channel.setSound(null, null);
            channel.enableVibration(false);

            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private void startForegroundServiceNotification() {
        Notification notification = buildNotification("Rambox Mobile Aktif di Latar Belakang", "Ketuk untuk membuka Rambox Workspace");

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private Notification buildNotification(String title, String content) {
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            0,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(content)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE);

        return builder.build();
    }

    public void updateNotificationContent(String title, String content) {
        try {
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                manager.notify(NOTIFICATION_ID, buildNotification(title, content));
            }
        } catch (Exception e) {
            Log.e(TAG, "Error updating notification content", e);
        }
    }

    private void initLayoutParams() {
        int layoutType;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            layoutType = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;
        } else {
            layoutType = WindowManager.LayoutParams.TYPE_PHONE;
        }

        int windowFlags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN;

        params = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            layoutType,
            windowFlags,
            PixelFormat.TRANSLUCENT
        );

        // Allow drawing directly into system status bar and display cutout area!
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            params.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        params.gravity = Gravity.TOP | Gravity.START;
        detectCameraAndSetInitialBounds();
    }

    private void detectCameraAndSetInitialBounds() {
        DisplayMetrics dm = getResources().getDisplayMetrics();
        int screenWidth = dm.widthPixels;

        int statusBarHeight = dpToPx(30);
        int resId = getResources().getIdentifier("status_bar_height", "dimen", "android");
        if (resId > 0) {
            statusBarHeight = getResources().getDimensionPixelSize(resId);
        }

        cameraCenterX = screenWidth / 2;
        cameraCenterY = statusBarHeight / 2;
        cameraWidth = dpToPx(28);
        cameraHeight = dpToPx(28);
        cameraPosition = CameraPosition.CENTER;

        // Try reading window insets immediately on Android 11+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && windowManager != null) {
            try {
                WindowMetrics metrics = windowManager.getCurrentWindowMetrics();
                WindowInsets insets = metrics.getWindowInsets();
                DisplayCutout cutout = insets.getDisplayCutout();
                if (cutout != null) {
                    applyCutout(cutout);
                    return;
                }
            } catch (Exception ignored) {}
        }

        updateParamsForCurrentState();
    }

    private void applyCutout(DisplayCutout cutout) {
        if (cutout == null) return;
        List<Rect> rects = cutout.getBoundingRects();
        if (rects != null && !rects.isEmpty()) {
            Rect cameraRect = rects.get(0);
            for (Rect r : rects) {
                if (r.top < dpToPx(120)) {
                    cameraRect = r;
                    break;
                }
            }

            DisplayMetrics dm = getResources().getDisplayMetrics();
            int screenWidth = dm.widthPixels;

            cameraCenterX = cameraRect.centerX();
            cameraCenterY = cameraRect.centerY();
            cameraWidth = cameraRect.width();
            cameraHeight = cameraRect.height();

            if (cameraCenterX < screenWidth * 0.35f) {
                cameraPosition = CameraPosition.LEFT;
            } else if (cameraCenterX > screenWidth * 0.65f) {
                cameraPosition = CameraPosition.RIGHT;
            } else {
                cameraPosition = CameraPosition.CENTER;
            }

            Log.d(TAG, "Camera Cutout Detected: " + cameraPosition + " at (" + cameraCenterX + ", " + cameraCenterY + ")");
        }
        updateParamsForCurrentState();
    }

    private int getTargetWidth() {
        if (!isExpanded) {
            return (cameraPosition == CameraPosition.CENTER) 
                ? Math.max(dpToPx(76), cameraWidth + dpToPx(36))
                : Math.max(dpToPx(60), cameraWidth + dpToPx(24));
        } else {
            return (cameraPosition == CameraPosition.CENTER) ? dpToPx(268) : dpToPx(190);
        }
    }

    private int getTargetHeight() {
        if (!isExpanded) {
            return Math.max(dpToPx(32), cameraHeight + dpToPx(10));
        } else {
            return (cameraPosition == CameraPosition.CENTER) ? dpToPx(38) : dpToPx(82);
        }
    }

    private int getTargetX() {
        int w = getTargetWidth();
        DisplayMetrics dm = getResources().getDisplayMetrics();
        int x;

        if (cameraPosition == CameraPosition.CENTER) {
            x = cameraCenterX - w / 2;
        } else if (cameraPosition == CameraPosition.LEFT) {
            x = Math.max(dpToPx(6), cameraCenterX - cameraWidth / 2 - dpToPx(6));
        } else {
            x = Math.min(dm.widthPixels - w - dpToPx(6), cameraCenterX + cameraWidth / 2 - w + dpToPx(6));
        }
        return x + manualOffsetX;
    }

    private int getTargetY() {
        int h = getTargetHeight();
        int y;
        if (!isExpanded || cameraPosition == CameraPosition.CENTER) {
            y = Math.max(dpToPx(4), cameraCenterY - h / 2);
        } else {
            // Anchor top to camera cutout and expand downward
            y = Math.max(dpToPx(4), cameraCenterY - cameraHeight / 2 - dpToPx(4));
        }
        return y + manualOffsetY;
    }

    private void updateParamsForCurrentState() {
        params.width = getTargetWidth();
        params.height = getTargetHeight();
        params.x = getTargetX();
        params.y = getTargetY();
    }

    // =========================================================================
    // PERSISTENT VIEW BUILDER (Created ONCE to eliminate recreation loops)
    // =========================================================================
    private void buildPersistentViews() {
        floatingView = new FrameLayout(this);

        // Apply Cutout insets listener ONCE safely without entering recursive relayout loop
        floatingView.setOnApplyWindowInsetsListener((v, insets) -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && !cutoutProcessed) {
                DisplayCutout cutout = insets.getDisplayCutout();
                if (cutout != null) {
                    List<Rect> rects = cutout.getBoundingRects();
                    if (rects != null && !rects.isEmpty()) {
                        cutoutProcessed = true;
                        applyCutout(cutout);
                        if (!isExpanded && isViewAdded && windowManager != null) {
                            updateParamsForCurrentState();
                            try {
                                windowManager.updateViewLayout(floatingView, params);
                            } catch (Exception ignored) {}
                        }
                    }
                }
            }
            return insets;
        });

        // 1. Build Idle View Container
        buildIdleLayout();

        // 2. Build Expanded Center View Container
        buildCenterExpandedLayout();

        // 3. Build Expanded Corner View Container
        buildCornerExpandedLayout();

        // Apply initial UI visibility state
        showIdleUI();
    }

    private void showIdleUI() {
        if (idleLayout != null) idleLayout.setVisibility(View.VISIBLE);
        if (centerExpandedLayout != null) centerExpandedLayout.setVisibility(View.GONE);
        if (cornerExpandedLayout != null) cornerExpandedLayout.setVisibility(View.GONE);

        GradientDrawable capsuleBg = new GradientDrawable();
        capsuleBg.setColor(Color.parseColor("#050508"));
        capsuleBg.setCornerRadius(dpToPx(24));
        capsuleBg.setStroke(dpToPx(1f), Color.parseColor("#2a2a3e"));
        floatingView.setBackground(capsuleBg);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            floatingView.setElevation(dpToPx(12));
        }
    }

    private void showExpandedUI() {
        if (idleLayout != null) idleLayout.setVisibility(View.GONE);

        GradientDrawable capsuleBg = new GradientDrawable();
        capsuleBg.setColor(Color.parseColor("#050508"));
        capsuleBg.setCornerRadius(cameraPosition != CameraPosition.CENTER ? dpToPx(18) : dpToPx(24));
        capsuleBg.setStroke(dpToPx(1f), Color.parseColor("#2a2a3e"));
        floatingView.setBackground(capsuleBg);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            floatingView.setElevation(dpToPx(14));
        }

        if (cameraPosition == CameraPosition.CENTER) {
            if (centerExpandedLayout != null) centerExpandedLayout.setVisibility(View.VISIBLE);
            if (cornerExpandedLayout != null) cornerExpandedLayout.setVisibility(View.GONE);
        } else {
            if (centerExpandedLayout != null) centerExpandedLayout.setVisibility(View.GONE);
            if (cornerExpandedLayout != null) cornerExpandedLayout.setVisibility(View.VISIBLE);
        }
    }

    // =========================================================================
    // 1. IDLE VIEW: Minimalist Pill over Camera Punch Hole
    // =========================================================================
    private void buildIdleLayout() {
        idleLayout = new LinearLayout(this);
        idleLayout.setOrientation(LinearLayout.HORIZONTAL);
        idleLayout.setGravity(Gravity.CENTER);
        idleLayout.setLayoutParams(new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, 
            FrameLayout.LayoutParams.MATCH_PARENT
        ));

        // Pulsing emerald status dot next to camera hole
        View dotView = new View(this);
        GradientDrawable dotBg = new GradientDrawable();
        dotBg.setColor(Color.parseColor("#10b981"));
        dotBg.setShape(GradientDrawable.OVAL);
        dotView.setBackground(dotBg);
        LinearLayout.LayoutParams dotParams = new LinearLayout.LayoutParams(dpToPx(7), dpToPx(7));
        dotParams.setMargins(dpToPx(4), 0, dpToPx(4), 0);
        dotView.setLayoutParams(dotParams);
        idleLayout.addView(dotView);

        // Touch handling: Clean tap detection vs drag adjustment
        final int touchSlop = ViewConfiguration.get(this).getScaledTouchSlop();
        idleLayout.setOnTouchListener(new View.OnTouchListener() {
            private float downX, downY;
            private int startParamX, startParamY;
            private boolean isDrag = false;

            @Override
            public boolean onTouch(View v, MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        downX = event.getRawX();
                        downY = event.getRawY();
                        startParamX = params.x;
                        startParamY = params.y;
                        isDrag = false;
                        return true;

                    case MotionEvent.ACTION_MOVE:
                        float dx = event.getRawX() - downX;
                        float dy = event.getRawY() - downY;
                        if (!isDrag && Math.hypot(dx, dy) > touchSlop) {
                            isDrag = true;
                        }
                        if (isDrag) {
                            params.x = (int) (startParamX + dx);
                            params.y = (int) (startParamY + dy);
                            try {
                                if (isViewAdded && windowManager != null) {
                                    windowManager.updateViewLayout(floatingView, params);
                                }
                            } catch (Exception ignored) {}
                        }
                        return true;

                    case MotionEvent.ACTION_UP:
                        if (!isDrag) {
                            expandIsland();
                        } else {
                            manualOffsetX += (params.x - startParamX);
                            manualOffsetY += (params.y - startParamY);
                            SharedPreferences prefs = getSharedPreferences("rambox_island_overlay", MODE_PRIVATE);
                            prefs.edit()
                                .putInt("manual_offset_x", manualOffsetX)
                                .putInt("manual_offset_y", manualOffsetY)
                                .apply();
                        }
                        return true;
                }
                return false;
            }
        });

        floatingView.addView(idleLayout);
    }

    // =========================================================================
    // 2. EXPANDED VIEW: CENTER CAMERA (Melebar ke Samping / Horizontal)
    // =========================================================================
    private void buildCenterExpandedLayout() {
        centerExpandedLayout = new LinearLayout(this);
        centerExpandedLayout.setOrientation(LinearLayout.HORIZONTAL);
        centerExpandedLayout.setGravity(Gravity.CENTER_VERTICAL);
        centerExpandedLayout.setPadding(dpToPx(6), dpToPx(3), dpToPx(6), dpToPx(3));
        centerExpandedLayout.setLayoutParams(new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, 
            FrameLayout.LayoutParams.MATCH_PARENT
        ));

        // 1. Prev Button (‹)
        TextView prevButton = new TextView(this);
        prevButton.setText("‹");
        prevButton.setTextColor(Color.parseColor("#cbd5e1"));
        prevButton.setTextSize(18);
        prevButton.setTypeface(Typeface.DEFAULT_BOLD);
        prevButton.setPadding(dpToPx(8), dpToPx(2), dpToPx(8), dpToPx(2));
        prevButton.setOnClickListener(v -> {
            navigateService("prev");
            resetAutoCollapseTimer();
        });
        centerExpandedLayout.addView(prevButton);

        // 2. Center Pill (Icon + App Name + Dot) -> Clicking opens Rambox!
        LinearLayout centerPill = new LinearLayout(this);
        centerPill.setOrientation(LinearLayout.HORIZONTAL);
        centerPill.setGravity(Gravity.CENTER_VERTICAL);
        centerPill.setPadding(dpToPx(8), dpToPx(4), dpToPx(8), dpToPx(4));
        GradientDrawable centerBg = new GradientDrawable();
        centerBg.setColor(Color.parseColor("#1a1a2c"));
        centerBg.setCornerRadius(dpToPx(14));
        centerPill.setBackground(centerBg);
        LinearLayout.LayoutParams pillLp = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.0f);
        centerPill.setLayoutParams(pillLp);

        centerIconIv = new ImageView(this);
        centerIconIv.setLayoutParams(new LinearLayout.LayoutParams(dpToPx(17), dpToPx(17)));
        centerIconIv.setImageDrawable(getAppIcon());
        centerPill.addView(centerIconIv);

        centerTitleTv = new TextView(this);
        centerTitleTv.setText(currentAppName);
        centerTitleTv.setTextColor(Color.WHITE);
        centerTitleTv.setTextSize(11);
        centerTitleTv.setTypeface(Typeface.DEFAULT_BOLD);
        centerTitleTv.setSingleLine(true);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.0f);
        titleParams.setMargins(dpToPx(6), 0, dpToPx(6), 0);
        centerTitleTv.setLayoutParams(titleParams);
        centerPill.addView(centerTitleTv);

        View dotView = new View(this);
        GradientDrawable dotBg = new GradientDrawable();
        dotBg.setColor(Color.parseColor("#10b981"));
        dotBg.setShape(GradientDrawable.OVAL);
        dotView.setBackground(dotBg);
        dotView.setLayoutParams(new LinearLayout.LayoutParams(dpToPx(6), dpToPx(6)));
        centerPill.addView(dotView);

        centerPill.setOnClickListener(v -> {
            bringRamboxToFront();
            collapseIsland();
        });
        centerExpandedLayout.addView(centerPill);

        // 3. Next Button (›)
        TextView nextButton = new TextView(this);
        nextButton.setText("›");
        nextButton.setTextColor(Color.parseColor("#cbd5e1"));
        nextButton.setTextSize(18);
        nextButton.setTypeface(Typeface.DEFAULT_BOLD);
        nextButton.setPadding(dpToPx(8), dpToPx(2), dpToPx(8), dpToPx(2));
        nextButton.setOnClickListener(v -> {
            navigateService("next");
            resetAutoCollapseTimer();
        });
        centerExpandedLayout.addView(nextButton);

        // 4. Settings Button (⚙)
        TextView settingsBtn = new TextView(this);
        settingsBtn.setText("⚙");
        settingsBtn.setTextColor(Color.parseColor("#94a3b8"));
        settingsBtn.setTextSize(13);
        settingsBtn.setPadding(dpToPx(6), dpToPx(2), dpToPx(6), dpToPx(2));
        settingsBtn.setOnClickListener(v -> openRamboxAction("settings"));
        centerExpandedLayout.addView(settingsBtn);

        // 5. Close/Collapse Button (✕)
        TextView closeBtn = new TextView(this);
        closeBtn.setText("✕");
        closeBtn.setTextColor(Color.parseColor("#64748b"));
        closeBtn.setTextSize(11);
        closeBtn.setPadding(dpToPx(6), dpToPx(2), dpToPx(6), dpToPx(2));
        closeBtn.setOnClickListener(v -> collapseIsland());
        centerExpandedLayout.addView(closeBtn);

        floatingView.addView(centerExpandedLayout);
    }

    // =========================================================================
    // 3. EXPANDED VIEW: CORNER CAMERA (Melebar ke Bawah / Dropdown Vertical)
    // =========================================================================
    private void buildCornerExpandedLayout() {
        cornerExpandedLayout = new LinearLayout(this);
        cornerExpandedLayout.setOrientation(LinearLayout.VERTICAL);
        cornerExpandedLayout.setPadding(dpToPx(8), dpToPx(6), dpToPx(8), dpToPx(6));
        cornerExpandedLayout.setLayoutParams(new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, 
            FrameLayout.LayoutParams.MATCH_PARENT
        ));

        // ROW 1: Header (Mini Status Dot + Title + Close)
        LinearLayout row1 = new LinearLayout(this);
        row1.setOrientation(LinearLayout.HORIZONTAL);
        row1.setGravity(Gravity.CENTER_VERTICAL);
        row1.setLayoutParams(new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, 
            LinearLayout.LayoutParams.WRAP_CONTENT
        ));

        View dotView = new View(this);
        GradientDrawable dotBg = new GradientDrawable();
        dotBg.setColor(Color.parseColor("#10b981"));
        dotBg.setShape(GradientDrawable.OVAL);
        dotView.setBackground(dotBg);
        dotView.setLayoutParams(new LinearLayout.LayoutParams(dpToPx(6), dpToPx(6)));
        row1.addView(dotView);

        TextView headerTv = new TextView(this);
        headerTv.setText(" Rambox");
        headerTv.setTextColor(Color.parseColor("#94a3b8"));
        headerTv.setTextSize(9);
        headerTv.setTypeface(Typeface.DEFAULT_BOLD);
        LinearLayout.LayoutParams hParams = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.0f);
        hParams.setMargins(dpToPx(3), 0, 0, 0);
        headerTv.setLayoutParams(hParams);
        row1.addView(headerTv);

        TextView settingsBtn = new TextView(this);
        settingsBtn.setText("⚙");
        settingsBtn.setTextColor(Color.parseColor("#94a3b8"));
        settingsBtn.setTextSize(12);
        settingsBtn.setPadding(dpToPx(6), 0, dpToPx(6), 0);
        settingsBtn.setOnClickListener(v -> openRamboxAction("settings"));
        row1.addView(settingsBtn);

        TextView closeBtn = new TextView(this);
        closeBtn.setText("✕");
        closeBtn.setTextColor(Color.parseColor("#64748b"));
        closeBtn.setTextSize(11);
        closeBtn.setPadding(dpToPx(4), 0, dpToPx(2), 0);
        closeBtn.setOnClickListener(v -> collapseIsland());
        row1.addView(closeBtn);
        cornerExpandedLayout.addView(row1);

        // ROW 2: Service Capsule (App Icon + Name) -> Click opens Rambox!
        LinearLayout row2 = new LinearLayout(this);
        row2.setOrientation(LinearLayout.HORIZONTAL);
        row2.setGravity(Gravity.CENTER_VERTICAL);
        row2.setPadding(dpToPx(6), dpToPx(4), dpToPx(6), dpToPx(4));
        GradientDrawable pillBg = new GradientDrawable();
        pillBg.setColor(Color.parseColor("#1e1e32"));
        pillBg.setCornerRadius(dpToPx(10));
        row2.setBackground(pillBg);
        LinearLayout.LayoutParams r2Params = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, 
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        r2Params.setMargins(0, dpToPx(4), 0, dpToPx(4));
        row2.setLayoutParams(r2Params);

        cornerIconIv = new ImageView(this);
        cornerIconIv.setLayoutParams(new LinearLayout.LayoutParams(dpToPx(16), dpToPx(16)));
        cornerIconIv.setImageDrawable(getAppIcon());
        row2.addView(cornerIconIv);

        cornerTitleTv = new TextView(this);
        cornerTitleTv.setText(currentAppName);
        cornerTitleTv.setTextColor(Color.WHITE);
        cornerTitleTv.setTextSize(11);
        cornerTitleTv.setTypeface(Typeface.DEFAULT_BOLD);
        cornerTitleTv.setSingleLine(true);
        cornerTitleTv.setPadding(dpToPx(6), 0, 0, 0);
        row2.addView(cornerTitleTv);

        row2.setOnClickListener(v -> {
            bringRamboxToFront();
            collapseIsland();
        });
        cornerExpandedLayout.addView(row2);

        // ROW 3: Navigation Controls (‹ Prev | Next ›)
        LinearLayout row3 = new LinearLayout(this);
        row3.setOrientation(LinearLayout.HORIZONTAL);
        row3.setGravity(Gravity.CENTER);
        row3.setLayoutParams(new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, 
            LinearLayout.LayoutParams.WRAP_CONTENT
        ));

        TextView prevBtn = new TextView(this);
        prevBtn.setText("‹ Prev");
        prevBtn.setTextColor(Color.parseColor("#cbd5e1"));
        prevBtn.setTextSize(10);
        prevBtn.setTypeface(Typeface.DEFAULT_BOLD);
        prevBtn.setPadding(dpToPx(12), dpToPx(3), dpToPx(12), dpToPx(3));
        prevBtn.setOnClickListener(v -> {
            navigateService("prev");
            resetAutoCollapseTimer();
        });
        row3.addView(prevBtn);

        TextView nextBtn = new TextView(this);
        nextBtn.setText("Next ›");
        nextBtn.setTextColor(Color.parseColor("#cbd5e1"));
        nextBtn.setTextSize(10);
        nextBtn.setTypeface(Typeface.DEFAULT_BOLD);
        nextBtn.setPadding(dpToPx(12), dpToPx(3), dpToPx(12), dpToPx(3));
        nextBtn.setOnClickListener(v -> {
            navigateService("next");
            resetAutoCollapseTimer();
        });
        row3.addView(nextBtn);

        cornerExpandedLayout.addView(row3);

        floatingView.addView(cornerExpandedLayout);
    }

    private Drawable getAppIcon() {
        if (currentPackageName != null && !currentPackageName.isEmpty()) {
            try {
                PackageManager pm = getPackageManager();
                Drawable d = pm.getApplicationIcon(currentPackageName);
                if (d != null) return d;
            } catch (Exception ignored) {}
        }
        return getResources().getDrawable(R.mipmap.ic_launcher);
    }

    // =========================================================================
    // EXPAND & COLLAPSE ANIMATIONS (Smooth fluid transitions)
    // =========================================================================
    public void expandIsland() {
        if (isExpanded) return;
        isExpanded = true;
        collapseHandler.removeCallbacks(autoCollapseRunnable);

        if (boundsAnimator != null && boundsAnimator.isRunning()) {
            boundsAnimator.cancel();
        }

        int startW = params.width;
        int startH = params.height;
        int startX = params.x;
        int startY = params.y;

        int targetW = getTargetWidth();
        int targetH = getTargetHeight();
        int targetX = getTargetX();
        int targetY = getTargetY();

        showExpandedUI();
        animateBounds(startW, targetW, startH, targetH, startX, targetX, startY, targetY, this::resetAutoCollapseTimer);
    }

    public void collapseIsland() {
        if (!isExpanded) return;
        isExpanded = false;
        collapseHandler.removeCallbacks(autoCollapseRunnable);

        if (boundsAnimator != null && boundsAnimator.isRunning()) {
            boundsAnimator.cancel();
        }

        int startW = params.width;
        int startH = params.height;
        int startX = params.x;
        int startY = params.y;

        int targetW = getTargetWidth();
        int targetH = getTargetHeight();
        int targetX = getTargetX();
        int targetY = getTargetY();

        animateBounds(startW, targetW, startH, targetH, startX, targetX, startY, targetY, this::showIdleUI);
    }

    private void resetAutoCollapseTimer() {
        collapseHandler.removeCallbacks(autoCollapseRunnable);
        collapseHandler.postDelayed(autoCollapseRunnable, 4500);
    }

    private void animateBounds(int fromW, int toW, int fromH, int toH, int fromX, int toX, int fromY, int toY, Runnable onEnd) {
        boundsAnimator = ValueAnimator.ofFloat(0f, 1f);
        boundsAnimator.setDuration(240);
        boundsAnimator.setInterpolator(new DecelerateInterpolator());
        boundsAnimator.addUpdateListener(animation -> {
            float frac = animation.getAnimatedFraction();
            params.width = (int) (fromW + (toW - fromW) * frac);
            params.height = (int) (fromH + (toH - fromH) * frac);
            params.x = (int) (fromX + (toX - fromX) * frac);
            params.y = (int) (fromY + (toY - fromY) * frac);
            try {
                if (isViewAdded && windowManager != null && floatingView != null) {
                    windowManager.updateViewLayout(floatingView, params);
                }
            } catch (Exception ignored) {}
        });
        boundsAnimator.addListener(new AnimatorListenerAdapter() {
            @Override
            public void onAnimationEnd(Animator animation) {
                if (onEnd != null) onEnd.run();
            }
        });
        boundsAnimator.start();
    }

    private void bringRamboxToFront() {
        try {
            Intent intent = new Intent(this, MainActivity.class);
            intent.setAction("ACTION_OPEN_RAMBOX");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent pi = PendingIntent.getActivity(
                this,
                99,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
            );
            try {
                pi.send();
            } catch (Exception ignored) {
                startActivity(intent);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error bringing Rambox to front", e);
        }
    }

    private void openRamboxAction(String action) {
        try {
            Intent intent = new Intent(this, MainActivity.class);
            intent.setAction("ACTION_RAMBOX_ACTION");
            intent.putExtra("RAMBOX_ACTION", action);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent pi = PendingIntent.getActivity(
                this,
                97,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
            );
            try {
                pi.send();
            } catch (Exception ignored) {
                startActivity(intent);
            }
            collapseIsland();
        } catch (Exception e) {
            Log.e(TAG, "Error opening Rambox action from floating island", e);
        }
    }

    private void navigateService(String direction) {
        try {
            Intent intent = new Intent(this, MainActivity.class);
            intent.setAction("ACTION_NAVIGATE_APP");
            intent.putExtra("DIRECTION", direction);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent pi = PendingIntent.getActivity(
                this,
                98,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
            );
            try {
                pi.send();
            } catch (Exception ignored) {
                startActivity(intent);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error navigating service from floating island", e);
        }
    }

    private void updateViewData() {
        Drawable icon = getAppIcon();
        if (centerTitleTv != null) {
            centerTitleTv.setText((currentAppName != null && !currentAppName.isEmpty()) ? currentAppName : "Rambox");
        }
        if (centerIconIv != null) {
            centerIconIv.setImageDrawable(icon);
        }
        if (cornerTitleTv != null) {
            cornerTitleTv.setText((currentAppName != null && !currentAppName.isEmpty()) ? currentAppName : "Rambox");
        }
        if (cornerIconIv != null) {
            cornerIconIv.setImageDrawable(icon);
        }
    }

    public void showFloatingView() {
        if (floatingView == null || windowManager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
            Log.w(TAG, "Cannot show floating view: Overlay permission (canDrawOverlays) is NOT granted.");
            return;
        }
        try {
            updateViewData();
            if (!isViewAdded || floatingView.getParent() == null) {
                windowManager.addView(floatingView, params);
                isViewAdded = true;
            }
            floatingView.setVisibility(View.VISIBLE);
        } catch (Exception e) {
            Log.e(TAG, "Error adding/showing floating view", e);
        }
    }

    public void hideFloatingView() {
        if (floatingView != null && isViewAdded) {
            try {
                floatingView.setVisibility(View.GONE);
            } catch (Exception ignored) {}
        }
    }

    private int dpToPx(float dp) {
        DisplayMetrics metrics = getResources().getDisplayMetrics();
        return (int) (dp * metrics.density + 0.5f);
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        collapseHandler.removeCallbacks(autoCollapseRunnable);
        if (boundsAnimator != null && boundsAnimator.isRunning()) {
            boundsAnimator.cancel();
        }
        if (floatingView != null && isViewAdded && windowManager != null) {
            try {
                windowManager.removeView(floatingView);
            } catch (Exception ignored) {}
            isViewAdded = false;
        }
    }
}
