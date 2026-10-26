'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useGang } from '@/lib/gang-context';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { ROLE_LABELS } from '@/lib/types';
import { ViperLogoFull, ViperLogoMark } from '@/components/ViperLogo';
import {
  Decor,
  IconBox,
  IconClock,
  IconGear,
  IconHome,
  IconLogout,
  IconPlus,
  IconPulse,
  IconUsers,
} from '@/components/Icons';
import type { Role } from '@/lib/types';

const NAV = [
  { href: '/', label: 'Dashboard', icon: IconHome },
  { href: '/sessions/new', label: 'สร้างรอบ', icon: IconPlus, editOnly: true },
  { href: '/sessions', label: 'ประวัติ', icon: IconClock },
  { href: '/items', label: 'ไอเทม', icon: IconBox },
  { href: '/players', label: 'ผู้เล่น', icon: IconUsers },
  { href: '/activity', label: 'กิจกรรม', icon: IconPulse },
  { href: '/settings', label: 'ตั้งค่า', icon: IconGear },
];

const ROLE_TONE: Record<Role, string> = {
  owner: 'tone-lavender',
  admin: 'tone-sky',
  member: 'tone-mint',
};

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen">
      <Decor />
      <div className="relative mx-auto flex min-h-screen max-w-md items-center justify-center p-4">{children}</div>
    </div>
  );
}

function Onboarding() {
  const { reload, setCurrentGangId, signOut, joinError } = useGang();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(joinError);

  async function createGang(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.from('gangs').insert({ name: name.trim() }).select('id').single();
    if (error || !data) {
      setError('สร้างแก็งไม่สำเร็จ: ' + (error?.message ?? 'unknown'));
      setBusy(false);
      return;
    }
    setCurrentGangId(data.id as string);
    await reload();
    setBusy(false);
  }

  async function joinGang(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc('join_gang', { p_code: code.trim() });
    if (error || !data) {
      setError('รหัสเชิญไม่ถูกต้องหรือหมดอายุ');
      setBusy(false);
      return;
    }
    setCurrentGangId(String(data));
    await reload();
    setBusy(false);
  }

  return (
    <Centered>
      <div className="w-full space-y-4">
        <div className="text-center">
          <ViperLogoFull />
          <h1 className="mt-5 text-2xl font-bold">ยินดีต้อนรับ</h1>
          <p className="muted text-sm">คุณยังไม่ได้อยู่ในแก็งไหน เลือกอย่างใดอย่างหนึ่ง</p>
        </div>
        {error && <p className="alert tone-bad">{error}</p>}

        <form onSubmit={createGang} className="card space-y-3">
          <h2 className="font-semibold">สร้างแก็งใหม่ (คุณจะเป็นหัวแก็ง)</h2>
          <input className="input" placeholder="ชื่อแก็ง เช่น VIPER" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn btn-primary w-full" disabled={busy || !name.trim()}>
            สร้างแก็ง
          </button>
        </form>

        <form onSubmit={joinGang} className="card space-y-3">
          <h2 className="font-semibold">เข้าร่วมด้วยรหัสเชิญ</h2>
          <input className="input" placeholder="รหัสเชิญจากหัวแก็ง" value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="btn w-full" disabled={busy || !code.trim()}>
            เข้าร่วม
          </button>
        </form>

        <button className="btn btn-sm mx-auto flex" onClick={signOut}>
          <IconLogout size={16} />
          ออกจากระบบ
        </button>
      </div>
    </Centered>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const { authLoading, user, ready, current, memberships, setCurrentGangId, canEdit, signOut } = useGang();
  const router = useRouter();
  const pathname = usePathname();
  const [playerCount, setPlayerCount] = useState<number | null>(null);
  const gangId = current?.gang.id;

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [authLoading, user, router]);

  // จำนวนผู้เล่นสำหรับบรรทัดย่อยใน header (อ่านอย่างเดียว)
  useEffect(() => {
    if (!gangId) return;
    let cancelled = false;
    supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('gang_id', gangId)
      .eq('is_active', true)
      .then(({ count }) => {
        if (!cancelled) setPlayerCount(count ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [gangId, pathname]);

  if (!supabaseConfigured) {
    return (
      <Centered>
        <div className="card space-y-2 text-sm">
          <h1 className="text-lg font-bold">ยังไม่ได้ตั้งค่า Supabase</h1>
          <p>
            สร้างไฟล์ <code>.env.local</code> (คัดลอกจาก <code>.env.local.example</code>) แล้วใส่ URL กับ publishable key จากนั้นรีสตาร์ท{' '}
            <code>npm run dev</code>
          </p>
        </div>
      </Centered>
    );
  }

  if (authLoading || !user || !ready) {
    return (
      <Centered>
        <p className="muted">กำลังโหลด...</p>
      </Centered>
    );
  }

  if (!current) return <Onboarding />;

  return (
    <div className="relative min-h-screen">
      <Decor />
      <div className="relative mx-auto max-w-5xl px-3 pb-28 pt-10 sm:px-4 sm:pt-12">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[32px] border-[1.5px] border-[var(--line)] bg-white p-4 shadow-[var(--shadow)] sm:p-5">
          <div className="flex min-w-0 items-center gap-4">
            <ViperLogoMark className="ml-1" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {memberships.length > 1 ? (
                  <select
                    className="input !min-h-11 !w-auto !py-1 text-lg font-bold uppercase tracking-wide"
                    value={current.gang.id}
                    onChange={(e) => setCurrentGangId(e.target.value)}
                    aria-label="เลือกแก็ง"
                  >
                    {memberships.map((m) => (
                      <option key={m.gang.id} value={m.gang.id}>
                        {m.gang.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-[28px] font-bold uppercase leading-tight tracking-wide">{current.gang.name}</span>
                )}
                <span className={`badge ${ROLE_TONE[current.role]}`}>{ROLE_LABELS[current.role]}</span>
              </div>
              <p className="muted text-sm">
                VP High Player Is King{playerCount !== null ? ` · ${playerCount} ผู้เล่น` : ''}
              </p>
            </div>
          </div>
          <button className="btn btn-sm" onClick={signOut}>
            <IconLogout size={16} />
            ออกจากระบบ
          </button>
        </header>

        <nav className="-mx-3 mb-5 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {NAV.filter((n) => !n.editOnly || canEdit).map((n) => {
            const active =
              n.href === '/'
                ? pathname === '/'
                : pathname === n.href || (n.href === '/sessions' && pathname.startsWith('/sessions/') && pathname !== '/sessions/new');
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border-[1.5px] px-4 text-[15px] font-medium transition ${
                  active
                    ? 'border-[var(--btn-line)] bg-[var(--btn)] text-[var(--btn-ink)]'
                    : 'border-[var(--line)] bg-white text-[var(--text)] hover:border-[var(--btn-line)]'
                }`}
              >
                <Icon size={17} />
                {n.label}
              </Link>
            );
          })}
        </nav>

        <main>{children}</main>
      </div>
    </div>
  );
}
