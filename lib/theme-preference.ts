export type Theme = 'light' | 'dark';
export function readTheme(cookie: string, storage?: Pick<Storage, 'getItem'>): Theme {
  const value = cookie.match(/(?:^|;\s*)director_theme=(light|dark)(?:;|$)/)?.[1];
  if (value) return value as Theme;
  try { return storage?.getItem('director-theme') === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
}
export function saveTheme(theme: Theme, storage: Pick<Storage, 'setItem'> | undefined, cookie: (value: string) => void) {
  try { storage?.setItem('director-theme', theme); } catch { /* Cookie remains a fallback. */ }
  try { cookie(`director_theme=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`); } catch { /* Switching still works without persistence. */ }
}
// Runs before paint; the host-scoped cookie also survives the desktop's changing port.
export const themeBootstrap = `(function(){var t='light';try{var c=document.cookie.match(/(?:^|;\\s*)director_theme=(light|dark)(?:;|$)/);t=c?c[1]:localStorage.getItem('director-theme')||'light'}catch(e){}document.documentElement.classList.toggle('dark',t==='dark')})()`;
