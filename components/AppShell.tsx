'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useGang } from '@/lib/gang-context';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { ROLE_LABELS } from '@/lib/types';
import { ViperLogoFull, ViperLogoMark } from '@/components/ViperLogo';

const NAV = [
  { href: '/', label: 'Dashboard' },
  { href: '/sessions/new', label: '+ สร้างรอบ', editOnly: true },
  { href: '/sessions', label: 'ประวัติ' },
  { href: '/items', label: 'ไอเทม' },
  { href: '/players', label: 'ผู้เล่น' },
  { href: '/activity', label: 'กิจกรรม' },
  { href: '/settings', label: 'ตั้งค่า' },
];

function Centered({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex min-h-screen max-w-md items-center justify-center p-4">{children}</div>;
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
          <h1 className="mt-2 text-xl font-bold">ยินดีต้อนรับ 👋</h1>
          <p className="text-sm text-violet-200/70">คุณยังไม่ได้อยู่ในแก็งไหน เลือกอย่างใดอย่างหนึ่ง</p>
        </div>
        {error && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}

        <form onSubmit={createGang} className="card space-y-3">
          <h2 className="font-medium">สร้างแก็งใหม่ (คุณจะเป็นหัวแก็ง)</h2>
          <input className="input" placeholder="ชื่อแก็ง เช่น VIPER" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn btn-primary w-full" disabled={busy || !name.trim()}>
            สร้างแก็ง
          </button>
        </form>

        <form onSubmit={joinGang} className="card space-y-3">
          <h2 className="font-medium">เข้าร่วมด้วยรหัสเชิญ</h2>
          <input className="input" placeholder="รหัสเชิญจากหัวแก็ง" value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="btn w-full" disabled={busy || !code.trim()}>
            เข้าร่วม
          </button>
        </form>

        <button className="btn btn-sm mx-auto flex" onClick={signOut}>
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

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [authLoading, user, router]);

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
        <p className="text-violet-200/70">กำลังโหลด...</p>
      </Centered>
    );
  }

  if (!current) return <Onboarding />;

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-3 pb-28 pt-3 sm:px-4">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ViperLogoMark />
          {memberships.length > 1 ? (
            <select
              className="input !w-auto"
              value={current.gang.id}
              onChange={(e) => setCurrentGangId(e.target.value)}
            >
              {memberships.map((m) => (
                <option key={m.gang.id} value={m.gang.id}>
                  {m.gang.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-lg font-bold">{current.gang.name}</span>
          )}
          <span className="badge bg-violet-400/20 text-violet-100">{ROLE_LABELS[current.role]}</span>
        </div>
        <button className="btn btn-sm" onClick={signOut}>
          ออกจากระบบ
        </button>
      </header>

      <nav className="mb-4 flex gap-1 overflow-x-auto pb-1">
        {NAV.filter((n) => !n.editOnly || canEdit).map((n) => {
          const active =
            n.href === '/'
              ? pathname === '/'
              : pathname === n.href || (n.href === '/sessions' && pathname.startsWith('/sessions/') && pathname !== '/sessions/new');
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm transition ${
                active ? 'bg-violet-600 text-white shadow-sm shadow-violet-500/30' : 'bg-violet-400/10 text-violet-100 hover:bg-violet-400/20'
              }`}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>

      <main>{children}</main>
    </div>
  );
}
