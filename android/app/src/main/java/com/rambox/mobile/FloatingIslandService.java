package com.rambox.mobile;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.IBinder;
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
    public static final String CHANNEL_ID = "rambox_floating_channel";
    public static final int NOTIFICATION_ID = 2001;

    private WindowManager windowManager;
    private View floatingView;
    private WindowManager.LayoutParams params;
    public static boolean isRunning = false;

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        isRunning = true;
        createNotificationChannel();
        startForegroundServiceNotification();
        showFloatingBubble();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Rambox Floating Island",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Menampilkan Dynamic Island melayang di atas aplikasi lain");
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
            .setContentText("Ketuk pil melayang di layar untuk kembali ke Rambox")
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void showFloatingBubble() {
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        if (windowManager == null) return;

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
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        );

        params.gravity = Gravity.TOP | Gravity.START;
        params.x = 40;
        params.y = 120;

        // Create the sleek pill widget programmatically
        LinearLayout pillLayout = new LinearLayout(this);
        pillLayout.setOrientation(LinearLayout.HORIZONTAL);
        pillLayout.setGravity(Gravity.CENTER_VERTICAL);
        pillLayout.setPadding(dpToPx(14), dpToPx(8), dpToPx(14), dpToPx(8));

        // Dark glass background with cyan/blue accent border
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#141420"));
        bg.setCornerRadius(dpToPx(28));
        bg.setStroke(dpToPx(1.5f), Color.parseColor("#3b82f6"));
        pillLayout.setBackground(bg);
        pillLayout.setElevation(dpToPx(8));

        // Glowing indicator dot
        View dot = new View(this);
        GradientDrawable dotBg = new GradientDrawable();
        dotBg.setColor(Color.parseColor("#10b981"));
        dotBg.setShape(GradientDrawable.OVAL);
        dot.setBackground(dotBg);
        LinearLayout.LayoutParams dotParams = new LinearLayout.LayoutParams(dpToPx(8), dpToPx(8));
        dotParams.setMargins(0, 0, dpToPx(10), 0);
        pillLayout.addView(dot, dotParams);

        // "Rambox" text
        TextView titleText = new TextView(this);
        titleText.setText("Rambox");
        titleText.setTextColor(Color.WHITE);
        titleText.setTextSize(13);
        titleText.setTypeface(Typeface.DEFAULT_BOLD);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        titleParams.setMargins(0, 0, dpToPx(10), 0);
        pillLayout.addView(titleText, titleParams);

        // Return Arrow icon (←)
        TextView returnIcon = new TextView(this);
        returnIcon.setText("↩");
        returnIcon.setTextColor(Color.parseColor("#93c5fd"));
        returnIcon.setTextSize(14);
        returnIcon.setTypeface(Typeface.DEFAULT_BOLD);
        LinearLayout.LayoutParams iconParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        iconParams.setMargins(0, 0, dpToPx(10), 0);
        pillLayout.addView(returnIcon, iconParams);

        // Small Close button (×)
        TextView closeBtn = new TextView(this);
        closeBtn.setText("✕");
        closeBtn.setTextColor(Color.parseColor("#9ca3af"));
        closeBtn.setTextSize(12);
        closeBtn.setPadding(dpToPx(4), dpToPx(2), dpToPx(4), dpToPx(2));
        closeBtn.setOnClickListener(v -> stopSelf());
        pillLayout.addView(closeBtn);

        floatingView = pillLayout;

        // Dragging & Click Handling
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
                        return true;

                    case MotionEvent.ACTION_MOVE:
                        int dx = (int) (event.getRawX() - initialTouchX);
                        int dy = (int) (event.getRawY() - initialTouchY);
                        if (Math.hypot(dx, dy) > 10) {
                            isMoving = true;
                            params.x = initialX + dx;
                            params.y = initialY + dy;
                            try {
                                windowManager.updateViewLayout(floatingView, params);
                            } catch (Exception ignored) {}
                        }
                        return true;

                    case MotionEvent.ACTION_UP:
                        if (!isMoving) {
                            // Tap detected: Bring Rambox MainActivity back to foreground!
                            Intent openIntent = new Intent(FloatingIslandService.this, MainActivity.class);
                            openIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                            startActivity(openIntent);
                        }
                        return true;
                }
                return false;
            }
        });

        try {
            windowManager.addView(floatingView, params);
        } catch (Exception e) {
            Log.e(TAG, "Error adding floating view", e);
        }
    }

    private int dpToPx(float dp) {
        DisplayMetrics metrics = getResources().getDisplayMetrics();
        return (int) (dp * metrics.density + 0.5f);
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        isRunning = false;
        if (floatingView != null && windowManager != null) {
            try {
                windowManager.removeView(floatingView);
            } catch (Exception ignored) {}
            floatingView = null;
        }
    }
}
