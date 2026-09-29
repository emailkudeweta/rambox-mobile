// src/utils/icon.js

export const getSafeDomain = (url) => {
  if (!url) return 'google.com';
  try { return new URL(url).hostname; } catch (e) { return 'google.com'; }
};

export const getAppIcon = (app) => {
  if (!app) return '';
  if (app.iconPath && app.iconPath.startsWith('data:')) return app.iconPath;

  // Pemetaan manual untuk nama aplikasi yang tidak sama dengan nama file icon-nya
  const nameToIconMap = {
    'messenger': 'facebook-messanger',
    'microsoft edge': 'edge',
    'cc sampling+': 'cc-sampling-plus',
    '500px': 'px',
    'apple': 'apple'
  };

  if (app.name) {
    let baseName = app.name.toLowerCase().trim();
    
    if (nameToIconMap[baseName]) {
      baseName = nameToIconMap[baseName];
    } else {
      // Hilangkan karakter khusus dan spasi jadi dash
      baseName = baseName.replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }
    return `./Icon/${baseName}.ico`;
  }
  
  return `https://www.google.com/s2/favicons?domain=${getSafeDomain(app.url)}&sz=128`;
};
