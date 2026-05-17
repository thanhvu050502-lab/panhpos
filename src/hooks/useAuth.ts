import { useState, useEffect, useCallback } from 'react';
import { hashPassword, verifyPassword, isHashed } from '../lib/passwordCrypto';
import { getSupabase } from '../lib/supabaseClient';

const MEMBERS_KEY = 'np_members';
const SESSION_KEY = 'nailpos_remembered_session';
const LOCKOUT_KEY = (username: string) => `np_login_lockout_${username.toLowerCase()}`;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 5;

/** Synthetic email domain we map usernames onto for Supabase Auth. */
const AUTH_DOMAIN = '@nailpos.local';
const usernameToEmail = (u: string) => `${u.toLowerCase().trim()}${AUTH_DOMAIN}`;
const emailToUsername = (e?: string | null) => (e || '').replace(AUTH_DOMAIN, '').toLowerCase();

interface LockoutState { n: number; until: number }

const readLockout = (username: string): LockoutState => {
  if (typeof window === 'undefined') return { n: 0, until: 0 };
  try {
    const raw = localStorage.getItem(LOCKOUT_KEY(username));
    if (!raw) return { n: 0, until: 0 };
    const parsed = JSON.parse(raw);
    return { n: Number(parsed?.n) || 0, until: Number(parsed?.until) || 0 };
  } catch { return { n: 0, until: 0 }; }
};

const writeLockout = (username: string, state: LockoutState) => {
  if (typeof window === 'undefined') return;
  if (state.n === 0 && state.until === 0) {
    localStorage.removeItem(LOCKOUT_KEY(username));
  } else {
    localStorage.setItem(LOCKOUT_KEY(username), JSON.stringify(state));
  }
};

/** Returns minutes remaining if locked, 0 otherwise. */
export const getLockoutMinutes = (username: string): number => {
  const { until } = readLockout(username);
  if (!until || until <= Date.now()) return 0;
  return Math.ceil((until - Date.now()) / 60_000);
};

export interface Member {
  id: string;
  username: string;
  name: string;
  displayName?: string;
  role: string;
  /** PBKDF2 hash. Empty string = master account that hasn't set a password yet.
   *  Only used in demo/localStorage mode; ignored in Supabase mode. */
  passwordHash?: string;
  /** Legacy plaintext field, kept for one-time migration only. Cleared after upgrade. */
  password?: string;
  isMaster?: boolean;
  passwordVersion?: number;
  /** Master account flag: forces user to set password on first login.
   *  Always false in Supabase mode (bootstrap is done via dashboard). */
  mustSetPassword?: boolean;
  /** When true, the member is filtered out of staff-selector dropdowns
   *  (Order, Appointment, Shift). Still visible in Account Management. */
  is_hidden?: boolean;
  createdAt?: string;
  updatedAt?: string;
  addedAt?: string;
}

export interface Session {
  accountId: string;
  username: string;
  displayName?: string;
  role: string;
  passwordVersion: number;
  loginAt: number;
}

export type LoginErrorCode = 'INVALID_CREDENTIALS' | 'MUST_SET_PASSWORD' | 'LOGIN_ERROR' | 'LOCKED_OUT';

const isSupabaseMode = () => !!getSupabase();

const memberFromRow = (row: any): Member => {
  const username = String(row?.username || '').toLowerCase();
  const display = row?.display_name || username;
  return {
    id: String(row?.id || ''),
    username,
    name: display,
    displayName: display,
    role: row?.role || 'staff',
    passwordHash: '',
    password: '',
    isMaster: row?.role === 'owner',
    passwordVersion: 1,
    mustSetPassword: false,
    is_hidden: !!row?.is_hidden,
    createdAt: row?.created_at,
    updatedAt: row?.updated_at,
    addedAt: row?.created_at,
  };
};

