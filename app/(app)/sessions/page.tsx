'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useGang } from '@/lib/gang-context';
import { fetchSessions, formatThaiDate, sessionTotal, shareOf } from '@/lib/queries';
import { formatFull, formatShort, perPersonOf } from '@/lib/money';
import { STATUS_LABELS, type SessionFull, type SessionStatus } from '@/lib/types';

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function HistoryPage() {
  const { current, canEdit } = useGang();
  const gangId = current?.gang.id ?? '';
  const mode = current?.gang.rounding_mode ?? 'ceil_1000';

  const [sessions, setSessions] = useState<SessionFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [playerQ, setPlayerQ] = useState('');
  const [itemQ, setItemQ] = useState('');
  const [statusQ, setStatusQ] = useState<'' | SessionStatus>('');

  useEffect(() => {
    if (!gangId) return;
    let cancelled = false;
    setLoading(true);
    fetchSessions(gangId, from || undefined, to || undefined)
      .then((rows) => {
        if (!cancelled) {
          setSessions(rows);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [gangId, from, to]);

  const filtered = useMemo(() => {
    const pq = playerQ.trim().toLowerCase();
    const iq = itemQ.trim().toLowerCase();
    return sessions.filter((s) => {
      if (statusQ && s.status !== statusQ) return false;
      if (pq && !s.session_players.some((sp) => (sp.players?.name ?? '').toLowerCase().includes(pq))) return false;
      if (iq && !s.session_items.some((i) => i.name.toLowerCase().includes(iq))) return false;
      return true;
    });
  }, [sessions, playerQ, itemQ, statusQ]);

  function exportCsv() {
    const header = ['วันที่', 'ชื่อรอบ', 'สถานะ', 'ราคารวม', 'จำนวนคน', 'ต่อคน', 'จ่ายแล้ว', 'ไอเทม', 'ผู้เข้าร่วม'];
    const rows = filtered.map((s) => {
      const total = sessionTotal(s);
      const per = perPersonOf(total, s.session_players.length, mode);
      return [
        s.session_date,
        s.title ?? '',
        STATUS_LABELS[s.status],
        total,
        s.session_players.length,
        per ?? '',
        s.session_players.filter((p) => p.is_paid).length,
        s.session_items.map((i) => `${i.name} ${i.price}${i.quantity > 1 ? ` x${i.quantity}` : ''}`).join('; '),
        s.session_players.map((p) => `${p.players?.name ?? '?'}${p.is_paid ? '(จ่ายแล้ว)' : ''}`).join('; '),
      ];
    });
    const csv = '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `gang-loot-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold">ประวัติรอบแบ่งของ</h1>
        <div className="flex gap-2">
          <button className="btn btn-sm" onClick={exportCsv} disabled={filtered.length === 0}>
            ⬇ Export CSV
          </button>
          {canEdit && (
            <Link href="/sessions/new" className="btn btn-sm btn-primary">
              + สร้างรอบ
            </Link>
          )}
        </div>
      </div>

      <section className="card grid gap-3 sm:grid-cols-5">
        <div>
          <label className="label">ตั้งแต่วันที่</label>
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">ถึงวันที่</label>
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <label className="label">ชื่อผู้เล่น</label>
          <input className="input" value={playerQ} onChange={(e) => setPlayerQ(e.target.value)} />
        </div>
        <div>
          <label className="label">ชื่อไอเทม</label>
          <input className="input" value={itemQ} onChange={(e) => setItemQ(e.target.value)} />
        </div>
        <div>
          <label className="label">สถานะ</label>
          <select className="input" value={statusQ} onChange={(e) => setStatusQ(e.target.value as '' | SessionStatus)}>
            <option value="">ทั้งหมด</option>
            {(Object.keys(STATUS_LABELS) as SessionStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </section>

      {error && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
      {loading && <p className="text-sm text-violet-200/70">กำลังโหลด...</p>}
      {!loading && filtered.length === 0 && <p className="card text-sm text-violet-200/70">ไม่พบรอบที่ตรงเงื่อนไข</p>}

      <ul className="space-y-2">
        {filtered.map((s) => {
          const total = sessionTotal(s);
          const per = s.session_players.length ? shareOf(s, s.session_players[0], mode) : null;
          const paidCount = s.session_players.filter((p) => p.is_paid).length;
          return (
            <li key={s.id}>
              <Link href={`/sessions/${s.id}`} className="card block transition hover:bg-[#231954]/85">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-violet-200/70">{formatThaiDate(s.session_date)}</span>
                    <span className="font-medium">{s.title || 'รอบแบ่งของ'}</span>
                    <span
                      className={`badge ${
                        s.status === 'completed'
                          ? 'bg-emerald-500/20 text-emerald-200'
                          : s.status === 'open'
                            ? 'bg-amber-500/20 text-amber-200'
                            : 'bg-slate-500/30 text-slate-200'
                      }`}
                    >
                      {STATUS_LABELS[s.status]}
                    </span>
                  </div>
                  <div className="text-right text-sm tabular-nums">
                    <span className="font-bold">{formatShort(total)}</span>
                    <span className="text-violet-200/60"> ({formatFull(total)})</span>
                    {per !== null && <span className="ml-2 text-emerald-300">คนละ {formatShort(per)}</span>}
                  </div>
                </div>
                <div className="mt-1 text-xs text-violet-200/70">
                  {s.session_items.map((i) => `${i.name} ${formatShort(i.price)}`).join(' · ') || 'ไม่มีไอเทม'}
                </div>
                <div className="mt-1 text-xs text-violet-200/70">
                  👥 {s.session_players.map((p) => p.players?.name ?? '?').join(', ') || '-'} · จ่ายแล้ว {paidCount}/
                  {s.session_players.length}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
