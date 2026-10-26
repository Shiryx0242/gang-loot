'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useGang } from '@/lib/gang-context';
import { supabase } from '@/lib/supabase';
import { ACTION_LABELS, describeLog } from '@/lib/audit';
import { fetchMemberNames, formatDateTime } from '@/lib/queries';
import type { AuditLog } from '@/lib/types';

export default function ActivityPage() {
  const { current } = useGang();
  const gangId = current?.gang.id ?? '';
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!gangId) return;
    let cancelled = false;
    (async () => {
      const [{ data, error }, n] = await Promise.all([
        supabase
          .from('audit_logs')
          .select('*')
          .eq('gang_id', gangId)
          .order('created_at', { ascending: false })
          .limit(200),
        fetchMemberNames(gangId),
      ]);
      if (cancelled) return;
      if (error) setError(error.message);
      setLogs((data ?? []) as AuditLog[]);
      setNames(n);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [gangId]);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">กิจกรรมล่าสุดของแก็ง</h1>
      <p className="text-sm text-indigo-200/70">ใครแก้อะไร เมื่อไหร่ (แสดง 200 รายการล่าสุด)</p>
      {error && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
      {loading && <p className="text-sm text-indigo-200/70">กำลังโหลด...</p>}
      {!loading && logs.length === 0 && <p className="card text-sm text-indigo-200/70">ยังไม่มีกิจกรรม</p>}
      <ul className="space-y-1">
        {logs.map((l) => (
          <li key={l.id} className="card !p-3 text-sm">
            <div className="flex flex-wrap items-center gap-x-2">
              <span className="text-indigo-200/60">{formatDateTime(l.created_at)}</span>
              <span className="font-medium">{(l.actor_id && names[l.actor_id]) || 'ใครสักคน'}</span>
              <span>{ACTION_LABELS[l.action] ?? l.action}</span>
              {l.session_id && (
                <Link href={`/sessions/${l.session_id}`} className="text-indigo-300 hover:underline">
                  ดูรอบ
                </Link>
              )}
            </div>
            <div className="text-indigo-100/70">{describeLog(l)}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
