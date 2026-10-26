'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useGang } from '@/lib/gang-context';
import { supabase } from '@/lib/supabase';
import { calcSplit, formatFull, formatShort, parseMoney } from '@/lib/money';
import { fetchMemberNames, formatDateTime, localDate } from '@/lib/queries';
import { ACTION_LABELS, describeLog, logAudit } from '@/lib/audit';
import {
  STATUS_LABELS,
  type AuditLog,
  type Player,
  type SessionItem,
  type SessionPlayerRow,
  type SessionRow,
  type SessionStatus,
} from '@/lib/types';

interface ItemDraft {
  key: string;
  name: string;
  priceText: string;
  qty: string;
}

interface PaidInfo {
  is_paid: boolean;
  paid_at: string | null;
}

let keyCounter = 0;
const newKey = () => `k${++keyCounter}`;
const emptyItem = (): ItemDraft => ({ key: newKey(), name: '', priceText: '', qty: '1' });

export default function SessionEditorPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const isNew = id === 'new';
  const router = useRouter();
  const { current, canEdit } = useGang();
  const gangId = current?.gang.id ?? '';
  const mode = current?.gang.rounding_mode ?? 'ceil_1000';

  const [players, setPlayers] = useState<Player[]>([]);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(localDate());
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<SessionStatus>('open');
  const [items, setItems] = useState<ItemDraft[]>([emptyItem()]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [paid, setPaid] = useState<Record<string, PaidInfo>>({});
  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [deletedAt, setDeletedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [dirty, setDirtyState] = useState(false);
  const [remoteChanged, setRemoteChanged] = useState(false);
  const dirtyRef = useRef(false);
  const updatedAtRef = useRef<string | null>(null);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    setDirtyState(true);
  }, []);

  const resetForm = useCallback(() => {
    setTitle('');
    setDate(localDate());
    setNote('');
    setStatus('open');
    setItems([emptyItem()]);
    setSelected({});
    setPaid({});
    setNotFound(false);
    setDeletedAt(null);
    setError(null);
    setRemoteChanged(false);
    dirtyRef.current = false;
    setDirtyState(false);
    updatedAtRef.current = null;
  }, []);

  const loadPlayers = useCallback(async () => {
    if (!gangId) return;
    const { data } = await supabase.from('players').select('*').eq('gang_id', gangId).order('name');
    setPlayers((data ?? []) as Player[]);
  }, [gangId]);

  const loadLogs = useCallback(async () => {
    if (isNew || !gangId) return;
    const { data } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('session_id', id)
      .order('created_at', { ascending: false })
      .limit(30);
    setLogs((data ?? []) as AuditLog[]);
    setNames(await fetchMemberNames(gangId));
  }, [id, isNew, gangId]);

  const loadSession = useCallback(async () => {
    const [s, its, sps] = await Promise.all([
      supabase.from('sessions').select('*').eq('id', id).maybeSingle(),
      supabase.from('session_items').select('*').eq('session_id', id).order('created_at').order('id'),
      supabase.from('session_players').select('*').eq('session_id', id),
    ]);
    if (s.error || !s.data) {
      setNotFound(true);
      setLoaded(true);
      return;
    }
    const row = s.data as SessionRow;
    const itemRows = (its.data ?? []) as SessionItem[];
    const spRows = (sps.data ?? []) as SessionPlayerRow[];

    setTitle(row.title ?? '');
    setDate(row.session_date);
    setNote(row.note ?? '');
    setStatus(row.status);
    setDeletedAt(row.deleted_at);
    updatedAtRef.current = row.updated_at;
    setItems(
      itemRows.length
        ? itemRows.map((i) => ({ key: newKey(), name: i.name, priceText: String(i.price), qty: String(i.quantity) }))
        : [emptyItem()],
    );
    const sel: Record<string, boolean> = {};
    const pd: Record<string, PaidInfo> = {};
    for (const sp of spRows) {
      sel[sp.player_id] = true;
      pd[sp.player_id] = { is_paid: sp.is_paid, paid_at: sp.paid_at };
    }
    setSelected(sel);
    setPaid(pd);
    dirtyRef.current = false;
    setDirtyState(false);
    setRemoteChanged(false);
    setNotFound(false);
    setLoaded(true);
  }, [id]);

  const loadFromTemplate = useCallback(async (fromId: string) => {
    const [s, its, sps] = await Promise.all([
      supabase.from('sessions').select('title, note').eq('id', fromId).maybeSingle(),
      supabase.from('session_items').select('*').eq('session_id', fromId).order('created_at').order('id'),
      supabase.from('session_players').select('player_id').eq('session_id', fromId),
    ]);
    const itemRows = (its.data ?? []) as SessionItem[];
    if (s.data) {
      const t = s.data as { title: string | null; note: string | null };
      setTitle(t.title ?? '');
      setNote(t.note ?? '');
    }
    if (itemRows.length) {
      setItems(itemRows.map((i) => ({ key: newKey(), name: i.name, priceText: String(i.price), qty: String(i.quantity) })));
    }
    const sel: Record<string, boolean> = {};
    for (const sp of (sps.data ?? []) as { player_id: string }[]) sel[sp.player_id] = true;
    setSelected(sel);
    markDirty();
  }, [markDirty]);

  // โหลดข้อมูลเมื่อเปิดหน้า / เปลี่ยนรอบ
  useEffect(() => {
    if (!gangId) return;
    setLoaded(false);
    loadPlayers();
    if (isNew) {
      resetForm();
      const from = new URLSearchParams(window.location.search).get('from');
      if (from) loadFromTemplate(from);
      setLogs([]);
      setLoaded(true);
    } else {
      loadSession().then(loadLogs);
    }
  }, [gangId, id, isNew, loadPlayers, loadSession, loadLogs, resetForm, loadFromTemplate]);

  // Realtime: หัวแก็ง/รองแก็งเปิดคนละที่ เห็นการเปลี่ยนแปลงทันที
  useEffect(() => {
    if (isNew || !gangId) return;
    const refreshPaid = async () => {
      const { data } = await supabase.from('session_players').select('*').eq('session_id', id);
      const pd: Record<string, PaidInfo> = {};
      for (const sp of (data ?? []) as SessionPlayerRow[]) pd[sp.player_id] = { is_paid: sp.is_paid, paid_at: sp.paid_at };
      setPaid(pd);
      loadLogs();
    };
    const onContentChange = () => {
      if (dirtyRef.current) setRemoteChanged(true);
      else loadSession().then(loadLogs);
    };
    const channel = supabase
      .channel(`session-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_players', filter: `session_id=eq.${id}` }, refreshPaid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_items', filter: `session_id=eq.${id}` }, onContentChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter: `id=eq.${id}` }, onContentChange)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, isNew, gangId, loadSession, loadLogs]);

  // ---------- คำนวณ (real-time ขณะพิมพ์) ----------
  const playerMap = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);

  const parsed = useMemo(
    () =>
      items.map((i) => ({
        key: i.key,
        name: i.name.trim(),
        price: parseMoney(i.priceText),
        quantity: Math.max(1, parseInt(i.qty, 10) || 1),
      })),
    [items],
  );

  const validItems = useMemo(
    () =>
      parsed.filter(
        (i): i is { key: string; name: string; price: number; quantity: number } => Boolean(i.name) && i.price !== null,
      ),
    [parsed],
  );

  const selectedIds = useMemo(() => players.filter((p) => selected[p.id]).map((p) => p.id), [players, selected]);
  const split = useMemo(() => calcSplit(validItems, selectedIds.length, mode), [validItems, selectedIds.length, mode]);

  const visiblePlayers = players.filter((p) => p.is_active || selected[p.id]);

  // ---------- การกระทำ ----------
  function updateItem(key: string, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
    markDirty();
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
    markDirty();
  }

  function removeItem(key: string) {
    setItems((prev) => {
      const next = prev.filter((i) => i.key !== key);
      return next.length ? next : [emptyItem()];
    });
    markDirty();
  }

  function togglePlayer(pid: string) {
    if (!canEdit) return;
    setSelected((prev) => ({ ...prev, [pid]: !prev[pid] }));
    markDirty();
  }

  async function quickAddPlayer() {
    const name = newPlayerName.trim();
    if (!name || !canEdit) return;
    const { data, error } = await supabase.from('players').insert({ gang_id: gangId, name }).select('*').single();
    if (error || !data) {
      setError('เพิ่มผู้เล่นไม่สำเร็จ: ' + (error?.message ?? ''));
      return;
    }
    const p = data as Player;
    setPlayers((prev) => [...prev, p].sort((a, b) => a.name.localeCompare(b.name, 'th')));
    setSelected((prev) => ({ ...prev, [p.id]: true }));
    markDirty();
    setNewPlayerName('');
    logAudit(gangId, null, 'player.add', { name });
  }

  async function save() {
    if (!canEdit) return;
    setError(null);
    if (!date) return setError('กรุณาเลือกวันที่');
    if (selectedIds.length === 0) return setError('กรุณาเลือกผู้เข้าร่วมอย่างน้อย 1 คน');
    const badRow = parsed.find((i) => i.name && i.price === null);
    if (badRow) return setError(`ราคาของ "${badRow.name}" ไม่ถูกต้อง (ตัวอย่าง: 250k, 1.5m, 250000)`);
    if (validItems.length === 0) return setError('กรุณาใส่ไอเทมอย่างน้อย 1 รายการ (ชื่อ + ราคา)');

    setSaving(true);
    try {
      let sid = id;
      const base = { title: title.trim() || null, session_date: date, status, note: note.trim() || null };

      if (isNew) {
        const { data, error } = await supabase
          .from('sessions')
          .insert({ ...base, gang_id: gangId })
          .select('id')
          .single();
        if (error || !data) throw error ?? new Error('insert failed');
        sid = data.id as string;
      } else {
        const { data, error } = await supabase
          .from('sessions')
          .update(base)
          .eq('id', sid)
          .eq('updated_at', updatedAtRef.current ?? '')
          .select('updated_at');
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('CONFLICT');
        updatedAtRef.current = (data[0] as { updated_at: string }).updated_at;
      }

      // ไอเทม: ลบแล้วใส่ใหม่ (ใส่ created_at เรียงลำดับเพื่อคงลำดับแถว)
      const del = await supabase.from('session_items').delete().eq('session_id', sid);
      if (del.error) throw del.error;
      const t0 = Date.now();
      const ins = await supabase.from('session_items').insert(
        validItems.map((it, idx) => ({
          session_id: sid,
          name: it.name,
          price: it.price,
          quantity: it.quantity,
          created_at: new Date(t0 + idx).toISOString(),
        })),
      );
      if (ins.error) throw ins.error;

      // ผู้เข้าร่วม
      const existing = await supabase.from('session_players').select('player_id').eq('session_id', sid);
      if (existing.error) throw existing.error;
      const existingIds = new Set(((existing.data ?? []) as { player_id: string }[]).map((r) => r.player_id));
      const selectedSet = new Set(selectedIds);
      const toRemove = [...existingIds].filter((x) => !selectedSet.has(x));
      const kept = [...existingIds].filter((x) => selectedSet.has(x));
      const toAdd = selectedIds.filter((x) => !existingIds.has(x));

      if (toRemove.length) {
        const r = await supabase.from('session_players').delete().eq('session_id', sid).in('player_id', toRemove);
        if (r.error) throw r.error;
      }
      if (toAdd.length) {
        const r = await supabase
          .from('session_players')
          .insert(toAdd.map((pid) => ({ session_id: sid, player_id: pid, share_amount: split.perPerson })));
        if (r.error) throw r.error;
      }
      if (kept.length) {
        const r = await supabase
          .from('session_players')
          .update({ share_amount: split.perPerson })
          .eq('session_id', sid)
          .in('player_id', kept);
        if (r.error) throw r.error;
      }

      await logAudit(gangId, sid, isNew ? 'session.create' : 'session.update', {
        total: split.total,
        per_person: split.perPerson,
        players: selectedIds.length,
        items: validItems.map((i) => `${i.name} ${formatShort(i.price)}`),
      });

      dirtyRef.current = false;
      setDirtyState(false);
      if (isNew) router.replace(`/sessions/${sid}`);
      else {
        await loadSession();
        await loadLogs();
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'CONFLICT') {
        setError('มีคนอื่นแก้ไขรอบนี้ไปก่อนหน้า กด "โหลดใหม่" เพื่อดูข้อมูลล่าสุด (สิ่งที่คุณแก้ค้างไว้จะหายไป)');
        setRemoteChanged(true);
      } else {
        const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'unknown';
        setError('บันทึกไม่สำเร็จ: ' + msg);
      }
    } finally {
      setSaving(false);
    }
  }

  async function togglePaid(pid: string) {
    if (!canEdit || isNew || !paid[pid]) return;
    const prevInfo = paid[pid];
    const nextPaid = !prevInfo.is_paid;
    const at = nextPaid ? new Date().toISOString() : null;
    const nextMap = { ...paid, [pid]: { is_paid: nextPaid, paid_at: at } };
    setPaid(nextMap);

    const { error } = await supabase
      .from('session_players')
      .update({ is_paid: nextPaid, paid_at: at })
      .eq('session_id', id)
      .eq('player_id', pid);
    if (error) {
      setPaid({ ...paid, [pid]: prevInfo });
      setError('เปลี่ยนสถานะไม่สำเร็จ: ' + error.message);
      return;
    }

    // สถานะรอบ: ครบทุกคน = completed, มีคนยังไม่จ่าย = open
    const ids = Object.keys(nextMap);
    const allPaid = ids.length > 0 && ids.every((k) => nextMap[k].is_paid);
    const nextStatus: SessionStatus = allPaid ? 'completed' : status === 'completed' ? 'open' : status;
    if (nextStatus !== status) {
      const r = await supabase.from('sessions').update({ status: nextStatus }).eq('id', id).select('updated_at');
      if (!r.error) {
        setStatus(nextStatus);
        const row = (r.data?.[0] ?? null) as { updated_at: string } | null;
        if (row) updatedAtRef.current = row.updated_at;
      }
    }

    await logAudit(gangId, id, 'paid.toggle', { player: playerMap[pid]?.name ?? pid, paid: nextPaid });
    loadLogs();
  }

  async function deleteSession() {
    if (!canEdit || isNew) return;
    if (!window.confirm('ลบรอบนี้? (ลบแบบซ่อน กู้คืนได้จากฐานข้อมูล)')) return;
    const { error } = await supabase.from('sessions').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) return setError('ลบไม่สำเร็จ: ' + error.message);
    await logAudit(gangId, id, 'session.delete', { title: title || date });
    router.push('/sessions');
  }

  function buildDiscordText(): string {
    const who = selectedIds
      .map((pid) => {
        const p = playerMap[pid];
        const mark = paid[pid]?.is_paid ? ' ✅' : '';
        return `@${p?.name ?? '?'}${mark}`;
      })
      .join(' ');
    const lines = validItems.map(
      (i) => `${i.name}${i.quantity > 1 ? ` x${i.quantity}` : ''} ${formatShort(i.price).toUpperCase()}`,
    );
    const totalLabel = split.total >= 1000 && split.total % 1000 === 0 ? String(split.total / 1000) : formatFull(split.total);
    const per = split.perPerson === null ? '-' : formatShort(split.perPerson);
    return [who, ...lines, `รวม ${totalLabel} คนละ ${per}`].filter(Boolean).join('\n');
  }

  async function copyDiscord() {
    const text = buildDiscordText();
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

  // ---------- แสดงผล ----------
  if (!current) return null;
  if (!loaded) return <p className="text-indigo-200/70">กำลังโหลด...</p>;
  if (notFound) {
    return (
      <div className="card space-y-2">
        <p>ไม่พบรอบนี้ หรือคุณไม่มีสิทธิ์ดู</p>
        <Link href="/sessions" className="btn btn-sm">
          กลับไปประวัติ
        </Link>
      </div>
    );
  }

  const readOnly = !canEdit;
  const doneCount = Object.values(paid).filter((p) => p.is_paid).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold">{isNew ? 'สร้างรอบใหม่' : title || 'รอบแบ่งของ'}</h1>
          {!isNew && (
            <span
              className={`badge ${
                status === 'completed'
                  ? 'bg-emerald-500/20 text-emerald-200'
                  : status === 'open'
                    ? 'bg-amber-500/20 text-amber-200'
                    : 'bg-slate-500/30 text-slate-200'
              }`}
            >
              {STATUS_LABELS[status]}
            </span>
          )}
          {deletedAt && <span className="badge bg-red-500/20 text-red-200">ถูกลบแล้ว</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-sm" onClick={copyDiscord} disabled={selectedIds.length === 0 || validItems.length === 0}>
            {copied ? '✓ คัดลอกแล้ว' : '📋 คัดลอกข้อความ Discord'}
          </button>
          {!isNew && canEdit && (
            <>
              <Link href={`/sessions/new?from=${id}`} className="btn btn-sm">
                ทำสำเนา
              </Link>
              <button className="btn btn-sm btn-danger" onClick={deleteSession}>
                ลบรอบ
              </button>
            </>
          )}
        </div>
      </div>

      {readOnly && <p className="rounded-lg bg-indigo-400/10 p-3 text-sm text-indigo-100">คุณเป็นสมาชิก ดูได้อย่างเดียว</p>}
      {remoteChanged && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-100">
          มีการแก้ไขรอบนี้จากอีกเครื่อง
          <button className="btn btn-sm" onClick={() => loadSession().then(loadLogs)}>
            โหลดใหม่
          </button>
        </div>
      )}
      {error && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}

      <section className="card grid gap-3 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="label">ชื่อรอบ / หมายเหตุสั้น ๆ</label>
          <input
            className="input"
            placeholder="เช่น Battle Force Reward"
            value={title}
            disabled={readOnly}
            onChange={(e) => {
              setTitle(e.target.value);
              markDirty();
            }}
          />
        </div>
        <div>
          <label className="label">วันที่</label>
          <input
            className="input"
            type="date"
            value={date}
            disabled={readOnly}
            onChange={(e) => {
              setDate(e.target.value);
              markDirty();
            }}
          />
        </div>
        <div>
          <label className="label">สถานะ</label>
          <select
            className="input"
            value={status}
            disabled={readOnly}
            onChange={(e) => {
              setStatus(e.target.value as SessionStatus);
              markDirty();
            }}
          >
            {(Object.keys(STATUS_LABELS) as SessionStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-4">
          <label className="label">โน้ต (ถ้ามี)</label>
          <input
            className="input"
            value={note}
            disabled={readOnly}
            onChange={(e) => {
              setNote(e.target.value);
              markDirty();
            }}
          />
        </div>
      </section>

      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">ผู้เข้าร่วม ({selectedIds.length} คน)</h2>
          {!isNew && selectedIds.length > 0 && (
            <span className="text-xs text-indigo-200/70">
              จ่ายแล้ว {doneCount}/{Object.keys(paid).length}
            </span>
          )}
        </div>

        {visiblePlayers.length === 0 && (
          <p className="text-sm text-indigo-200/60">ยังไม่มีรายชื่อผู้เล่น เพิ่มชื่อด้านล่างได้เลย</p>
        )}
        <div className="flex flex-wrap gap-2">
          {visiblePlayers.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={readOnly}
              onClick={() => togglePlayer(p.id)}
              className={`rounded-full border px-3 py-1 text-sm transition ${
                selected[p.id]
                  ? 'border-indigo-400 bg-indigo-500/40 text-white'
                  : 'border-indigo-300/20 bg-transparent text-indigo-100/70 hover:bg-indigo-400/10'
              } ${!p.is_active ? 'opacity-60' : ''}`}
            >
              {selected[p.id] ? '✓ ' : ''}
              {p.name}
            </button>
          ))}
        </div>

        {canEdit && (
          <div className="flex gap-2">
            <input
              className="input"
              placeholder="เพิ่มผู้เล่นใหม่ (ชื่อในเกม)"
              value={newPlayerName}
              onChange={(e) => setNewPlayerName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  quickAddPlayer();
                }
              }}
            />
            <button type="button" className="btn" onClick={quickAddPlayer} disabled={!newPlayerName.trim()}>
              เพิ่ม
            </button>
          </div>
        )}

        {selectedIds.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">ชื่อ</th>
                  <th className="th text-right">ยอดต่อคน</th>
                  <th className="th text-right">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {selectedIds.map((pid) => {
                  const info = paid[pid];
                  return (
                    <tr key={pid} className="border-t border-indigo-300/10">
                      <td className="td">{playerMap[pid]?.name}</td>
                      <td className="td text-right">{split.perPerson === null ? '-' : formatFull(split.perPerson)}</td>
                      <td className="td text-right">
                        {info ? (
                          <button
                            type="button"
                            disabled={readOnly}
                            onClick={() => togglePaid(pid)}
                            className={`btn btn-sm ${info.is_paid ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-200' : ''}`}
                            title={info.paid_at ? formatDateTime(info.paid_at) : ''}
                          >
                            {info.is_paid ? '✅ จ่ายแล้ว' : 'ยังไม่จ่าย'}
                          </button>
                        ) : (
                          <span className="text-xs text-indigo-200/50">บันทึกก่อนจึงติ๊กได้</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="font-medium">ไอเทม</h2>
        <div className="space-y-2">
          {items.map((it, idx) => {
            const p = parsed[idx];
            const badPrice = Boolean(it.priceText.trim()) && p.price === null;
            return (
              <div key={it.key} className="rounded-xl border border-indigo-300/10 p-2">
                <div className="flex gap-2">
                  <input
                    className="input"
                    placeholder="ชื่อไอเทม เช่น BOX CIL"
                    value={it.name}
                    disabled={readOnly}
                    onChange={(e) => updateItem(it.key, { name: e.target.value })}
                  />
                  {canEdit && (
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => removeItem(it.key)} title="ลบแถว">
                      ✕
                    </button>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    className={`input !w-32 ${badPrice ? '!border-red-400' : ''}`}
                    placeholder="ราคา 250k"
                    inputMode="text"
                    value={it.priceText}
                    disabled={readOnly}
                    onChange={(e) => updateItem(it.key, { priceText: e.target.value })}
                  />
                  <span className="text-sm text-indigo-200/60">×</span>
                  <input
                    className="input !w-16"
                    inputMode="numeric"
                    value={it.qty}
                    disabled={readOnly}
                    onChange={(e) => updateItem(it.key, { qty: e.target.value.replace(/[^\d]/g, '') })}
                  />
                  <span className={`ml-auto text-sm ${badPrice ? 'text-red-300' : 'text-indigo-100'}`}>
                    {badPrice ? 'ราคาไม่ถูกต้อง' : p.price !== null ? `= ${formatFull(p.price * p.quantity)}` : ''}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        {canEdit && (
          <button type="button" className="btn" onClick={addItem}>
            + เพิ่มไอเทม
          </button>
        )}
      </section>

      {!isNew && (
        <section className="card">
          <h2 className="mb-2 font-medium">ประวัติการแก้ไขของรอบนี้</h2>
          {logs.length === 0 ? (
            <p className="text-sm text-indigo-200/60">ยังไม่มีบันทึก</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {logs.map((l) => (
                <li key={l.id} className="flex flex-wrap gap-x-2 border-t border-indigo-300/10 pt-1">
                  <span className="text-indigo-200/60">{formatDateTime(l.created_at)}</span>
                  <span className="font-medium">{(l.actor_id && names[l.actor_id]) || 'ใครสักคน'}</span>
                  <span>{ACTION_LABELS[l.action] ?? l.action}</span>
                  <span className="text-indigo-100/70">{describeLog(l)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* แถบสรุปติดด้านล่าง */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-indigo-300/20 bg-[#0b1233]/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-sm text-indigo-200/70">รวม</span>
            <span className="text-lg font-bold">{formatFull(split.total)}</span>
            <span className="text-sm text-indigo-200/70">÷ {selectedIds.length || '-'} =</span>
            <span className="text-xl font-bold text-emerald-300">
              {split.perPerson === null ? '-' : `${formatShort(split.perPerson)} (${formatFull(split.perPerson)})`}
            </span>
            <span className="text-sm text-indigo-200/70">ต่อคน</span>
            {split.overage !== null && split.overage > 0 && (
              <span className="text-xs text-amber-200">ส่วนเกินจากการปัด {formatFull(split.overage)}</span>
            )}
            {split.overage !== null && split.overage < 0 && (
              <span className="text-xs text-amber-200">ขาดจากการปัด {formatFull(-split.overage)}</span>
            )}
          </div>
          {canEdit && (
            <button className="btn btn-primary" onClick={save} disabled={saving || (!isNew && !dirty)}>
              {saving ? 'กำลังบันทึก...' : isNew ? 'บันทึกรอบ' : dirty ? 'บันทึกการแก้ไข' : 'บันทึกแล้ว'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
