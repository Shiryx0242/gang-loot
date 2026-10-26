'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Role } from './types';
import type { RoundingMode } from './money';

export interface Gang {
  id: string;
  name: string;
  rounding_mode: RoundingMode;
}

export interface Membership {
  gang: Gang;
  role: Role;
  display_name: string | null;
}

interface GangContextValue {
  authLoading: boolean;
  user: User | null;
  /** โหลดรายชื่อแก็งของผู้ใช้เสร็จแล้ว */
  ready: boolean;
  memberships: Membership[];
  current: Membership | null;
  setCurrentGangId: (id: string) => void;
  canEdit: boolean;
  isOwner: boolean;
  joinError: string | null;
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
}

const GangContext = createContext<GangContextValue | null>(null);

export function useGang(): GangContextValue {
  const ctx = useContext(GangContext);
  if (!ctx) throw new Error('useGang must be used inside GangProvider');
  return ctx;
}

interface MembershipRow {
  role: Role;
  display_name: string | null;
  gangs: Gang | Gang[] | null;
}

export function GangProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setAuthLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const load = useCallback(async () => {
    if (!user) {
      setMemberships([]);
      setLoadedFor(null);
      return;
    }

    // รหัสเชิญที่เก็บไว้จากหน้า /join (ก่อนล็อกอิน)
    try {
      const pending = localStorage.getItem('pendingInvite');
      if (pending) {
        localStorage.removeItem('pendingInvite');
        const { data, error } = await supabase.rpc('join_gang', { p_code: pending });
        if (error) {
          setJoinError('เข้าร่วมแก็งไม่สำเร็จ: รหัสเชิญไม่ถูกต้องหรือหมดอายุ');
        } else if (data) {
          localStorage.setItem('currentGangId', String(data));
          setCurrentId(String(data));
          setJoinError(null);
        }
      }
    } catch {
      // localStorage ใช้ไม่ได้ ข้ามไป
    }

    const { data, error } = await supabase
      .from('gang_users')
      .select('role, display_name, gangs(id, name, rounding_mode)')
      .eq('user_id', user.id);

    if (!error) {
      const rows = (data ?? []) as unknown as MembershipRow[];
      const list: Membership[] = [];
      for (const r of rows) {
        const g = Array.isArray(r.gangs) ? r.gangs[0] : r.gangs;
        if (g) list.push({ gang: g, role: r.role, display_name: r.display_name });
      }
      setMemberships(list);
    }
    setLoadedFor(user.id);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('currentGangId');
      if (saved) setCurrentId(saved);
    } catch {
      // ignore
    }
  }, []);

  const setCurrentGangId = useCallback((id: string) => {
    setCurrentId(id);
    try {
      localStorage.setItem('currentGangId', id);
    } catch {
      // ignore
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setMemberships([]);
    setLoadedFor(null);
  }, []);

  const value = useMemo<GangContextValue>(() => {
    const current = memberships.find((m) => m.gang.id === currentId) ?? memberships[0] ?? null;
    return {
      authLoading,
      user,
      ready: Boolean(user && loadedFor === user.id),
      memberships,
      current,
      setCurrentGangId,
      canEdit: current?.role === 'owner' || current?.role === 'admin',
      isOwner: current?.role === 'owner',
      joinError,
      reload: load,
      signOut,
    };
  }, [authLoading, user, loadedFor, memberships, currentId, setCurrentGangId, joinError, load, signOut]);

  return <GangContext.Provider value={value}>{children}</GangContext.Provider>;
}
