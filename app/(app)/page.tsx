'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useGang } from '@/lib/gang-context';
import { addDays, fetchSessions, formatThaiDate, localDate, sessionTotal, shareOf } from '@/lib/queries';
import { calcSplit, formatFull, formatShort } from '@/lib/money';
import type { SessionFull } from '@/lib/types';
import { IconChart, IconClock, IconCoins, IconExternal, IconWallet } from '@/components/Icons';

type Range = 'today' | '7' | '30' | 'all' | 'custom';

const RANGES: { key: Range; label: string }[] = [
  { key: 'today', label: 'วันนี้' },
  { key: '7', label: '7 วัน' },
  { key: '30', label: '30 วัน' },
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'custom', label: 'กำหนดเอง' },
];

type Tone = 'sky' | 'butter' | 'lavender' | 'pink';

function Stat({
  label,
  value,
  sub,
  extra,
  tone,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  extra?: string;
  tone: Tone;
  icon: ReactNode;
}) {
  return (
    <div className={`tone-${tone} flex-[1_1_240px] rounded-[28px] p-5 tabular-nums shadow-[var(--shadow)]`}>
      <div className="flex items-center gap-2.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/60">{icon}</span>
        <span className="text-[15px] font-medium">{label}</span>
      </div>
      <div className="mt-3 text-[44px] font-bold leading-none">{value}</div>
      {sub && <div className="mt-2 text-sm opacity-90">{sub}</div>}
      {extra && <div className="text-sm opacity-90">{extra}</div>}
    </div>
  );
}

const RANK_TONE = ['tone-butter', 'tone-sky', 'tone-pink'];

