package com.rambox.mobile;

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
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.IBinder;
import android.provider.Settings;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

public class FloatingIslandService extends Service {
    private static final String TAG = "RamboxFloatingIsland";
    public static final String CHANNEL_ID = "rambox_floating_island_channel";
    public static final int NOTIFICATION_ID = 2002;

    public static final String ACTION_SHOW = "com.rambox.mobile.ACTION_SHOW_ISLAND";
    public static final String ACTION_HIDE = "com.rambox.mobile.ACTION_HIDE_ISLAND";
    public static final String EXTRA_APP_NAME = "EXTRA_APP_NAME";
    public static final String EXTRA_PACKAGE_NAME = "EXTRA_PACKAGE_NAME";

    private WindowManager windowManager;
    private View floatingView;
    private WindowManager.LayoutParams params;
    private boolean isViewAdded = false;

    private TextView titleTextView;
    private ImageView iconImageView;
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
        initLayoutParams();
        buildFloatingView();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String action = intent.getAction();
            if (ACTION_HIDE.equals(action)) {
                hideFloatingView();
            } else if (ACTION_SHOW.equals(action) || action == null) {
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
            }
        }
        return START_STICKY;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Rambox Dynamic Island",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Dynamic Island mengapung di atas aplikasi lain");
            channel.setSound(null, null);
            channel.enableVibration(false);

            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private void startForegroundServiceNotification() {
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            0,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Rambox Dynamic Island Aktif")
            .setContentText("Dynamic Island siap digunakan di atas aplikasi")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void initLayoutParams() {
        int layoutType;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            layoutType = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;
        } else {
            layoutType = WindowManager.LayoutParams.TYPE_PHONE;
        }

        params = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            layoutType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        );

        params.gravity = Gravity.TOP | Gravity.START;

        // Restore saved position or default to top-center
        SharedPreferences prefs = getSharedPreferences("rambox_island_overlay", MODE_PRIVATE);
        DisplayMetrics dm = getResources().getDisplayMetrics();
        int defaultX = Math.max(20, (dm.widthPixels - dpToPx(240)) / 2);
        int defaultY = dpToPx(35);

        params.x = prefs.getInt("pos_x", defaultX);
        params.y = prefs.getInt("pos_y", defaultY);
    }

    private void buildFloatingView() {
        // Outer Capsule Layout (Matches React Dynamic Island: bg-[#181828]/95, border border-white/20)
        LinearLayout capsuleLayout = new LinearLayout(this);
        capsuleLayout.setOrientation(LinearLayout.HORIZONTAL);
        capsuleLayout.setGravity(Gravity.CENTER_VERTICAL);
        capsuleLayout.setPadding(dpToPx(10), dpToPx(6), dpToPx(10), dpToPx(6));

        GradientDrawable capsuleBg = new GradientDrawable();
        capsuleBg.setColor(Color.parseColor("#181828"));
        capsuleBg.setCornerRadius(dpToPx(24));
        capsuleBg.setStroke(dpToPx(1.2f), Color.parseColor("#383854"));
        capsuleLayout.setBackground(capsuleBg);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            capsuleLayout.setElevation(dpToPx(10));
        }

        // 1. Drag Grip indicator (⋮⋮)
        TextView gripView = new TextView(this);
        gripView.setText("⋮⋮");
        gripView.setTextColor(Color.parseColor("#64748b"));
        gripView.setTextSize(14);
        gripView.setTypeface(Typeface.DEFAULT_BOLD);
        gripView.setPadding(dpToPx(2), 0, dpToPx(6), 0);
        capsuleLayout.addView(gripView);

        // 2. Prev Button (‹)
        TextView prevButton = new TextView(this);
        prevButton.setText("‹");
        prevButton.setTextColor(Color.parseColor("#cbd5e1"));
        prevButton.setTextSize(18);
        prevButton.setTypeface(Typeface.DEFAULT_BOLD);
        prevButton.setPadding(dpToPx(6), dpToPx(2), dpToPx(6), dpToPx(2));
        prevButton.setOnClickListener(v -> navigateService("prev"));
        capsuleLayout.addView(prevButton);

        // 3. Center Capsule: Icon + App Name + Emerald Dot (Click brings Rambox back!)
        LinearLayout centerPill = new LinearLayout(this);
        centerPill.setOrientation(LinearLayout.HORIZONTAL);
        centerPill.setGravity(Gravity.CENTER_VERTICAL);
        centerPill.setPadding(dpToPx(8), dpToPx(4), dpToPx(8), dpToPx(4));

        GradientDrawable centerBg = new GradientDrawable();
        centerBg.setColor(Color.parseColor("#222238"));
        centerBg.setCornerRadius(dpToPx(14));
        centerPill.setBackground(centerBg);

        // App Icon
        iconImageView = new ImageView(this);
        LinearLayout.LayoutParams iconParams = new LinearLayout.LayoutParams(dpToPx(18), dpToPx(18));
        iconParams.setMargins(0, 0, dpToPx(6), 0);
        iconImageView.setLayoutParams(iconParams);
        iconImageView.setScaleType(ImageView.ScaleType.FIT_CENTER);
        centerPill.addView(iconImageView);

        // App Name
        titleTextView = new TextView(this);
        titleTextView.setText(currentAppName);
        titleTextView.setTextColor(Color.WHITE);
        titleTextView.setTextSize(12);
        titleTextView.setTypeface(Typeface.DEFAULT_BOLD);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        titleParams.setMargins(0, 0, dpToPx(6), 0);
        titleTextView.setLayoutParams(titleParams);
        centerPill.addView(titleTextView);

        // Emerald status dot
        View dotView = new View(this);
        GradientDrawable dotBg = new GradientDrawable();
        dotBg.setColor(Color.parseColor("#10b981"));
        dotBg.setShape(GradientDrawable.OVAL);
        dotView.setBackground(dotBg);
        LinearLayout.LayoutParams dotParams = new LinearLayout.LayoutParams(dpToPx(7), dpToPx(7));
        dotView.setLayoutParams(dotParams);
        centerPill.addView(dotView);

        centerPill.setOnClickListener(v -> bringRamboxToFront());
        capsuleLayout.addView(centerPill);

        // 4. Next Button (›)
        TextView nextButton = new TextView(this);
        nextButton.setText("›");
        nextButton.setTextColor(Color.parseColor("#cbd5e1"));
        nextButton.setTextSize(18);
        nextButton.setTypeface(Typeface.DEFAULT_BOLD);
        nextButton.setPadding(dpToPx(6), dpToPx(2), dpToPx(6), dpToPx(2));
        nextButton.setOnClickListener(v -> navigateService("next"));
        capsuleLayout.addView(nextButton);

        // 5. Close/Dismiss Button (✕)
        TextView closeBtn = new TextView(this);
        closeBtn.setText("✕");
        closeBtn.setTextColor(Color.parseColor("#64748b"));
        closeBtn.setTextSize(11);
        closeBtn.setPadding(dpToPx(4), dpToPx(2), dpToPx(4), dpToPx(2));
        LinearLayout.LayoutParams closeParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        closeParams.setMargins(dpToPx(4), 0, 0, 0);
        closeBtn.setLayoutParams(closeParams);
        closeBtn.setOnClickListener(v -> hideFloatingView());
        capsuleLayout.addView(closeBtn);

        floatingView = capsuleLayout;

        // Smooth Drag Listener
        floatingView.setOnTouchListener(new View.OnTouchListener() {
            private int initialX, initialY;
            private float initialTouchX, initialTouchY;
            private boolean isMoving = false;

            @Override
            public boolean onTouch(View v, MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        initialX = params.x;
                        initialY = params.y;
                        initialTouchX = event.getRawX();
                        initialTouchY = event.getRawY();
                        isMoving = false;
                        return false;

                    case MotionEvent.ACTION_MOVE:
                        int dx = (int) (event.getRawX() - initialTouchX);
                        int dy = (int) (event.getRawY() - initialTouchY);
                        if (Math.hypot(dx, dy) > dpToPx(6)) {
                            isMoving = true;
                            params.x = initialX + dx;
                            params.y = initialY + dy;
                            try {
                                if (isViewAdded && windowManager != null) {
                                    windowManager.updateViewLayout(floatingView, params);
                                }
                            } catch (Exception ignored) {}
                            return true;
                        }
                        return false;

                    case MotionEvent.ACTION_UP:
                        if (isMoving) {
                            SharedPreferences prefs = getSharedPreferences("rambox_island_overlay", MODE_PRIVATE);
                            prefs.edit().putInt("pos_x", params.x).putInt("pos_y", params.y).apply();
                            return true;
                        }
                        return false;
                }
                return false;
            }
        });

        updateViewData();
    }

    private void updateViewData() {
        if (titleTextView != null) {
            titleTextView.setText(currentAppName);
        }
        if (iconImageView != null) {
            Drawable icon = null;
            if (currentPackageName != null && !currentPackageName.isEmpty()) {
                try {
                    PackageManager pm = getPackageManager();
                    icon = pm.getApplicationIcon(currentPackageName);
                } catch (Exception ignored) {}
            }
            if (icon == null) {
                icon = getResources().getDrawable(R.mipmap.ic_launcher);
            }
            iconImageView.setImageDrawable(icon);
        }
    }

    private void bringRamboxToFront() {
        try {
            Intent intent = new Intent(this, MainActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            startActivity(intent);
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
            startActivity(intent);
        } catch (Exception e) {
            Log.e(TAG, "Error navigating service from floating island", e);
        }
    }

    public void showFloatingView() {
        if (floatingView == null || windowManager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
            return;
        }
        try {
            if (!isViewAdded) {
                windowManager.addView(floatingView, params);
                isViewAdded = true;
            } else {
                floatingView.setVisibility(View.VISIBLE);
            }
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
        if (floatingView != null && isViewAdded && windowManager != null) {
            try {
                windowManager.removeView(floatingView);
            } catch (Exception ignored) {}
            isViewAdded = false;
        }
    }
}
