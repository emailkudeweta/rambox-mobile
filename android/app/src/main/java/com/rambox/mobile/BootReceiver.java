package com.rambox.mobile;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

public class BootReceiver extends BroadcastReceiver {
    private static final String TAG = "RamboxBootReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        Log.d(TAG, "Received broadcast intent action: " + action);

        if (Intent.ACTION_BOOT_COMPLETED.equals(action) ||
            "android.intent.action.QUICKBOOT_POWERON".equals(action) ||
            "com.htc.intent.action.QUICKBOOT_POWERON".equals(action) ||
            Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {

            SharedPreferences prefs = context.getSharedPreferences("rambox_preferences", Context.MODE_PRIVATE);
            boolean autoStart = prefs.getBoolean("autoStart", true);

            if (autoStart) {
                Log.d(TAG, "AutoStart is enabled. Starting FloatingIslandService in background.");
                try {
                    Intent serviceIntent = new Intent(context, FloatingIslandService.class);
                    serviceIntent.setAction(FloatingIslandService.ACTION_KEEP_ALIVE);
                    serviceIntent.putExtra(FloatingIslandService.EXTRA_APP_NAME, "Rambox");
                    serviceIntent.putExtra(FloatingIslandService.EXTRA_PACKAGE_NAME, "");

                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        context.startForegroundService(serviceIntent);
                    } else {
                        context.startService(serviceIntent);
                    }
                    Log.d(TAG, "FloatingIslandService successfully started from BootReceiver.");
                } catch (Exception e) {
                    Log.e(TAG, "Failed to start FloatingIslandService from BootReceiver", e);
                }
            } else {
                Log.d(TAG, "AutoStart is disabled by user preference.");
            }
        }
    }
}