function monthYear(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('th-TH', { month: 'short', year: 'numeric' });
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
    let overage = 0;
    const byDay = new Map<string, number>();
    const players = new Map<string, { name: string; rounds: number; total: number; paid: number }>();
    const items = new Map<string, { name: string; count: number; value: number }>();
    const unpaid: { session: SessionFull; people: { name: string; share: number }[] }[] = [];

    for (const s of sessions) {
      const total = sessionTotal(s);
      totalValue += total;
      byDay.set(s.session_date, (byDay.get(s.session_date) ?? 0) + total);
      overage += Math.max(0, calcSplit(s.session_items, s.session_players.length, mode).overage ?? 0);

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

    // กราฟ 14 วันต่อเนื่อง จบที่วันสุดท้ายของช่วงที่เลือก (วันที่ไม่มีรอบ = 0)
    const end = to ?? localDate();
    const days: [string, number][] = Array.from({ length: 14 }, (_, i) => {
      const d = addDays(end, i - 13);
      return [d, byDay.get(d) ?? 0];
    });
    const maxDay = Math.max(1, ...days.map((d) => d[1]));
    return {
      rounds: sessions.length,
      totalValue,
      avg: sessions.length ? Math.round(totalValue / sessions.length) : 0,
      outstanding,
      overage,
      days,
      maxDay,
      players: [...players.values()].sort((a, b) => b.total - a.total).slice(0, 10),
      items: [...items.values()].sort((a, b) => b.value - a.value).slice(0, 8),
      unpaid,
    };
  }, [sessions, mode, to]);

  const firstMonth = monthYear(stats.days[0][0]);
  const lastMonth = monthYear(stats.days[stats.days.length - 1][0]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">ภาพรวมของแก็ง</h1>
        <div className="flex flex-wrap items-center gap-2">
          {RANGES.map((r) => (
            <button
              key={r.key}
              className={`chip ${range === r.key ? 'chip-active' : 'chip-idle'}`}
              aria-pressed={range === r.key}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {range === 'custom' && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input !w-auto"
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            aria-label="ตั้งแต่วันที่"
          />
          <span className="muted">ถึง</span>
          <input
            className="input !w-auto"
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            aria-label="ถึงวันที่"
          />
        </div>
      )}

      {error && <p className="alert tone-bad">{error}</p>}
      {loading && <p className="muted text-sm">กำลังโหลด...</p>}

      <div className="flex flex-wrap gap-4">
        <Stat tone="sky" icon={<IconClock size={20} />} label="จำนวนรอบ" value={String(stats.rounds)} sub="รอบในช่วงที่เลือก" />
        <Stat
          tone="butter"
          icon={<IconCoins size={20} />}
          label="มูลค่ารวม"
          value={formatShort(stats.totalValue)}
          sub={formatFull(stats.totalValue)}
        />
        <Stat
          tone="lavender"
          icon={<IconChart size={20} />}
          label="เฉลี่ยต่อรอบ"
          value={formatShort(stats.avg)}
          sub={formatFull(stats.avg)}
        />
        <Stat
          tone="pink"
          icon={<IconWallet size={20} />}
          label="ยอดค้างจ่าย"
          value={formatShort(stats.outstanding)}
          sub={formatFull(stats.outstanding)}
          extra={
            stats.outstanding > stats.totalValue && stats.overage > 0
              ? `รวมส่วนปัดขึ้น ${formatShort(stats.overage)}`
              : undefined
          }
        />
      </div>

      <section className="card">
        <h2 className="mb-4 text-lg font-semibold">มูลค่ารวมรายวัน (14 วันล่าสุด)</h2>
        <div className="flex h-48 items-end justify-between gap-1 tabular-nums sm:gap-2">
          {stats.days.map(([date, value]) => (
            <div key={date} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
              {value > 0 && (
                <span className="whitespace-nowrap text-[10px] font-semibold sm:text-xs">{formatShort(value)}</span>
              )}
              <div
                className="w-full max-w-[44px] rounded-b-[4px] rounded-t-[12px]"
                style={
                  value > 0
                    ? { height: `max(10px, ${(value / stats.maxDay) * 82}%)`, background: 'var(--bar)' }
                    : { height: '10px', background: 'var(--bar-dim)' }
                }
                title={`${formatThaiDate(date)}: ${formatFull(value)}`}
              />
              <span className="muted text-[11px] sm:text-xs">{Number(date.slice(8))}</span>
            </div>
          ))}
        </div>
        <p className="muted mt-2 text-right text-sm">
          {firstMonth === lastMonth ? lastMonth : `${firstMonth} – ${lastMonth}`}
        </p>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 text-lg font-semibold">อันดับผู้เล่น (ยอดสะสม)</h2>
          {stats.players.length === 0 ? (
            <p className="muted text-sm">ยังไม่มีข้อมูล</p>
          ) : (
            <ol className="space-y-2">
              {stats.players.map((p, i) => {
                const owe = p.total - p.paid;
                return (
                  <li key={p.name + i} className="row-soft flex items-center gap-3 px-3 py-2.5 tabular-nums">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                        RANK_TONE[i] ?? 'border-[1.5px] border-[var(--chip-line)] bg-white'
                      }`}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{p.name}</div>
                      <div className="muted text-xs">{p.rounds} รอบ</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-bold">{formatShort(p.total)}</span>
                      {owe > 0 ? (
                        <span className="badge tone-bad !px-2.5 !text-xs">ค้าง {formatShort(owe)}</span>
                      ) : (
                        <span className="badge tone-mint !px-2.5 !text-xs">ครบแล้ว</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <section className="card">
          <h2 className="mb-3 text-lg font-semibold">ไอเทมมูลค่าสูงสุด</h2>
          {stats.items.length === 0 ? (
            <p className="muted text-sm">ยังไม่มีข้อมูล</p>
          ) : (
            <ul className="space-y-4">
              {stats.items.map((it) => (
                <li key={it.name} className="tabular-nums">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 truncate font-medium">{it.name}</span>
                    <span className="badge tone-lavender !px-2.5 !text-xs">×{it.count}</span>
                    <span className="ml-auto font-bold">{formatShort(it.value)}</span>
                  </div>
                  <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-[var(--bar-dim)]">
                    <div
                      className="h-full rounded-full bg-[var(--bar)]"
                      style={{ width: `${stats.totalValue > 0 ? (it.value / stats.totalValue) * 100 : 0}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card">
        <h2 className="mb-3 text-lg font-semibold">รายการค้างจ่าย</h2>
        {stats.unpaid.length === 0 ? (
          <p className="alert tone-mint">ไม่มีค้างจ่าย</p>
        ) : (
          <ul className="space-y-3">
            {stats.unpaid.map(({ session, people }) => (
              <li key={session.id} className="row-soft p-3 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">
                    {formatThaiDate(session.session_date)} · {session.title || 'รอบแบ่งของ'}
                  </span>
                  <Link href={`/sessions/${session.id}`} className="btn btn-sm">
                    <IconExternal size={16} />
                    เปิดรอบ
                  </Link>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {people.map((p) => (
                    <span key={p.name} className="badge tone-bad py-1">
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
