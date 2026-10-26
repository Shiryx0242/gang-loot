'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { useGang } from '@/lib/gang-context';
import { LogoBadge } from '@/components/LogoBadge';
import { Decor } from '@/components/Icons';

export default function LoginPage() {
  const { user, authLoading } = useGang();
  const router = useRouter();
  const [mode, setMode] = useState<'magic' | 'password'>('magic');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && user) router.replace('/');
  }, [authLoading, user, router]);

  async function sendMagic(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setInfo('ส่งลิงก์เข้าสู่ระบบไปที่อีเมลแล้ว กดลิงก์ในอีเมลเพื่อเข้าใช้งาน (ถ้าไม่เจอดูในสแปม)');
  }

  async function signIn(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(error.message);
  }

  async function signUp() {
    setBusy(true);
    setError(null);
    setInfo(null);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) setError(error.message);
    else if (!data.session) setInfo('สมัครแล้ว กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ');
  }

  return (
    <div className="relative min-h-screen">
      <Decor />
      <div className="relative mx-auto flex min-h-screen max-w-sm items-center p-4">
      <div className="card w-full space-y-5">
        <div className="text-center">
          <div className="mx-auto w-fit drop-shadow-[0_0_24px_rgba(255,143,192,.45)]">
            <LogoBadge size={140} />
          </div>
          <h1 className="mt-5 text-2xl font-bold tracking-wide">VIPER Loot Splitter</h1>
          <p className="muted text-sm">แบ่งของแก็ง คำนวณหารอัตโนมัติ</p>
        </div>

        {!supabaseConfigured && (
          <p className="alert tone-butter">
            ยังไม่ได้ตั้งค่า <code>.env.local</code> (ดู README)
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button className={`btn ${mode === 'magic' ? 'btn-primary' : ''}`} onClick={() => setMode('magic')}>
            ลิงก์ทางอีเมล
          </button>
          <button className={`btn ${mode === 'password' ? 'btn-primary' : ''}`} onClick={() => setMode('password')}>
            อีเมล + รหัสผ่าน
          </button>
        </div>

        {mode === 'magic' ? (
          <form onSubmit={sendMagic} className="space-y-3">
            <div>
              <label className="label">อีเมล</label>
              <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <button className="btn btn-primary w-full" disabled={busy}>
              ส่งลิงก์เข้าสู่ระบบ
            </button>
          </form>
        ) : (
          <form onSubmit={signIn} className="space-y-3">
            <div>
              <label className="label">อีเมล</label>
              <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="label">รหัสผ่าน (อย่างน้อย 6 ตัว)</label>
              <input
                className="input"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn btn-primary" disabled={busy}>
                เข้าสู่ระบบ
              </button>
              <button type="button" className="btn" disabled={busy || !email || password.length < 6} onClick={signUp}>
                สมัครใหม่
              </button>
            </div>
          </form>
        )}

        {error && <p className="alert tone-bad">{error}</p>}
        {info && <p className="alert tone-mint">{info}</p>}
      </div>
      </div>
    </div>
  );
}
