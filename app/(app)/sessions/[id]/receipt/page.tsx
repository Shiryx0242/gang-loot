'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toPng } from 'html-to-image';
import { useGang } from '@/lib/gang-context';
import { supabase } from '@/lib/supabase';
import { calcSplit, formatFull, formatShort } from '@/lib/money';
import { buildDiscordText } from '@/lib/discord';
import { LogoBadge } from '@/components/LogoBadge';
import { IconCheck, IconCopy } from '@/components/Icons';
import type { SessionItem, SessionRow } from '@/lib/types';

const DEFAULT_PAY_NUMBER = '180772';

interface Member {
  name: string;
  isPaid: boolean;
}

/** 2026-10-27 → 27/10/2569 */
function formatBuddhistDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y + 543}`;
}

export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const { current } = useGang();
  const gangId = current?.gang.id ?? '';
  const mode = current?.gang.rounding_mode ?? 'ceil_1000';

  const cardRef = useRef<HTMLDivElement>(null);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [items, setItems] = useState<SessionItem[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [payNumber, setPayNumber] = useState<string>(DEFAULT_PAY_NUMBER);
  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, its, sps] = await Promise.all([
      supabase.from('sessions').select('*').eq('id', id).maybeSingle(),
      supabase.from('session_items').select('*').eq('session_id', id).order('created_at').order('id'),
      supabase.from('session_players').select('is_paid, players(name)').eq('session_id', id),
    ]);
    if (s.error || !s.data) {
      setNotFound(true);
      setLoaded(true);
      return;
    }
    setSession(s.data as SessionRow);
    setItems((its.data ?? []) as SessionItem[]);
    const rows = (sps.data ?? []) as unknown as { is_paid: boolean; players: { name: string } | { name: string }[] | null }[];
    setMembers(
      rows
        .map((r) => ({ name: (Array.isArray(r.players) ? r.players[0]?.name : r.players?.name) ?? '?', isPaid: r.is_paid }))
        .sort((a, b) => a.name.localeCompare(b.name, 'th')),
    );
    setLoaded(true);
  }, [id]);

  useEffect(() => {
    if (gangId) load();
  }, [gangId, load]);

  // เบอร์รับเงิน: ถ้ายังไม่ได้รัน schema-patch-3.sql (ไม่มีคอลัมน์) ใช้ค่าตั้งต้น
  useEffect(() => {
    if (!gangId) return;
    supabase
      .from('gangs')
      .select('pay_number')
      .eq('id', gangId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) return;
        setPayNumber(((data as { pay_number: string | null } | null)?.pay_number ?? '').trim());
      });
  }, [gangId]);

  const split = useMemo(() => calcSplit(items, members.length, mode), [items, members.length, mode]);
  const perShort = split.perPerson === null ? '-' : formatShort(split.perPerson);
  const hasRounding = split.perPerson !== null && split.raw !== null && split.perPerson !== Math.round(split.raw);

  async function saveImage() {
    if (!cardRef.current || !session) return;
    setSaving(true);
    setError(null);
    try {
      await document.fonts.ready;
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `viper-${(session.title ?? 'session').trim().replace(/[\\/:*?"<>|\s]+/g, '-')}-${session.session_date}.png`;
      a.click();
    } catch (e) {
      setError('บันทึกรูปไม่สำเร็จ: ' + (e instanceof Error ? e.message : 'unknown'));
    }
    setSaving(false);
  }

  async function copyDiscord() {
    let text = buildDiscordText(members, items, split);
    if (payNumber) text += `\nขอมาที่เบอร์ ${payNumber} คนละ ${perShort}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  if (!current) return null;
  if (!loaded) return <p className="muted">กำลังโหลด...</p>;
  if (notFound || !session) {
    return (
      <div className="card space-y-3">
        <p>ไม่พบรอบนี้ หรือคุณไม่มีสิทธิ์ดู</p>
        <Link href="/sessions" className="btn btn-sm">
          กลับไปประวัติ
        </Link>
      </div>
    );
  }

  const title = session.title?.trim() || 'รอบแบ่งของ';

  return (
    <div className="mx-auto w-full max-w-[460px] space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/sessions/${id}`} className="btn btn-sm">
          กลับ
        </Link>
        <button className="btn btn-sm btn-primary" onClick={saveImage} disabled={saving}>
          {saving ? 'กำลังสร้างรูป...' : 'บันทึกเป็นรูป'}
        </button>
        <button className="btn btn-sm" onClick={copyDiscord}>
          {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
          {copied ? 'คัดลอกแล้ว' : 'คัดลอกข้อความ Discord'}
        </button>
      </div>
      {error && <p className="alert tone-bad">{error}</p>}

      <div
        ref={cardRef}
        className="relative overflow-hidden rounded-[32px] bg-[#fffdf8] px-[22px] py-6 text-[#2f3d5c] shadow-[0_14px_36px_rgba(110,150,205,.22)]"
        style={{ fontFamily: "'Fredoka','Mali',system-ui,sans-serif" }}
      >
        <svg aria-hidden="true" className="pointer-events-none absolute -left-4 -top-1 w-36" viewBox="0 0 220 110" fill="#e9f2fc">
          <ellipse cx="70" cy="66" rx="52" ry="30" />
          <ellipse cx="118" cy="50" rx="44" ry="38" />
          <ellipse cx="160" cy="72" rx="40" ry="26" />
          <rect x="40" y="66" width="140" height="30" rx="15" />
        </svg>
        <svg aria-hidden="true" className="pointer-events-none absolute right-3 top-3 w-24" viewBox="0 0 120 90">
          <path d="M84 6c2 14 6 18 20 20-14 2-18 6-20 20-2-14-6-18-20-20 14-2 18-6 20-20Z" fill="#ffe58a" />
          <path d="M34 34c1.4 9 4 11.6 13 13-9 1.4-11.6 4-13 13-1.4-9-4-11.6-13-13 9-1.4 11.6-4 13-13Z" fill="#ffb6d3" />
          <path d="M96 58c1 6 2.6 7.6 8.6 8.6-6 1-7.6 2.6-8.6 8.6-1-6-2.6-7.6-8.6-8.6 6-1 7.6-2.6 8.6-8.6Z" fill="#ffb6d3" />
        </svg>

        <div className="relative flex flex-col items-center text-center">
          <LogoBadge size={76} />
          <div className="mt-3 text-[32px] font-bold uppercase leading-tight tracking-wide">VIPER</div>
          <div className="text-sm text-[#5d6b86]">
            {title} · {formatBuddhistDate(session.session_date)}
          </div>
        </div>

        <div className="my-4 border-t-2 border-dashed border-[#e3d9d0]" />

        <ul className="space-y-1.5">
          {items.map((i) => (
            <li key={i.id} className="flex items-baseline justify-between gap-3 text-[15px]">
              <span className="min-w-0">
                <b className="font-semibold">{i.name}</b>{' '}
                <span className="text-[#5d6b86]">
                  {formatShort(i.price)} × {i.quantity}
                </span>
              </span>
              <span className="shrink-0 text-[#8a94a8]">{formatFull(i.price * i.quantity)}</span>
            </li>
          ))}
        </ul>

        <div className="my-4 border-t-2 border-dashed border-[#e3d9d0]" />

        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[15px]">ยอดรวม · หาร {members.length} คน</span>
          <span className="text-[19px] font-bold">{formatFull(split.total)}</span>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 rounded-[22px] bg-[#ffe0e9] px-5 py-3 text-[#5a2a40]">
          <span className="text-[24px]">คนละ</span>
          <span className="text-[40px] font-bold leading-tight">{split.perPerson === null ? '-' : formatFull(split.perPerson)}</span>
        </div>
        {split.perPerson !== null && split.raw !== null && (
          <p className="mt-1.5 text-center text-xs text-[#5d6b86]">
            {formatFull(split.total)} ÷ {members.length} = {formatFull(split.raw)}
            {hasRounding && mode === 'ceil_1000' && ' · ปัดขึ้นเป็นหลักพัน'}
          </p>
        )}

        <div className="my-4 border-t-2 border-dashed border-[#e3d9d0]" />

        <h2 className="mb-2 text-[15px] font-semibold">รายชื่อ ({members.length} คน)</h2>
        <div className="flex flex-wrap gap-1.5">
          {members.map((m) => (
            <span key={m.name} className="rounded-full border border-[#cddff3] bg-[#f3f8ff] px-3 py-0.5 text-sm">
              {m.name}
            </span>
          ))}
        </div>

        {payNumber && (
          <div className="mt-5 rounded-[26px] bg-[#ffd3e4] px-4 py-5 text-center text-[#5a2a40]">
            <div className="text-base">ขอมาที่เบอร์</div>
            <div className="text-[46px] font-bold leading-tight tracking-wider">{payNumber}</div>
            <div className="mt-1 text-[30px] font-bold">คนละ {perShort}</div>
          </div>
        )}
      </div>
    </div>
  );
}
