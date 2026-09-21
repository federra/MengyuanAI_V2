'use client';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Clapperboard,
  Eye,
  EyeOff,
  KeyRound,
  UserRound,
  LogOut,
} from 'lucide-react';
import { ThemeToggle } from './theme-toggle';
import { accessMessages, type AccessState } from '@/lib/access';
export function AccessGate({
  children,
}: {
  children: (state: AccessState) => ReactNode;
}) {
  const [state, setState] = useState<AccessState>({ authorized: false });
  const [account, setAccount] = useState(''),
    [key, setKey] = useState(''),
    [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [remember, setRemember] = useState(false);
  const [rememberAvailable, setRememberAvailable] = useState(false);
  const [credentialsLoaded, setCredentialsLoaded] = useState(false);
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    const api = window.directorDesktop;
    if (!api?.auth) {
      queueMicrotask(() => setDesktop(false));
      return;
    }
    let disposed = false;
    void api.auth('credentials-load').then(result=>{
      if(disposed)return;
      const saved=result as {account?:string;key?:string;available?:boolean;error?:string};
      setRememberAvailable(!!saved.available);setRemember(!!saved.account&&!!saved.key);
      if(saved.account)setAccount(saved.account);if(saved.key)setKey(saved.key);
      if(saved.error)setError(saved.error);
    }).catch(()=>{}).finally(()=>{if(!disposed)setCredentialsLoaded(true);});
    let polling = false;
    const accept = (next: AccessState) => {
      if (!disposed) {
        setState(next);
        if (next.code && next.code !== 'UNAUTHENTICATED')
          setError(accessMessages[next.code] || '授权检查失败，请重新登录。');
        else if (next.authorized) setError('');
      }
    };
    const check = async () => {
      if (polling) return;
      polling = true;
      try {
        accept((await api.auth!('state')) as AccessState);
      } catch {
        accept({ authorized: false, code: 'CONNECTION_FAILED' });
      } finally {
        polling = false;
      }
    };
    const unsubscribe = api.onAuthState?.(accept);
    void check();
    const timer = setInterval(() => {
      void check();
    }, 15000);
    const focus = () => {
      void check();
    };
    window.addEventListener('focus', focus);
    return () => {
      disposed = true;
      clearInterval(timer);
      unsubscribe?.();
      window.removeEventListener('focus', focus);
    };
  }, []);
  async function login(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const next = (await window.directorDesktop!.auth!('login', {
        account,
        key,
        remember,
      })) as AccessState;
      setKey('');
      setState(next);
      if (next.error)
        setError(accessMessages[next.error] || '登录未完成，请重试。');
    } catch {
      setError('登录页面正在切换；若未进入工作台，请重试。');
    } finally {
      setBusy(false);
    }
  }
  if (state.authorized) return children(state);
  return (
    <main className="access-screen">
      <div className="access-theme">
        <ThemeToggle />
      </div>
      <section className="access-card" aria-labelledby="access-title">
        <div className="access-brand">
          <Clapperboard />
          <span>
            AI 短片导演<small>DIRECTOR STUDIO</small>
          </span>
        </div>
        <h1 id="access-title">登录工作台</h1>
        <p>使用授权账号与密钥，开始你的创作。</p>
        <form onSubmit={login}>
          <label htmlFor="access-account">账号</label>
          <div className="access-input">
            <UserRound size={18} />
            <input
              id="access-account"
              autoComplete="username"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              required
              maxLength={64}
              placeholder="请输入账号"
              disabled={busy || !desktop || !credentialsLoaded}
            />
          </div>
          <label htmlFor="access-key">密钥</label>
          <div className="access-input">
            <KeyRound size={18} />
            <input
              id="access-key"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              required
              maxLength={128}
              placeholder="请输入登录密钥"
              disabled={busy || !desktop || !credentialsLoaded}
            />
            <button
              type="button"
              aria-label={show ? '隐藏密钥' : '显示密钥'}
              onClick={() => setShow(!show)}
            >
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <label className="access-remember">
            <input type="checkbox" checked={remember} disabled={busy || !rememberAvailable || !credentialsLoaded}
              onChange={async e=>{const checked=e.target.checked;setRemember(checked);if(!checked){try{await window.directorDesktop?.auth?.('credentials-clear');}catch{setError('清除保存信息失败，请重试。');setRemember(true);}}}} />
            在此电脑记住账号和密钥
          </label>
          {!rememberAvailable&&credentialsLoaded&&<small>本机安全存储不可用，请手动输入登录。</small>}
          <output className="access-error">
            {!desktop ? '请使用已更新的桌面软件登录。' : error || ' '}
          </output>
          <button className="access-submit" disabled={busy || !desktop || !credentialsLoaded}>
            {busy ? '正在登录…' : '登录'}
          </button>
        </form>
        <p className="access-help">尚未获得授权？请联系管理员开通。</p>
        {state.boundUserId && (
          <button
            className="access-restart"
            onClick={() => {
              void window.directorDesktop?.auth?.('restart').then((result) => {
                const next = result as AccessState;
                if (next.error)
                  setError(accessMessages[next.error] || next.error);
              });
            }}
          >
            重启软件以切换账号
          </button>
        )}
      </section>
    </main>
  );
}
export function AccessProfile({ state }: { state: AccessState }) {
  const [error, setError] = useState('');
  async function logout() {
    const detail = { blocked: false };
    window.dispatchEvent(new CustomEvent('director-before-logout', { detail }));
    if (detail.blocked) {
      setError('请先完成当前生成任务。');
      return;
    }
    if (
      !window.confirm(
        '退出后返回登录页。未保存的项目会保留恢复快照，建议先保存。',
      )
    )
      return;
    const result = (await window.directorDesktop?.auth?.(
      'logout',
    )) as AccessState;
    if (result?.error)
      setError(accessMessages[result.error] || '退出未完成，请重试。');
  }
  return (
    <div className="access-profile">
      <span>
        {state.user?.account}
        <small>
          {state.user?.role === 'super_admin' ? '超级管理员' : '普通会员'}
        </small>
      </span>
      <button
        title="退出登录"
        aria-label="退出登录"
        onClick={() => {
          void logout();
        }}
      >
        <LogOut size={17} />
      </button>
      {!!state.completedResults&&<button onClick={()=>{void window.directorDesktop?.auth?.('open-results');}}>查看生成备份（{state.completedResults}）</button>}
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
