'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useGang } from '@/lib/gang-context';
import { fetchSessions, formatThaiDate, sessionTotal, shareOf } from '@/lib/queries';
import { formatFull, formatShort, perPersonOf } from '@/lib/money';
import { STATUS_LABELS, type SessionFull, type SessionStatus } from '@/lib/types';
import { IconDownload, IconPlus, IconUsers } from '@/components/Icons';

const STATUS_TONE: Record<SessionStatus, string> = {
  completed: 'tone-mint',
  open: 'tone-butter',
  draft: 'tone-chip',
};

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
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">ประวัติรอบแบ่งของ</h1>
        <div className="flex gap-2">
          <button className="btn btn-sm" onClick={exportCsv} disabled={filtered.length === 0}>
            <IconDownload size={16} />
            Export CSV
          </button>
          {canEdit && (
            <Link href="/sessions/new" className="btn btn-sm btn-primary">
              <IconPlus size={16} />
              สร้างรอบ
            </Link>
          )}
        </div>
      </div>

      <section className="card grid gap-4 sm:grid-cols-5">
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

      {error && <p className="alert tone-bad">{error}</p>}
      {loading && <p className="text-sm muted">กำลังโหลด...</p>}
      {!loading && filtered.length === 0 && <p className="card text-sm muted">ไม่พบรอบที่ตรงเงื่อนไข</p>}

      <ul className="space-y-2">
        {filtered.map((s) => {
          const total = sessionTotal(s);
          const per = s.session_players.length ? shareOf(s, s.session_players[0], mode) : null;
          const paidCount = s.session_players.filter((p) => p.is_paid).length;
          return (
            <li key={s.id}>
              <Link href={`/sessions/${s.id}`} className="card block !p-5 transition hover:border-[var(--btn-line)]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="muted text-sm">{formatThaiDate(s.session_date)}</span>
                    <span className="font-semibold">{s.title || 'รอบแบ่งของ'}</span>
                    <span className={`badge ${STATUS_TONE[s.status]}`}>{STATUS_LABELS[s.status]}</span>
                  </div>
                  <div className="text-right text-sm tabular-nums">
                    <span className="font-bold">{formatShort(total)}</span>
                    <span className="muted"> ({formatFull(total)})</span>
                    {per !== null && <span className="badge tone-pink ml-2">คนละ {formatShort(per)}</span>}
                  </div>
                </div>
                <div className="mt-2 text-sm">
                  {s.session_items.map((i) => `${i.name} ×${i.quantity} (${formatShort(i.price)})`).join(' · ') || 'ไม่มีไอเทม'}
                </div>
                <div className="muted mt-1 flex items-start gap-1.5 text-sm">
                  <IconUsers size={16} className="mt-0.5 shrink-0" />
                  <span>
                  {s.session_players.map((p) => p.players?.name ?? '?').join(', ') || '-'} · จ่ายแล้ว {paidCount}/
                  {s.session_players.length}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
