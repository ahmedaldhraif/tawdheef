/* Shared public-site theme, applied before paint. No app settings are read. */
(() => {
  const key = 'tawdheef-docs-theme';
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const readPreference = () => {
    let saved;
    try { saved = localStorage.getItem(key); } catch {}
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  };
  let preference = readPreference();
  function apply() {
    const theme = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
    document.documentElement.dataset.docsTheme = theme;
    document.documentElement.dataset.themePreference = preference;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#111110' : '#ffffff');
    window.dispatchEvent(new CustomEvent('tawdheef:themechange', { detail: { theme, preference } }));
  }
  function setPreference(next) {
    if (!['light', 'dark', 'system'].includes(next)) return;
    preference = next;
    try {
      if (next === 'system') localStorage.removeItem(key);
      else localStorage.setItem(key, next);
    } catch {}
    apply();
  }
  window.tawdheefTheme = {
    setPreference,
    getPreference: () => preference,
    getTheme: () => document.documentElement.dataset.docsTheme,
  };
  const systemChanged = () => { if (preference === 'system') apply(); };
  if (media.addEventListener) media.addEventListener('change', systemChanged);
  else media.addListener(systemChanged);
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) {
      preference = readPreference();
      apply();
    }
  });
  apply();
})();