export function useAuth() {
  const makeMemberId = (username: string) =>
    `acc_${username}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const normalizeMember = (raw: any, nowIso: string): Member => {
    const username = String(raw?.username || '').toLowerCase();
    const displayName = raw?.displayName || raw?.name || username;
    const parsedVersion = Number(raw?.passwordVersion);
    return {
      id: raw?.id || makeMemberId(username || 'user'),
      username,
      name: raw?.name || displayName,
      displayName,
      role: raw?.role || 'staff',
      passwordHash: raw?.passwordHash || '',
      password: raw?.password || '',
      isMaster: !!raw?.isMaster,
      passwordVersion: Number.isFinite(parsedVersion) && parsedVersion > 0 ? parsedVersion : 1,
      mustSetPassword: !!raw?.mustSetPassword,
      is_hidden: !!raw?.is_hidden,
      createdAt: raw?.createdAt || raw?.addedAt || nowIso,
      updatedAt: raw?.updatedAt || nowIso,
      addedAt: raw?.addedAt || raw?.createdAt || nowIso,
    };
  };

  const validateRememberedSession = (rawSession: any, members: Member[]): Session | null => {
    if (!rawSession || typeof rawSession !== 'object') return null;
    const accountId = String(rawSession.accountId || '');
    const username = String(rawSession.username || '').toLowerCase();
    const passwordVersion = Number(rawSession.passwordVersion);
    if (!accountId || !username || !Number.isFinite(passwordVersion)) return null;
    const account = members.find((m) => m.id === accountId && m.username === username);
    if (!account) return null;
    if ((account.passwordVersion || 1) !== passwordVersion) return null;
    return {
      accountId: account.id,
      username: account.username,
      displayName: account.displayName || account.name,
      role: account.role,
      passwordVersion: account.passwordVersion || 1,
      loginAt: Number(rawSession.loginAt) || Date.now(),
    };
  };

  // Members cache. In Supabase mode, populated from public.members on mount
  // and refreshed on auth changes. In demo mode, mirrors localStorage.
  const [membersCache, setMembersCache] = useState<Member[]>(() => {
    if (typeof window === 'undefined') return [];
    if (isSupabaseMode()) return []; // populated by effect below
    try {
      const nowIso = new Date().toISOString();
      const list = JSON.parse(localStorage.getItem(MEMBERS_KEY) || '[]') || [];
      return list.map((m: any) => normalizeMember(m, nowIso));
    } catch { return []; }
  });

  const [session, setSessionState] = useState<Session | null>(() => {
    if (typeof window === 'undefined') return null;
    // In Supabase mode, the real session is restored by the auth-state effect.
    if (isSupabaseMode()) return null;
    try {
      const data = localStorage.getItem(SESSION_KEY);
      if (!data) return null;
      const parsed = JSON.parse(data);
      const nowIso = new Date().toISOString();
      const members = (JSON.parse(localStorage.getItem(MEMBERS_KEY) || '[]') || []).map((m: any) =>
        normalizeMember(m, nowIso)
      );
      const valid = validateRememberedSession(parsed, members);
      if (!valid) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return valid;
    } catch {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
  });

  // ---------------------------------------------------------------------
  // Supabase-mode bootstrap: wire auth state -> session, fetch members.
  // ---------------------------------------------------------------------
  const refreshMembersFromSupabase = useCallback(async (): Promise<Member[]> => {
    const sb = getSupabase();
    if (!sb) return [];
    try {
      const { data, error } = await sb.from('members').select('*').order('created_at');
      if (error) throw error;
      const list = (data || []).map(memberFromRow);
      setMembersCache(list);
      return list;
    } catch {
      return [];
    }
  }, []);

  const buildSessionFromAuth = useCallback(async (authUser: any): Promise<Session | null> => {
    if (!authUser?.id) return null;
    const sb = getSupabase();
    if (!sb) return null;
    const { data } = await sb.from('members').select('*').eq('id', authUser.id).maybeSingle();
    if (!data) {
      const username = emailToUsername(authUser.email);
      return {
        accountId: authUser.id,
        username,
        displayName: username,
        role: 'staff',
        passwordVersion: 1,
        loginAt: Date.now(),
      };
    }
    return {
      accountId: data.id,
      username: data.username,
      displayName: data.display_name || data.username,
      role: data.role || 'staff',
      passwordVersion: 1,
      loginAt: Date.now(),
    };
  }, []);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return; // demo mode handled by the legacy effect below

    let cancelled = false;

    (async () => {
      const { data } = await sb.auth.getSession();
      if (cancelled) return;
      const user = data.session?.user;
      if (user) {
        const next = await buildSessionFromAuth(user);
        if (!cancelled && next) setSessionState(next);
      }
      await refreshMembersFromSupabase();
    })();

    const { data: sub } = sb.auth.onAuthStateChange(async (_event: string, sess: any) => {
      if (cancelled) return;
      if (!sess?.user) {
        setSessionState(null);
        return;
      }
      const next = await buildSessionFromAuth(sess.user);
      if (!cancelled && next) setSessionState(next);
      refreshMembersFromSupabase();
    });

    return () => {
      cancelled = true;
      try { sub?.subscription?.unsubscribe(); } catch { /* noop */ }
    };
  }, [buildSessionFromAuth, refreshMembersFromSupabase]);

  // ---------------------------------------------------------------------
  // Demo / localStorage mode bootstrap (only when Supabase is NOT configured).
  // Initialise default master account; restore remembered session.
  // ---------------------------------------------------------------------
  const getMembersLocal = (): Member[] => {
    if (typeof window === 'undefined') return [];
    try {
      const nowIso = new Date().toISOString();
      const list = JSON.parse(localStorage.getItem(MEMBERS_KEY) || '[]') || [];
      return list.map((m: any) => normalizeMember(m, nowIso));
    } catch {
      return [];
    }
  };

  const saveMembersLocal = (m: Member[]) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(MEMBERS_KEY, JSON.stringify(m));
      setMembersCache(m);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isSupabaseMode()) return;

    const nowIso = new Date().toISOString();
    let newMembers = getMembersLocal();

    const masterIndex = newMembers.findIndex(m => m.isMaster || m.username?.toLowerCase() === 'admin');
    if (masterIndex === -1) {
      newMembers = newMembers.filter(m => m.username?.toLowerCase() !== 'admin');
      newMembers.push({
        id: 'acc_admin_1',
        username: 'admin',
        displayName: 'admin',
        name: 'admin',
        passwordHash: '',
        role: 'owner',
        isMaster: true,
        mustSetPassword: true,
        passwordVersion: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
        addedAt: nowIso,
      });
    } else {
      const existing = newMembers[masterIndex];
      newMembers[masterIndex] = {
        ...existing,
        id: 'acc_admin_1',
        username: 'admin',
        role: 'owner',
        isMaster: true,
        mustSetPassword: existing.mustSetPassword || (!existing.passwordHash && !existing.password),
        passwordVersion: Number(existing.passwordVersion) > 0 ? Number(existing.passwordVersion) : 1,
        updatedAt: nowIso,
        addedAt: existing.addedAt || existing.createdAt || nowIso,
      };
      newMembers = newMembers.filter((m, idx) => idx === masterIndex || m.username?.toLowerCase() !== 'admin');
    }

    saveMembersLocal(newMembers);

    const savedSession = localStorage.getItem(SESSION_KEY);
    if (savedSession) {
      try {
        const parsed = JSON.parse(savedSession);
        const validSession = validateRememberedSession(parsed, newMembers);
        if (!validSession) {
          clearSession();
        } else {
          setSession(validSession);
        }
      } catch {
        clearSession();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------
  // Public API — same shape regardless of mode.
  // ---------------------------------------------------------------------
  const getMembers = (): Member[] => membersCache;

  const findMember = (username: string) => {
    const u = username.toLowerCase();
    return membersCache.find(m => m.username.toLowerCase() === u);
  };

  const addMember = async (username: string, name: string, role: string, password?: string, isHidden?: boolean) => {
    const nowIso = new Date().toISOString();
    const normalizedUsername = username.toLowerCase().trim();

    // ----- Supabase mode -----
    if (isSupabaseMode()) {
      const sb = getSupabase()!;
      const hasNewPassword = typeof password === 'string' && password.trim() !== '';
      // Existing member? Update display_name / role only (Supabase Auth password
      // change for someone else requires the service role, not available here).
      const existing = membersCache.find(m => m.username === normalizedUsername);
      if (existing) {
        // Master account is never hidden (would lock owner out of their own selector).
        const hiddenValue = existing.isMaster ? false : !!isHidden;
        const { error } = await sb
          .from('members')
          .update({ display_name: name || existing.displayName || normalizedUsername, role, is_hidden: hiddenValue })
          .eq('id', existing.id);
        if (error) throw error;
        await refreshMembersFromSupabase();
        return findMember(normalizedUsername);
      }
      // New member: signUp creates the auth.users row, then insert public.members.
      // Requires "Allow new users to sign up" enabled in Supabase Auth settings,
      // OR an Edge Function with the service role for true admin creation.
      if (!hasNewPassword) {
        throw new Error('Mật khẩu là bắt buộc khi tạo tài khoản mới');
      }
      const email = usernameToEmail(normalizedUsername);
      const { data: signUpData, error: signUpError } = await sb.auth.signUp({
        email,
        password: password!,
      });
      if (signUpError) throw signUpError;
      const newId = signUpData?.user?.id;
      if (!newId) throw new Error('Không lấy được ID người dùng sau khi tạo');

      const { error: insertError } = await sb.from('members').insert({
        id: newId,
        username: normalizedUsername,
        display_name: name || normalizedUsername,
        role,
        is_hidden: !!isHidden,
      });
      if (insertError) throw insertError;
      await refreshMembersFromSupabase();
      return findMember(normalizedUsername);
    }

    // ----- Demo / localStorage mode -----
    const members = getMembersLocal();
    const existingIndex = members.findIndex(m => m.username.toLowerCase() === normalizedUsername);
    const hasNewPassword = typeof password === 'string' && password.trim() !== '';
    const newHash = hasNewPassword ? await hashPassword(password!) : undefined;

    if (existingIndex >= 0) {
      const existing = members[existingIndex];
      const currentVersion = Number(existing.passwordVersion) > 0 ? Number(existing.passwordVersion) : 1;
      const nextVersion = hasNewPassword ? currentVersion + 1 : currentVersion;
      if (existing.isMaster) {
        members[existingIndex] = {
          ...existing,
          id: 'acc_admin_1',
          username: 'admin',
          role: 'owner',
          isMaster: true,
          name: name || existing.name,
          displayName: name || existing.displayName || existing.name,
          passwordHash: newHash ?? existing.passwordHash ?? '',
          password: '',
          mustSetPassword: hasNewPassword ? false : existing.mustSetPassword,
          passwordVersion: nextVersion,
          is_hidden: false,
          updatedAt: nowIso
        };
      } else {
        members[existingIndex] = {
          ...existing,
          name: name || normalizedUsername,
          displayName: name || normalizedUsername,
          role,
          passwordHash: newHash ?? existing.passwordHash ?? '',
          password: '',
          passwordVersion: nextVersion,
          is_hidden: !!isHidden,
          updatedAt: nowIso
        };
      }
    } else {
      members.push({
        id: makeMemberId(normalizedUsername),
        username: normalizedUsername,
        name: name || normalizedUsername,
        displayName: name || normalizedUsername,
        role,
        passwordHash: newHash ?? '',
        isMaster: false,
        passwordVersion: 1,
        is_hidden: !!isHidden,
        addedAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso
      });
    }
    saveMembersLocal(members);
    return members.find(m => m.username.toLowerCase() === normalizedUsername);
  };

  const removeMemberByUsername = async (username: string) => {
    const u = username.toLowerCase();
    if (isSupabaseMode()) {
      const sb = getSupabase()!;
      const existing = membersCache.find(m => m.username === u);
      if (!existing || existing.role === 'owner') return; // never delete the owner from the app
      const { error } = await sb.from('members').delete().eq('id', existing.id);
      if (error) throw error;
      await refreshMembersFromSupabase();
      return;
    }
    const members = getMembersLocal();
    const existing = members.find(m => m.username.toLowerCase() === u);
    if (existing?.isMaster) return;
    saveMembersLocal(members.filter(m => m.username.toLowerCase() !== u));
  };

  const setSession = (data: Session) => {
    if (typeof window !== 'undefined') {
      // Only persist to localStorage in demo mode; Supabase manages its own session.
      if (!isSupabaseMode()) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(data));
      }
      setSessionState(data);
    }
  };

  const clearSession = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(SESSION_KEY);
      setSessionState(null);
    }
  };

  const logout = async () => {
    if (isSupabaseMode()) {
      try { await getSupabase()!.auth.signOut(); } catch { /* swallow */ }
    }
    clearSession();
  };

  const setupMasterPassword = async (newPassword: string): Promise<boolean> => {
    // No-op in Supabase mode: owner is bootstrapped via the dashboard runbook.
    if (isSupabaseMode()) return false;
    const members = getMembersLocal();
    const idx = members.findIndex(m => m.isMaster);
    if (idx === -1) return false;
    const master = members[idx];
    if (master.passwordHash || master.password) return false;
    if (!newPassword || newPassword.trim().length < 4) return false;
    const hash = await hashPassword(newPassword);
    members[idx] = {
      ...master,
      passwordHash: hash,
      password: '',
      mustSetPassword: false,
      passwordVersion: (Number(master.passwordVersion) || 1) + 1,
      updatedAt: new Date().toISOString(),
    };
    saveMembersLocal(members);
    setSession({
      accountId: members[idx].id,
      username: members[idx].username,
      displayName: members[idx].displayName || members[idx].name,
      role: members[idx].role,
      passwordVersion: members[idx].passwordVersion!,
      loginAt: Date.now(),
    });
    return true;
  };

  const login = async (
    username: string,
    password?: string,
    onSuccess?: () => void,
    onError?: (msg: LoginErrorCode) => void
  ) => {
    try {
      const lockout = readLockout(username);
      if (lockout.until > Date.now()) {
        onError?.('LOCKED_OUT');
        return;
      }

      // ----- Supabase mode -----
      if (isSupabaseMode()) {
        const sb = getSupabase()!;
        const email = usernameToEmail(username);
        const { data, error } = await sb.auth.signInWithPassword({ email, password: password || '' });
        if (error || !data?.user) {
          const next = { n: lockout.n + 1, until: 0 };
          if (next.n >= MAX_FAILED_ATTEMPTS) next.until = Date.now() + LOCKOUT_MINUTES * 60_000;
          writeLockout(username, next);
          onError?.(next.until ? 'LOCKED_OUT' : 'INVALID_CREDENTIALS');
          return;
        }
        writeLockout(username, { n: 0, until: 0 });
        const nextSession = await buildSessionFromAuth(data.user);
        if (nextSession) setSessionState(nextSession);
        onSuccess?.();
        return;
      }

      // ----- Demo / localStorage mode -----
      const member = findMember(username) || getMembersLocal().find(m => m.username.toLowerCase() === username.toLowerCase());
      if (!member) {
        const next = { n: lockout.n + 1, until: 0 };
        if (next.n >= MAX_FAILED_ATTEMPTS) next.until = Date.now() + LOCKOUT_MINUTES * 60_000;
        writeLockout(username, next);
        onError?.(next.until ? 'LOCKED_OUT' : 'INVALID_CREDENTIALS');
        return;
      }

      if (member.isMaster && (member.mustSetPassword || (!member.passwordHash && !member.password))) {
        onError?.('MUST_SET_PASSWORD');
        return;
      }

      let ok = false;
      if (isHashed(member.passwordHash)) {
        ok = await verifyPassword(password || '', member.passwordHash!);
      } else if (member.password) {
        ok = (member.password || '') === (password || '');
        if (ok) {
          const hash = await hashPassword(password || '');
          const all = getMembersLocal();
          const i = all.findIndex(m => m.id === member.id);
          if (i >= 0) {
            all[i] = { ...all[i], passwordHash: hash, password: '', updatedAt: new Date().toISOString() };
            saveMembersLocal(all);
          }
        }
      }

      if (!ok) {
        const next = { n: lockout.n + 1, until: 0 };
        if (next.n >= MAX_FAILED_ATTEMPTS) next.until = Date.now() + LOCKOUT_MINUTES * 60_000;
        writeLockout(username, next);
        onError?.(next.until ? 'LOCKED_OUT' : 'INVALID_CREDENTIALS');
        return;
      }

      writeLockout(username, { n: 0, until: 0 });
      const refreshed = getMembersLocal().find(m => m.id === member.id) || member;
      const currentVersion = Number(refreshed.passwordVersion) > 0 ? Number(refreshed.passwordVersion) : 1;
      const newSession: Session = {
        accountId: refreshed.id,
        username: refreshed.username,
        displayName: refreshed.displayName || refreshed.name,
        role: refreshed.role,
        passwordVersion: currentVersion,
        loginAt: Date.now()
      };
      setSession(newSession);
      onSuccess?.();
    } catch {
      onError?.('LOGIN_ERROR');
    }
  };

  const applyRoleRestrictions = (currentSession: Session | null) => {
    return {
      isStaff: currentSession?.role === 'staff',
      isOwner: currentSession?.role === 'owner',
    };
  };

  /** Returns true if the master account still has no password set. Always
   *  false in Supabase mode. */
  const isMasterPasswordPending = (): boolean => {
    if (isSupabaseMode()) return false;
    const m = getMembersLocal().find(x => x.isMaster);
    if (!m) return false;
    return !!m.mustSetPassword || (!m.passwordHash && !m.password);
  };

  return {
    session,
    getMembers,
    saveMembers: saveMembersLocal,
    findMember,
    addMember,
    removeMemberByUsername,
    setSession,
    clearSession,
    logout,
    login,
    applyRoleRestrictions,
    setupMasterPassword,
    isMasterPasswordPending,
  };
}
