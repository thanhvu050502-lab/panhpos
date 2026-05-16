import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Header } from '../components/layout/Header';
import { BottomNav } from '../components/layout/BottomNav';
import { FAB } from '../components/layout/FAB';
import { DashboardScreen } from '../components/dashboard/DashboardScreen';
import { GlobalSearch } from '../components/ui/GlobalSearch';

// Lazy-load every non-default screen + the modal layer. Dashboard is the
// landing screen so it stays eager; everything else loads when the user
// navigates to it. Trims ~150 KB from first paint on a cold tablet.
const SettingsScreen = lazy(() => import('../components/settings/SettingsScreen').then(m => ({ default: m.SettingsScreen })));
const OrdersScreen = lazy(() => import('../components/orders/OrdersScreen').then(m => ({ default: m.OrdersScreen })));
const AppointmentsScreen = lazy(() => import('../components/appointments/AppointmentsScreen').then(m => ({ default: m.AppointmentsScreen })));
const CustomersScreen = lazy(() => import('../components/customers/CustomersScreen').then(m => ({ default: m.CustomersScreen })));
const ReportScreen = lazy(() => import('../components/dashboard/ReportScreen').then(m => ({ default: m.ReportScreen })));
const Modals = lazy(() => import('../components/modals/Modals').then(m => ({ default: m.Modals })));

const ScreenLoader = () => (
  <div style={{ padding: '32px', textAlign: 'center', color: 'var(--ink3)' }}>...</div>
);
import { useAuth, getLockoutMinutes } from '../hooks/useAuth';
import { useCache } from '../hooks/useCache';
import { useShift } from '../hooks/useShift';
import { useIdleTimeout } from '../hooks/useIdleTimeout';
import { ToastProvider, toast } from '../components/ui/Toast';
import { clearSupabaseConfig, getStoredCreds, getSupabase, hasEnvCreds, initSupabase, testSupabaseConnection, tryInitAndPing } from '../lib/supabaseClient';
import { useConfirmAlert } from '../hooks/useConfirmAlert';
import { get as idbGet, set as idbSet } from 'idb-keyval';

// AES-GCM "remember password" — encrypted with a per-device key. The key is
// non-extractable and lives in IndexedDB rather than localStorage so that even
// an XSS payload can only USE the key (encrypt/decrypt the local ciphertext),
// not exfiltrate the raw bytes. Browser stores it the same way the built-in
// password manager would: on the device, scoped to origin.
const RP_KEY_ID = 'np_rp_key_v2';
const _rpB64 = {
  enc: (b: Uint8Array) => btoa(String.fromCharCode(...Array.from(b))),
  dec: (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0)),
};
async function _getRpKey(): Promise<CryptoKey> {
  const existing = await idbGet<CryptoKey>(RP_KEY_ID);
  if (existing) return existing;
  // First boot post-upgrade (or fresh install): generate a new non-extractable key.
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await idbSet(RP_KEY_ID, key);
  // Drop the legacy extractable key + any ciphertext tied to it; the user will
  // need to re-tick "remember me" once to seed the new envelope.
  try {
    localStorage.removeItem('np_rp_key');
    localStorage.removeItem('np_rp_pwd');
  } catch { /* storage disabled */ }
  return key;
}
async function _encryptPwd(pwd: string): Promise<string> {
  const k = await _getRpKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(pwd));
  return _rpB64.enc(iv) + '.' + _rpB64.enc(new Uint8Array(ct));
}
async function _decryptPwd(stored: string): Promise<string | null> {
  try {
    const [ivB64, ctB64] = stored.split('.');
    const k = await _getRpKey();
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: _rpB64.dec(ivB64) }, k, _rpB64.dec(ctB64));
    return new TextDecoder().decode(pt);
  } catch { return null; }
}

