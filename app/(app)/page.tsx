'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useGang } from '@/lib/gang-context';
import { addDays, fetchSessions, formatThaiDate, localDate, sessionTotal, shareOf } from '@/lib/queries';
import { formatFull, formatShort } from '@/lib/money';
import type { SessionFull } from '@/lib/types';

type Range = 'today' | '7' | '30' | 'all' | 'custom';

const RANGES: { key: Range; label: string }[] = [
  { key: 'today', label: 'วันนี้' },
  { key: '7', label: '7 วัน' },
  { key: '30', label: '30 วัน' },
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'custom', label: 'กำหนดเอง' },
];

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'bad' }) {
  return (
    <div className="card tabular-nums">
      <div className="text-xs text-violet-200/70">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone === 'bad' ? 'text-red-300' : ''}`}>{value}</div>
      {sub && <div className="text-xs text-violet-200/60">{sub}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const { current } = useGang();
  const gangId = current?.gang.id ?? '';
  const mode = current?.gang.rounding_mode ?? 'ceil_1000';

  const [range, setRange] = useState<Range>('30');
  const [customFrom, setCustomFrom] = useState(addDays(localDate(), -30));
  const [customTo, setCustomTo] = useState(localDate());
  const [sessions, setSessions] = useState<SessionFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { from, to } = useMemo(() => {
    const today = localDate();
    if (range === 'today') return { from: today, to: today };
    if (range === '7') return { from: addDays(today, -6), to: today };
    if (range === '30') return { from: addDays(today, -29), to: today };
    if (range === 'custom') return { from: customFrom || undefined, to: customTo || undefined };
    return { from: undefined, to: undefined };
  }, [range, customFrom, customTo]);

  useEffect(() => {
    if (!gangId) return;
    let cancelled = false;
    setLoading(true);
    fetchSessions(gangId, from, to)
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

  const stats = useMemo(() => {
    let totalValue = 0;
    let outstanding = 0;
    const byDay = new Map<string, number>();
    const players = new Map<string, { name: string; rounds: number; total: number; paid: number }>();
    const items = new Map<string, { name: string; count: number; value: number }>();
    const unpaid: { session: SessionFull; people: { name: string; share: number }[] }[] = [];

    for (const s of sessions) {
      const total = sessionTotal(s);
      totalValue += total;
      byDay.set(s.session_date, (byDay.get(s.session_date) ?? 0) + total);

      for (const it of s.session_items) {
        const key = it.name.trim().toLowerCase();
        const e = items.get(key) ?? { name: it.name.trim(), count: 0, value: 0 };
        e.count += it.quantity;
        e.value += it.price * it.quantity;
        items.set(key, e);
      }

      const pending: { name: string; share: number }[] = [];
      for (const sp of s.session_players) {
        const share = shareOf(s, sp, mode);
        const name = sp.players?.name ?? '(ไม่ทราบชื่อ)';
        const e = players.get(sp.player_id) ?? { name, rounds: 0, total: 0, paid: 0 };
        e.rounds += 1;
        e.total += share;
        if (sp.is_paid) e.paid += share;
        else {
          outstanding += share;
          pending.push({ name, share });
        }
        players.set(sp.player_id, e);
      }
      if (pending.length) unpaid.push({ session: s, people: pending });
    }

    const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-14);
    const maxDay = Math.max(1, ...days.map((d) => d[1]));
    return {
      rounds: sessions.length,
      totalValue,
      avg: sessions.length ? Math.round(totalValue / sessions.length) : 0,
      outstanding,
      days,
      maxDay,
      players: [...players.values()].sort((a, b) => b.total - a.total).slice(0, 10),
      items: [...items.values()].sort((a, b) => b.value - a.value).slice(0, 8),
      unpaid,
    };
  }, [sessions, mode]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <button key={r.key} className={`btn btn-sm ${range === r.key ? 'btn-primary' : ''}`} onClick={() => setRange(r.key)}>
            {r.label}
          </button>
        ))}
        {range === 'custom' && (
          <div className="flex items-center gap-1">
            <input className="input !w-auto" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            <span>–</span>
            <input className="input !w-auto" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </div>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
      {loading && <p className="text-sm text-violet-200/70">กำลังโหลด...</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="จำนวนรอบ" value={String(stats.rounds)} />
        <Stat label="มูลค่ารวมที่แบ่ง" value={formatShort(stats.totalValue)} sub={formatFull(stats.totalValue)} />
        <Stat label="เฉลี่ยต่อรอบ" value={formatShort(stats.avg)} sub={formatFull(stats.avg)} />
        <Stat
          label="ยอดค้างจ่าย"
          value={formatShort(stats.outstanding)}
          sub={formatFull(stats.outstanding)}
          tone={stats.outstanding > 0 ? 'bad' : undefined}
        />
      </div>

      <section className="card">
        <h2 className="mb-3 font-medium">มูลค่ารวมรายวัน (14 วันล่าสุดที่มีรอบ)</h2>
        {stats.days.length === 0 ? (
          <p className="text-sm text-violet-200/60">ยังไม่มีข้อมูลในช่วงนี้</p>
        ) : (
          <div className="flex h-44 items-end gap-2 tabular-nums">
            {stats.days.map(([date, value]) => (
              <div key={date} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[10px] text-violet-100">{formatShort(value)}</span>
                <div
                  className="w-full rounded-t-md bg-gradient-to-t from-violet-700 via-purple-500 to-fuchsia-400"
                  style={{ height: `${Math.max(4, (value / stats.maxDay) * 100)}%` }}
                  title={`${formatThaiDate(date)}: ${formatFull(value)}`}
                />
                <span className="text-[10px] text-violet-200/60">{formatThaiDate(date).replace(/ \d+$/, '')}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card">
          <h2 className="mb-2 font-medium">อันดับผู้เล่น (ยอดสะสม)</h2>
          {stats.players.length === 0 ? (
            <p className="text-sm text-violet-200/60">ยังไม่มีข้อมูล</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">#</th>
                  <th className="th">ชื่อ</th>
                  <th className="th text-right">รอบ</th>
                  <th className="th text-right">ยอดรวม</th>
                  <th className="th text-right">ค้าง</th>
                </tr>
              </thead>
              <tbody>
                {stats.players.map((p, i) => (
                  <tr key={p.name + i} className="border-t border-violet-300/10">
                    <td className="td">{i + 1}</td>
                    <td className="td">{p.name}</td>
                    <td className="td text-right">{p.rounds}</td>
                    <td className="td text-right">{formatShort(p.total)}</td>
                    <td className={`td text-right ${p.total - p.paid > 0 ? 'text-red-300' : 'text-emerald-300'}`}>
                      {p.total - p.paid > 0 ? formatShort(p.total - p.paid) : '✅'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card">
          <h2 className="mb-2 font-medium">ไอเทมมูลค่าสูงสุด</h2>
          {stats.items.length === 0 ? (
            <p className="text-sm text-violet-200/60">ยังไม่มีข้อมูล</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">ไอเทม</th>
                  <th className="th text-right">จำนวน</th>
                  <th className="th text-right">มูลค่ารวม</th>
                </tr>
              </thead>
              <tbody>
                {stats.items.map((it) => (
                  <tr key={it.name} className="border-t border-violet-300/10">
                    <td className="td">{it.name}</td>
                    <td className="td text-right">{it.count}</td>
                    <td className="td text-right">{formatShort(it.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="card">
        <h2 className="mb-2 font-medium">รายการค้างจ่าย</h2>
        {stats.unpaid.length === 0 ? (
          <p className="text-sm text-emerald-300">ไม่มีค้างจ่าย 🎉</p>
        ) : (
          <ul className="space-y-2">
            {stats.unpaid.map(({ session, people }) => (
              <li key={session.id} className="rounded-lg border border-violet-300/10 p-3">
                <Link href={`/sessions/${session.id}`} className="text-sm font-medium text-violet-200 hover:underline">
                  {formatThaiDate(session.session_date)} · {session.title || 'รอบแบ่งของ'}
                </Link>
                <div className="mt-1 flex flex-wrap gap-1">
                  {people.map((p) => (
                    <span key={p.name} className="badge bg-red-500/15 text-red-200">
                      {p.name} {formatShort(p.share)}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
