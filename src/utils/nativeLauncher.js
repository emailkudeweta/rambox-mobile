/**
 * Utility for detecting installed Android applications and launching them directly.
 */

export function getInstalledPackage(app) {
  if (!window.RamboxNative || !app) return null;

  // 1. Direct packageName check
  if (app.packageName) {
    try {
      if (window.RamboxNative.isPackageInstalled(app.packageName)) {
        return app.packageName;
      }
    } catch (e) {
      console.warn('isPackageInstalled error for', app.packageName, e);
    }
  }

  // 2. Fallback variants check (e.g. WhatsApp Business, Lite versions)
  if (Array.isArray(app.fallbackPackageNames)) {
    for (const pkg of app.fallbackPackageNames) {
      try {
        if (window.RamboxNative.isPackageInstalled(pkg)) {
          return pkg;
        }
      } catch (e) {
        console.warn('isPackageInstalled error for fallback', pkg, e);
      }
    }
  }

  return null;
}

export function isAppNativelyInstalled(app) {
  return Boolean(getInstalledPackage(app));
}

export function launchAppDirectly(app) {
  const pkg = getInstalledPackage(app);
  if (pkg && window.RamboxNative) {
    try {
      window.RamboxNative.launchPackage(pkg, app.url || '');
      return true;
    } catch (e) {
      console.error('launchAppDirectly error for', app.name, e);
    }
  }
  return false;
}