export const Index: React.FC = () => {
  const { confirm } = useConfirmAlert();
  const [currentScreen, setCurrentScreen] = useState('dash');
  const { session, logout, login, getMembers, isMasterPasswordPending, setupMasterPassword } = useAuth();
  const [setupMasterPwd, setSetupMasterPwd] = useState('');
  const [setupMasterPwd2, setSetupMasterPwd2] = useState('');
  const [setupMasterError, setSetupMasterError] = useState('');
  const [showMasterSetup, setShowMasterSetup] = useState(false);
  const { cache, fetchAll } = useCache();
  const { getActiveShift, getShiftTemplates, openShift } = useShift();
  const [isOffline, setIsOffline] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'on'|'sy'|'off'>('off');
  const [showSetup, setShowSetup] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [setupUrl, setSetupUrl] = useState('');
  const [setupKey, setSetupKey] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [setupError, setSetupError] = useState('');
  const [showOpenShiftPopup, setShowOpenShiftPopup] = useState(false);
  const [popupTplId, setPopupTplId] = useState('');
  const [popupStaff, setPopupStaff] = useState<string[]>([]);
  const [showSearch, setShowSearch] = useState(false);

  // Dark mode init
  useEffect(() => {
    if (localStorage.getItem('np_dark_mode') === '1') document.body.classList.add('dark-mode');
    else document.body.classList.remove('dark-mode');
  }, []);

  // Auto-logout after 30 min of inactivity. Only armed while logged in.
  useIdleTimeout(!!session, 30, () => {
    logout();
    toast('Đã tự động đăng xuất do không hoạt động', 'info');
  });

  // First-launch check: if master has no password yet, force setup screen
  useEffect(() => {
    if (!session && !showSetup && isMasterPasswordPending()) {
      setShowMasterSetup(true);
    }
  }, [session, showSetup, isMasterPasswordPending]);

  // One-time boot: verify Supabase reachability; auto-switch to demo if unavailable
  useEffect(() => {
    // file:// protocol can never reach Supabase — go straight to demo
    if (window.location.protocol === 'file:') {
      if (localStorage.getItem('np_demo') !== '1') localStorage.setItem('np_demo', '1');
      return;
    }
    const { url, key } = getStoredCreds();
    const isDemo = localStorage.getItem('np_demo') === '1';
    // Only ping when credentials are available and demo mode is off
    if (url && key && !isDemo) {
      tryInitAndPing().then(ok => {
        if (!ok) {
          localStorage.setItem('np_demo', '1');
          toast('Không thể kết nối Supabase — đang dùng chế độ Demo', 'error');
        }
      });
    }
  }, []);

  useEffect(() => {
    // Restore saved username + password only if user previously opted in
    // (i.e., explicitly ticked "Ghi nhớ tài khoản"). Default unticked so
    // a fresh device shows a clean login form.
    const savedUser = localStorage.getItem('np_remember_user');
    if (savedUser) {
      setLoginUsername(savedUser);
      setRememberMe(true);
      const savedPwd = localStorage.getItem('np_rp_pwd');
      if (savedPwd) _decryptPwd(savedPwd).then(pwd => { if (pwd) setLoginPassword(pwd); });
    }

    // Initial boot check
    if (typeof window !== 'undefined') {
      const { url, key, source } = getStoredCreds();
      const isDemo = localStorage.getItem('np_demo') === '1';
      // Pre-fill the setup form from localStorage only — env-sourced creds shouldn't leak into the UI.
      if (source === 'storage') {
        if (url) setSetupUrl(url);
        if (key) setSetupKey(key);
      }
      // Hide setup screen entirely when env vars are present (production deploys).
      if (!url && !isDemo && !hasEnvCreds()) {
        setShowSetup(true);
      }
    }

    const handleOnline = () => { setIsOffline(false); setSyncStatus('on'); };
    const handleOffline = () => { setIsOffline(true); setSyncStatus('off'); };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (session) {
      const isDemo = localStorage.getItem('np_demo') === '1';
      fetchAll(isDemo);
      setSyncStatus(isDemo ? 'off' : 'on');
      // Show open-shift popup if no active shift after login
      setTimeout(() => {
        if (!getActiveShift()) setShowOpenShiftPopup(true);
      }, 800);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [session, fetchAll]);

  // Real reachability ping: navigator.onLine only checks LAN connectivity, so
  // it lies when Wi-Fi works but Supabase is unreachable (ISP block, server
  // down, captive portal). Hit a tiny query every 30s to know the truth.
  useEffect(() => {
    const isDemo = localStorage.getItem('np_demo') === '1';
    if (isDemo) return;

    let cancelled = false;
    const ping = async () => {
      const sb = getSupabase();
      if (!sb) {
        if (!cancelled) setSyncStatus('off');
        return;
      }
      try {
        const { error } = await sb.from('settings').select('id').limit(1);
        if (cancelled) return;
        setSyncStatus(error ? 'off' : 'on');
      } catch {
        if (!cancelled) setSyncStatus('off');
      }
    };
    ping();
    const id = setInterval(ping, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Idle auto-logout — 30 min of no input → log out.
  // Keeps the salon device safe if a staff member walks away.
  useEffect(() => {
    if (!session) return;
    const IDLE_MS = 30 * 60_000;
    let timer: any;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        logout();
        toast('Đã tự động đăng xuất do không hoạt động', 'info');
      }, IDLE_MS);
    };
    const events = ['mousemove', 'keydown', 'touchstart', 'click', 'scroll'] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [session, logout]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    await login(
      loginUsername,
      loginPassword,
      () => {
        toast('Đăng nhập thành công', 'success');
        if (rememberMe) {
          localStorage.setItem('np_remember_user', loginUsername);
          _encryptPwd(loginPassword).then(enc => localStorage.setItem('np_rp_pwd', enc));
        } else {
          localStorage.removeItem('np_remember_user');
          localStorage.removeItem('np_rp_pwd');
        }
      },
      (msg) => {
        if (msg === 'MUST_SET_PASSWORD') {
          setShowMasterSetup(true);
          setSetupMasterError('');
          setSetupMasterPwd('');
          setSetupMasterPwd2('');
          return;
        }
        if (msg === 'LOCKED_OUT') {
          const mins = getLockoutMinutes(loginUsername) || 5;
          setLoginError(`Tài khoản tạm khoá. Thử lại sau ${mins} phút.\nAccount locked. Try again in ${mins} minutes.`);
          return;
        }
        setLoginError('Tài khoản hoặc mật khẩu không đúng\nIncorrect username or password');
      }
    );
  };

  const handleSetupMaster = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetupMasterError('');
    if (setupMasterPwd.length < 6) {
      setSetupMasterError('Mật khẩu phải tối thiểu 6 ký tự');
      return;
    }
    if (setupMasterPwd !== setupMasterPwd2) {
      setSetupMasterError('Hai mật khẩu không khớp');
      return;
    }
    const ok = await setupMasterPassword(setupMasterPwd);
    if (!ok) {
      setSetupMasterError('Không thể thiết lập mật khẩu — tài khoản master có thể đã có mật khẩu, vui lòng tải lại trang.');
      return;
    }
    setShowMasterSetup(false);
    toast('Đã thiết lập mật khẩu master', 'success');
  };

  const handleFabClick = () => {
    const isOrderScreen = currentScreen === 'dash' || currentScreen === 'orders';
    if (isOrderScreen || (!['appt', 'custs', 'settings'].includes(currentScreen))) {
      if (!getActiveShift()) {
        toast('Chưa mở ca — vui lòng mở ca trước khi tạo đơn!', 'error');
        setShowOpenShiftPopup(true);
        return;
      }
      (window as any).openModal?.('orderModal');
    } else if (currentScreen === 'appt') {
      (window as any).openModal?.('apptModal');
    } else if (currentScreen === 'custs') {
      (window as any).openModal?.('custModal');
    } else {
      (window as any).openModal?.('orderModal');
    }
  };

  const handleDemoMode = async () => {
    const ok = await confirm({
      title: 'Chuyển sang chế độ Demo?',
      message: 'Chế độ Demo dùng dữ liệu mẫu trên thiết bị này. Dữ liệu thực trên Supabase KHÔNG bị xoá nhưng sẽ không hiển thị cho đến khi bạn kết nối lại.',
      confirmLabel: 'Dùng Demo',
      confirmVariant: 'danger'
    });
    if (!ok) return;
    localStorage.setItem('np_demo', '1');
    setShowSetup(false);
    toast('Đang dùng dữ liệu mẫu!', 'success');
    window.location.reload();
  };

  const handleConnectSupabase = async () => {
    const url = setupUrl.trim();
    const key = setupKey.trim();
    if (!url || !key) {
      setSetupError('Vui lòng nhập đầy đủ Supabase URL và Anon Key.');
      return;
    }

    setIsConnecting(true);
    try {
      await testSupabaseConnection(url, key);
      initSupabase(url, key);
      localStorage.removeItem('np_demo');
      await fetchAll(false);
      setShowSetup(false);
      toast('Kết nối Supabase thành công', 'success');
    } catch (err: any) {
      clearSupabaseConfig();
      setSetupError(`Kết nối thất bại: ${err?.message || 'Không thể truy cập Supabase.'}`);
    } finally {
      setIsConnecting(false);
    }
  };

  if (showSetup) {
    return (
      <div className="setup-screen" id="setupScreen">
        <div className="setup-box">
          <div className="setup-logo">
            <img className="login-logo-img" src="data:image/jpeg;base64,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" alt="logo" />
          </div>
          <div className="setup-title">anh.naillab</div>
          <div className="setup-sub">Kết nối Supabase để bắt đầu.<br/>Dữ liệu lưu cloud, dùng được trên mọi thiết bị.</div>
          <div className="setup-info">
            1. Vào <a href="https://supabase.com" target="_blank" rel="noreferrer">supabase.com</a> → New project<br/>
            2. SQL Editor → chạy file <strong>schema.sql</strong><br/>
            3. Settings → API → copy URL + anon key<br/>
            4. Dán vào đây và nhấn Kết nối
          </div>
          <div className="fg">
            <label className="flbl">Supabase URL</label>
            <input
              className="fc"
              type="url"
              id="setupUrl"
              placeholder="https://xxxx.supabase.co"
              value={setupUrl}
              onChange={(e) => setSetupUrl(e.target.value)}
              disabled={isConnecting}
            />
          </div>
          <div className="fg">
            <label className="flbl">Supabase Anon Key</label>
            <input
              className="fc"
              type="password"
              id="setupKey"
              placeholder="eyJ..."
              value={setupKey}
              onChange={(e) => setSetupKey(e.target.value)}
              disabled={isConnecting}
            />
          </div>
          <button className="btn brand full" style={{ marginTop: '8px' }} onClick={handleConnectSupabase} disabled={isConnecting}>
            {isConnecting ? 'Đang kết nối...' : '🔗 Kết nối Supabase'}
          </button>
          <div style={{ textAlign: 'center', marginTop: '14px' }}>
            <button className="btn ghost sm" onClick={handleDemoMode} disabled={isConnecting}>Dùng thử không cần Supabase (dữ liệu mẫu)</button>
          </div>

          {setupError && (
            <div className="aoverlay open" style={{ zIndex: 4000 }}>
              <div className="abox">
                <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>Không thể kết nối</div>
                <div style={{ fontSize: '14px', color: 'var(--ink3)', lineHeight: 1.5, marginBottom: '20px' }}>
                  {setupError}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn brand full" onClick={() => setSetupError('')}>Xác nhận</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div id="loginScreen">
        <div className="login-bg"></div>
        <div className="login-blob"></div>
        <div className="login-card">
          <div className="login-logo-pill" style={{ marginBottom: '20px', flexDirection: 'column' }}>
            <img className="login-logo-img" src="data:image/jpeg;base64,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" alt="logo" />
            <span className="login-logo-text">anh.naillab</span>
          </div>
          <div className="login-welcome">chào mừng trở lại</div>
          <div className="login-title">Đăng nhập</div>

          <form onSubmit={handleLoginSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input
              className="fc"
              type="text"
              placeholder="Tên đăng nhập"
              value={loginUsername}
              onChange={e => setLoginUsername(e.target.value)}
              autoComplete="username"
              style={{ background: 'rgba(255,255,255,0.7)' }}
            />
            <input 
              className="fc"
              type="password"
              placeholder="Mật khẩu"
              value={loginPassword}
              onChange={e => setLoginPassword(e.target.value)}
              autoComplete="current-password"
              style={{ background: 'rgba(255,255,255,0.7)' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(255,255,255,0.9)', fontSize: '13px' }}>
              <input
                type="checkbox"
                id="rememberMe"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
              />
              <label htmlFor="rememberMe">Ghi nhớ tài khoản</label>
            </div>
            <button type="submit" className="btn brand full" style={{ marginTop: '8px' }}>
              Đăng nhập
            </button>
          </form>

          <div style={{ fontSize: '11px', color: 'rgba(120,80,160,.8)', textAlign: 'center', marginTop: '16px', lineHeight: 1.5 }}>
            Dành cho nội bộ. Liên hệ chủ tiệm nếu quên mật khẩu.
          </div>
        </div>

        {loginError && (
          <div className="aoverlay open" style={{ zIndex: 4000 }}>
            <div className="abox">
              <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>Lỗi đăng nhập</div>
              <div style={{ fontSize: '14px', color: 'var(--ink3)', lineHeight: 1.5, marginBottom: '20px' }}>
                {loginError}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn brand full" onClick={() => setLoginError('')}>Xác nhận</button>
              </div>
            </div>
          </div>
        )}

        {showMasterSetup && (
          <div className="aoverlay open" style={{ zIndex: 4500 }}>
            <div className="abox" style={{ maxWidth: 360 }}>
              <div style={{ fontSize: '17px', fontWeight: 700, marginBottom: '6px' }}>Thiết lập mật khẩu Master</div>
              <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.5, marginBottom: '16px' }}>
                Đây là lần đầu khởi động. Vui lòng đặt mật khẩu cho tài khoản <b>admin</b> (chủ tiệm).
                Tối thiểu 6 ký tự. Mật khẩu này sẽ được mã hoá và không thể khôi phục nếu quên.
              </div>
              <form onSubmit={handleSetupMaster} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <input className="fc" type="password" placeholder="Mật khẩu mới"
                  value={setupMasterPwd} onChange={e => setSetupMasterPwd(e.target.value)} autoFocus />
                <input className="fc" type="password" placeholder="Nhập lại mật khẩu"
                  value={setupMasterPwd2} onChange={e => setSetupMasterPwd2(e.target.value)} />
                {setupMasterError && (
                  <div style={{ fontSize: '12px', color: 'var(--red)' }}>{setupMasterError}</div>
                )}
                <button type="submit" className="btn brand full" style={{ marginTop: '4px' }}>
                  Lưu mật khẩu
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  const pendingCount = (cache.orders || []).filter((o: any) => o.status === 'pending').length;
  const todayOrders = (cache.orders || []).filter((o: any) => o.status === 'paid' && o.created_at?.startsWith(new Date().toISOString().split('T')[0]));
  const todayRev = todayOrders.reduce((sum: number, o: any) => sum + (o.final_amount || 0), 0);

  return (
    <div id="app">
      <ToastProvider />
      
      <div id="offlineBanner" className={isOffline ? 'show' : ''} style={{ display: isOffline ? 'block' : 'none' }}>
        📡 Đang offline — thao tác bị giới hạn
      </div>

      <Header
        appName={cache.settings?.app_name || 'anh.naillab'}
        onLogout={async () => {
          const ok = await confirm({
            title: 'Đăng xuất',
            message: 'Đăng xuất khỏi anh.naillab?',
            confirmLabel: 'Đăng xuất',
            confirmVariant: 'danger'
          });
          if (ok) logout();
        }}
        syncStatus={syncStatus}
        onSearch={() => setShowSearch(true)}
      />

      <div className="screens">
        {currentScreen === 'dash' && (
          <DashboardScreen
            onViewAppointments={() => setCurrentScreen('appt')}
            onViewOrders={() => setCurrentScreen('orders')}
            onOpenShiftAction={() => setCurrentScreen('settings')}
            onViewReport={() => setCurrentScreen('report')}
          />
        )}
        <Suspense fallback={<ScreenLoader />}>
          {currentScreen === 'orders' && <OrdersScreen />}
          {currentScreen === 'appt' && <AppointmentsScreen />}
          {currentScreen === 'custs' && <CustomersScreen />}
          {currentScreen === 'settings' && <SettingsScreen />}
          {currentScreen === 'report' && <ReportScreen onBack={() => setCurrentScreen('dash')} />}
        </Suspense>
      </div>

      <BottomNav
        currentScreen={currentScreen}
        onNavigate={setCurrentScreen}
        pendingCount={pendingCount}
        todayRev={todayRev}
      />
      
      <FAB currentScreen={currentScreen} onClick={handleFabClick} />

      <Suspense fallback={null}>
        <Modals />
      </Suspense>

      {showSearch && <GlobalSearch onClose={() => setShowSearch(false)} />}

      {/* Post-login open shift popup */}
      {showOpenShiftPopup && (
        <div className="moverlay open" onClick={e => { if ((e.target as any).classList.contains('moverlay')) setShowOpenShiftPopup(false); }}>
          <div className="modal" style={{ maxHeight: '80dvh', display: 'flex', flexDirection: 'column' }}>
            <div className="mhandle" />
            <div className="mhdr">
              <div className="mttl">⏰ Mở ca làm việc</div>
              <button className="mclose" onClick={() => setShowOpenShiftPopup(false)}>×</button>
            </div>
            <div className="mbody" style={{ flex: 1, overflowY: 'auto' }}>
              <div style={{ fontSize: '13px', color: 'var(--ink3)', marginBottom: '12px' }}>Chọn ca để bắt đầu hôm nay:</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '14px' }}>
                {getShiftTemplates().map((tpl: any) => (
                  <div key={tpl.id} onClick={() => setPopupTplId(tpl.id)}
                    style={{ padding: '12px', borderRadius: '12px', border: `2px solid ${popupTplId === tpl.id ? tpl.color : 'var(--bdr)'}`, background: popupTplId === tpl.id ? tpl.bg : 'var(--bg)', cursor: 'pointer' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: tpl.color }}>{tpl.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '2px' }}>{tpl.startTime} – {tpl.endTime}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink3)' }}>Nhân viên</label>
                <div className="chips" style={{ marginTop: '6px' }}>
                  {getMembers().map((m: any) => (
                    <div key={m.id} className={`chip${popupStaff.includes(m.displayName || m.name) ? ' on' : ''}`}
                      onClick={() => setPopupStaff(prev => prev.includes(m.displayName || m.name) ? prev.filter(s => s !== (m.displayName || m.name)) : [...prev, m.displayName || m.name])}>
                      {m.displayName || m.name}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mfoot" style={{ gap: '8px' }}>
              <button className="btn outline" style={{ flex: 1 }} onClick={() => setShowOpenShiftPopup(false)}>Bỏ qua</button>
              <button className="btn brand" style={{ flex: 2 }} disabled={!popupTplId} onClick={() => {
                const tpl = getShiftTemplates().find((t: any) => t.id === popupTplId);
                openShift(popupTplId, popupStaff, tpl?.startTime || '', tpl?.endTime || '', '');
                setShowOpenShiftPopup(false);
                toast('Đã mở ca thành công', 'success');
              }}>Mở ca</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
