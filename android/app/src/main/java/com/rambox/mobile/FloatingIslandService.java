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

    private CameraPosition cameraPosition = CameraPosition.CENTER;
    private int cameraCenterX = -1;
    private int cameraCenterY = -1;
    private int cameraWidth = 0;
    private int cameraHeight = 0;
    private int manualOffsetX = 0;
    private int manualOffsetY = 0;

    private boolean isExpanded = false;
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
        buildFloatingView();
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

        // Allow entering system status bar and display cutout area!
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
                ? Math.max(dpToPx(56), cameraWidth + dpToPx(22))
                : Math.max(dpToPx(46), cameraWidth + dpToPx(16));
        } else {
            return (cameraPosition == CameraPosition.CENTER) ? dpToPx(245) : dpToPx(185);
        }
    }

    private int getTargetHeight() {
        if (!isExpanded) {
            return Math.max(dpToPx(28), cameraHeight + dpToPx(8));
        } else {
            return (cameraPosition == CameraPosition.CENTER) ? dpToPx(34) : dpToPx(78);
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
            // For corner cameras, anchor top to camera cutout and expand downward!
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

    private void buildFloatingView() {
        floatingView = new FrameLayout(this);

        // Apply Cutout insets listener dynamically when attached
        floatingView.setOnApplyWindowInsetsListener((v, insets) -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                DisplayCutout cutout = insets.getDisplayCutout();
                if (cutout != null) {
                    applyCutout(cutout);
                    rebuildContent();
                    if (isViewAdded && windowManager != null) {
                        try {
                            windowManager.updateViewLayout(floatingView, params);
                        } catch (Exception ignored) {}
                    }
                }
            }
            return insets;
        });

        rebuildContent();
    }

    private void rebuildContent() {
        floatingView.removeAllViews();

        GradientDrawable capsuleBg = new GradientDrawable();
        capsuleBg.setColor(Color.parseColor("#050508")); // AMOLED deep black
        capsuleBg.setCornerRadius(isExpanded && cameraPosition != CameraPosition.CENTER ? dpToPx(18) : dpToPx(24));
        capsuleBg.setStroke(dpToPx(1f), Color.parseColor("#2a2a3e"));
        floatingView.setBackground(capsuleBg);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            floatingView.setElevation(dpToPx(12));
        }

        if (!isExpanded) {
            buildIdleView();
        } else {
            if (cameraPosition == CameraPosition.CENTER) {
                buildExpandedCenterView();
            } else {
                buildExpandedCornerView();
            }
        }
    }

    // =========================================================================
    // 1. IDLE VIEW (Miniature pill wrapping camera punch hole)
    // =========================================================================
    private void buildIdleView() {
        LinearLayout idleLayout = new LinearLayout(this);
        idleLayout.setOrientation(LinearLayout.HORIZONTAL);
        idleLayout.setGravity(Gravity.CENTER);
        idleLayout.setLayoutParams(new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, 
            FrameLayout.LayoutParams.MATCH_PARENT
        ));

        // Pulsing emerald status dot
        View dotView = new View(this);
        GradientDrawable dotBg = new GradientDrawable();
        dotBg.setColor(Color.parseColor("#10b981"));
        dotBg.setShape(GradientDrawable.OVAL);
        dotView.setBackground(dotBg);
        LinearLayout.LayoutParams dotParams = new LinearLayout.LayoutParams(dpToPx(6), dpToPx(6));
        dotParams.setMargins(dpToPx(2), 0, dpToPx(2), 0);
        dotView.setLayoutParams(dotParams);
        idleLayout.addView(dotView);

        // Tap on Idle expands the Dynamic Island!
        idleLayout.setOnClickListener(v -> expandIsland());

        attachDragListener(idleLayout);
        floatingView.addView(idleLayout);
    }

    // =========================================================================
    // 2. EXPANDED VIEW: CENTER CAMERA (Melebar ke Samping / Horizontal)
    // =========================================================================
    private void buildExpandedCenterView() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.HORIZONTAL);
        layout.setGravity(Gravity.CENTER_VERTICAL);
        layout.setPadding(dpToPx(6), dpToPx(3), dpToPx(6), dpToPx(3));
        layout.setLayoutParams(new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, 
            FrameLayout.LayoutParams.MATCH_PARENT
        ));

        // 1. Prev Button (‹)
        TextView prevButton = new TextView(this);
        prevButton.setText("‹");
        prevButton.setTextColor(Color.parseColor("#cbd5e1"));
        prevButton.setTextSize(17);
        prevButton.setTypeface(Typeface.DEFAULT_BOLD);
        prevButton.setPadding(dpToPx(6), dpToPx(1), dpToPx(6), dpToPx(1));
        prevButton.setOnClickListener(v -> {
            navigateService("prev");
            resetAutoCollapseTimer();
        });
        layout.addView(prevButton);

        // 2. Center Pill (Icon + App Name + Dot) -> Clicking opens Rambox!
        LinearLayout centerPill = new LinearLayout(this);
        centerPill.setOrientation(LinearLayout.HORIZONTAL);
        centerPill.setGravity(Gravity.CENTER_VERTICAL);
        centerPill.setPadding(dpToPx(7), dpToPx(3), dpToPx(7), dpToPx(3));
        GradientDrawable centerBg = new GradientDrawable();
        centerBg.setColor(Color.parseColor("#1a1a2c"));
        centerBg.setCornerRadius(dpToPx(14));
        centerPill.setBackground(centerBg);
        LinearLayout.LayoutParams pillLp = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.0f);
        centerPill.setLayoutParams(pillLp);

        ImageView iconIv = new ImageView(this);
        iconIv.setLayoutParams(new LinearLayout.LayoutParams(dpToPx(17), dpToPx(17)));
        iconIv.setImageDrawable(getAppIcon());
        centerPill.addView(iconIv);

        TextView titleTv = new TextView(this);
        titleTv.setText(currentAppName);
        titleTv.setTextColor(Color.WHITE);
        titleTv.setTextSize(11);
        titleTv.setTypeface(Typeface.DEFAULT_BOLD);
        titleTv.setSingleLine(true);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.0f);
        titleParams.setMargins(dpToPx(5), 0, dpToPx(5), 0);
        titleTv.setLayoutParams(titleParams);
        centerPill.addView(titleTv);

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
        layout.addView(centerPill);

        // 3. Next Button (›)
        TextView nextButton = new TextView(this);
        nextButton.setText("›");
        nextButton.setTextColor(Color.parseColor("#cbd5e1"));
        nextButton.setTextSize(17);
        nextButton.setTypeface(Typeface.DEFAULT_BOLD);
        nextButton.setPadding(dpToPx(6), dpToPx(1), dpToPx(6), dpToPx(1));
        nextButton.setOnClickListener(v -> {
            navigateService("next");
            resetAutoCollapseTimer();
        });
        layout.addView(nextButton);

        // 4. Close/Collapse Button (✕)
        TextView closeBtn = new TextView(this);
        closeBtn.setText("✕");
        closeBtn.setTextColor(Color.parseColor("#64748b"));
        closeBtn.setTextSize(10);
        closeBtn.setPadding(dpToPx(4), dpToPx(2), dpToPx(4), dpToPx(2));
        closeBtn.setOnClickListener(v -> collapseIsland());
        layout.addView(closeBtn);

        attachDragListener(layout);
        floatingView.addView(layout);
    }

    // =========================================================================
    // 3. EXPANDED VIEW: CORNER CAMERA (Melebar ke Bawah / Vertical Dropdown)
    // =========================================================================
    private void buildExpandedCornerView() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(dpToPx(8), dpToPx(6), dpToPx(8), dpToPx(6));
        layout.setLayoutParams(new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, 
            FrameLayout.LayoutParams.MATCH_PARENT
        ));

        // ROW 1: Header (Mini Punch Indicator + Dot + Close)
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

        TextView closeBtn = new TextView(this);
        closeBtn.setText("✕");
        closeBtn.setTextColor(Color.parseColor("#64748b"));
        closeBtn.setTextSize(10);
        closeBtn.setPadding(dpToPx(4), 0, dpToPx(2), 0);
        closeBtn.setOnClickListener(v -> collapseIsland());
        row1.addView(closeBtn);
        layout.addView(row1);

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

        ImageView iconIv = new ImageView(this);
        iconIv.setLayoutParams(new LinearLayout.LayoutParams(dpToPx(16), dpToPx(16)));
        iconIv.setImageDrawable(getAppIcon());
        row2.addView(iconIv);

        TextView titleTv = new TextView(this);
        titleTv.setText(currentAppName);
        titleTv.setTextColor(Color.WHITE);
        titleTv.setTextSize(11);
        titleTv.setTypeface(Typeface.DEFAULT_BOLD);
        titleTv.setSingleLine(true);
        titleTv.setPadding(dpToPx(6), 0, 0, 0);
        row2.addView(titleTv);

        row2.setOnClickListener(v -> {
            bringRamboxToFront();
            collapseIsland();
        });
        layout.addView(row2);

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
        prevBtn.setPadding(dpToPx(10), dpToPx(2), dpToPx(10), dpToPx(2));
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
        nextBtn.setPadding(dpToPx(10), dpToPx(2), dpToPx(10), dpToPx(2));
        nextBtn.setOnClickListener(v -> {
            navigateService("next");
            resetAutoCollapseTimer();
        });
        row3.addView(nextBtn);

        layout.addView(row3);

        attachDragListener(layout);
        floatingView.addView(layout);
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
    // ANIMATION EXPAND & COLLAPSE (Smooth fluid transitions)
    // =========================================================================
    public void expandIsland() {
        if (isExpanded) return;
        isExpanded = true;

        int startW = params.width;
        int startH = params.height;
        int startX = params.x;
        int startY = params.y;

        int targetW = getTargetWidth();
        int targetH = getTargetHeight();
        int targetX = getTargetX();
        int targetY = getTargetY();

        rebuildContent();

        animateBounds(startW, targetW, startH, targetH, startX, targetX, startY, targetY, null);
        resetAutoCollapseTimer();
    }

    public void collapseIsland() {
        if (!isExpanded) return;
        isExpanded = false;
        collapseHandler.removeCallbacks(autoCollapseRunnable);

        int startW = params.width;
        int startH = params.height;
        int startX = params.x;
        int startY = params.y;

        int targetW = getTargetWidth();
        int targetH = getTargetHeight();
        int targetX = getTargetX();
        int targetY = getTargetY();

        animateBounds(startW, targetW, startH, targetH, startX, targetX, startY, targetY, () -> {
            rebuildContent();
        });
    }

    private void resetAutoCollapseTimer() {
        collapseHandler.removeCallbacks(autoCollapseRunnable);
        collapseHandler.postDelayed(autoCollapseRunnable, 4500);
    }

    private void animateBounds(int fromW, int toW, int fromH, int toH, int fromX, int toX, int fromY, int toY, Runnable onEnd) {
        ValueAnimator animator = ValueAnimator.ofFloat(0f, 1f);
        animator.setDuration(220);
        animator.setInterpolator(new DecelerateInterpolator());
        animator.addUpdateListener(animation -> {
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
        animator.addListener(new AnimatorListenerAdapter() {
            @Override
            public void onAnimationEnd(Animator animation) {
                if (onEnd != null) onEnd.run();
            }
        });
        animator.start();
    }

    // =========================================================================
    // DRAG ADJUSTMENT LISTENER (For fine-tuning alignment with camera)
    // =========================================================================
    private void attachDragListener(View view) {
        view.setOnTouchListener(new View.OnTouchListener() {
            private int initialX, initialY;
            private float initialTouchX, initialTouchY;
            private boolean isDragging = false;

            @Override
            public boolean onTouch(View v, MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        initialX = params.x;
                        initialY = params.y;
                        initialTouchX = event.getRawX();
                        initialTouchY = event.getRawY();
                        isDragging = false;
                        return false;

                    case MotionEvent.ACTION_MOVE:
                        int dx = (int) (event.getRawX() - initialTouchX);
                        int dy = (int) (event.getRawY() - initialTouchY);
                        if (Math.hypot(dx, dy) > dpToPx(8)) {
                            isDragging = true;
                            params.x = initialX + dx;
                            params.y = initialY + dy;
                            try {
                                if (isViewAdded && windowManager != null && floatingView != null) {
                                    windowManager.updateViewLayout(floatingView, params);
                                }
                            } catch (Exception ignored) {}
                            return true;
                        }
                        return false;

                    case MotionEvent.ACTION_UP:
                        if (isDragging) {
                            manualOffsetX += (params.x - initialX);
                            manualOffsetY += (params.y - initialY);
                            SharedPreferences prefs = getSharedPreferences("rambox_island_overlay", MODE_PRIVATE);
                            prefs.edit()
                                .putInt("manual_offset_x", manualOffsetX)
                                .putInt("manual_offset_y", manualOffsetY)
                                .apply();
                            return true;
                        }
                        return false;
                }
                return false;
            }
        });
    }

    private void bringRamboxToFront() {
        try {
            Intent intent = new Intent(this, MainActivity.class);
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
        if (floatingView != null) {
            rebuildContent();
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
        if (floatingView != null && isViewAdded && windowManager != null) {
            try {
                windowManager.removeView(floatingView);
            } catch (Exception ignored) {}
            isViewAdded = false;
        }
    }
}
