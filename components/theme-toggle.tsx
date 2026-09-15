'use client';
import {useSyncExternalStore} from 'react';
import {Moon, Sun} from 'lucide-react';
import {saveTheme} from '@/lib/theme-preference';
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {attributes: true, attributeFilter: ['class']});
  return () => observer.disconnect();
}
const snapshot = () => document.documentElement.classList.contains('dark');
export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, snapshot, () => false);
  const theme = dark ? 'dark' : 'light';
  const toggle = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark', next === 'dark');
    let storage: Storage | undefined;
    try { storage = window.localStorage; } catch { /* Restricted storage. */ }
    saveTheme(next, storage, value => { document.cookie = value; });
  };
  const label = theme === 'light' ? '切换到深色主题' : '切换到浅色主题';
  return <button type="button" className="theme-toggle" onClick={toggle} aria-label={label} title={label} aria-pressed={theme === 'dark'}>
    {theme === 'light' ? <Moon size={17} aria-hidden="true" /> : <Sun size={17} aria-hidden="true" />}
    <span>{theme === 'light' ? '深色' : '浅色'}</span>
  </button>;
}
