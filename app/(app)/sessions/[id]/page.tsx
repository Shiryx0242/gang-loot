'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useGang } from '@/lib/gang-context';
import { supabase } from '@/lib/supabase';
import { calcSplit, formatFull, formatShort, parseMoney } from '@/lib/money';
import { fetchItemPresets, fetchMemberNames, formatDateTime, localDate, writeLocalPresets } from '@/lib/queries';
import { ACTION_LABELS, describeLog, logAudit } from '@/lib/audit';
import {
  DEFAULT_ITEM_PRESETS,
  STATUS_LABELS,
  type AuditLog,
  type ItemPreset,
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
  const [presets, setPresets] = useState<ItemPreset[]>([]);
  const [presetsMissingTable, setPresetsMissingTable] = useState(false);

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
  const [playerQuery, setPlayerQuery] = useState('');
  const [presetQuery, setPresetQuery] = useState('');
  const [loadingLastTeam, setLoadingLastTeam] = useState(false);

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

  const loadPresets = useCallback(async () => {
    if (!gangId) return;
    try {
      const { rows, tableMissing } = await fetchItemPresets(gangId);
      setPresets(rows);
      setPresetsMissingTable(tableMissing);
    } catch {
      // ignore
    }
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

  const loadFromTemplate = useCallback(
    async (fromId: string) => {
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
    },
    [markDirty],
  );

  // โหลดข้อมูลเมื่อเปิดหน้า / เปลี่ยนรอบ
  useEffect(() => {
    if (!gangId) return;
    setLoaded(false);
    loadPlayers();
    loadPresets();
    if (isNew) {
      resetForm();
      const from = new URLSearchParams(window.location.search).get('from');
      if (from) loadFromTemplate(from);
      setLogs([]);
      setLoaded(true);
    } else {
      loadSession().then(loadLogs);
    }
  }, [gangId, id, isNew, loadPlayers, loadPresets, loadSession, loadLogs, resetForm, loadFromTemplate]);

  // Realtime: หัวแก็ง/รองแก็งเปิดคนละที่ เห็นการเปลี่ยนแปลงทันที
  useEffect(() => {
    if (!gangId) return;
    const presetChannel = supabase
      .channel(`session-presets-${gangId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'item_presets', filter: `gang_id=eq.${gangId}` }, () => loadPresets())
      .subscribe();

    if (isNew) {
      return () => {
        supabase.removeChannel(presetChannel);
      };
    }

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
      supabase.removeChannel(presetChannel);
      supabase.removeChannel(channel);
    };
  }, [id, isNew, gangId, loadPresets, loadSession, loadLogs]);

  // ---------- คำนวณ (real-time ขณะพิมพ์) ----------
  const playerMap = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);
  const presetByName = useMemo(
    () => Object.fromEntries(presets.map((p) => [p.name.trim().toLowerCase(), p])),
    [presets],
  );

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

  const qtyByPresetName = useMemo(() => {
    const map: Record<string, number> = {};
    for (const it of parsed) {
      if (!it.name) continue;
      const k = it.name.toLowerCase();
      map[k] = (map[k] ?? 0) + it.quantity;
    }
    return map;
  }, [parsed]);

  const selectedIds = useMemo(() => players.filter((p) => selected[p.id]).map((p) => p.id), [players, selected]);
  const split = useMemo(() => calcSplit(validItems, selectedIds.length, mode), [validItems, selectedIds.length, mode]);

  const visiblePlayers = useMemo(() => {
    const base = players.filter((p) => p.is_active || selected[p.id]);
    const q = playerQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter((p) => p.name.toLowerCase().includes(q) || (p.game_id ?? '').toLowerCase().includes(q));
  }, [players, selected, playerQuery]);

  const activePresets = useMemo(() => {
    const base = presets.filter((p) => p.is_active);
    const q = presetQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter((p) => p.name.toLowerCase().includes(q));
  }, [presets, presetQuery]);

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

  function handlePresetClick(preset: ItemPreset) {
    if (!canEdit) return;
    setItems((prev) => {
      const targetLower = preset.name.trim().toLowerCase();
      const idx = prev.findIndex((i) => i.name.trim().toLowerCase() === targetLower);
      if (idx >= 0) {
        const currentQty = Math.max(1, parseInt(prev[idx].qty, 10) || 1);
        return prev.map((item, i) => (i === idx ? { ...item, qty: String(currentQty + 1) } : item));
      }
      const newRow: ItemDraft = {
        key: newKey(),
        name: preset.name,
        priceText: String(preset.default_price),
        qty: '1',
      };
      if (prev.length === 1 && !prev[0].name.trim() && !prev[0].priceText.trim()) {
        return [newRow];
      }
      return [...prev, newRow];
    });
    markDirty();
  }

  function handlePresetDecrement(preset: ItemPreset) {
    if (!canEdit) return;
    setItems((prev) => {
      const targetLower = preset.name.trim().toLowerCase();
      const idx = prev.findIndex((i) => i.name.trim().toLowerCase() === targetLower);
      if (idx < 0) return prev;
      const currentQty = Math.max(1, parseInt(prev[idx].qty, 10) || 1);
      if (currentQty > 1) {
        return prev.map((item, i) => (i === idx ? { ...item, qty: String(currentQty - 1) } : item));
      }
      const next = prev.filter((_, i) => i !== idx);
      return next.length ? next : [emptyItem()];
    });
    markDirty();
  }

  async function seedPresetsQuick() {
    if (!canEdit || !gangId) return;
    const existingLower = new Set(presets.map((p) => p.name.trim().toLowerCase()));
    const toAdd = DEFAULT_ITEM_PRESETS.filter((d) => !existingLower.has(d.name.trim().toLowerCase()));
    if (toAdd.length === 0) return;
    const maxOrder = presets.reduce((m, p) => Math.max(m, p.sort_order), -1);

    if (presetsMissingTable) {
      const added: ItemPreset[] = toAdd.map((d, idx) => ({
        id: crypto.randomUUID(),
        gang_id: gangId,
        name: d.name,
        default_price: d.default_price,
        sort_order: maxOrder + 1 + idx,
        is_active: true,
        created_at: new Date().toISOString(),
      }));
      const next = [...presets, ...added];
      writeLocalPresets(gangId, next);
      setPresets(next);
      return;
    }

    const { error } = await supabase.from('item_presets').insert(
      toAdd.map((d, idx) => ({
        gang_id: gangId,
        name: d.name,
        default_price: d.default_price,
        sort_order: maxOrder + 1 + idx,
      })),
    );
    if (error) {
      setError('นำเข้ารายการตั้งต้นไม่สำเร็จ: ' + error.message);
      return;
    }
    logAudit(gangId, null, 'preset.seed', { count: toAdd.length });
    loadPresets();
  }

  async function saveRowAsPreset(name: string, price: number) {
    if (!canEdit || !gangId) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const maxOrder = presets.reduce((m, p) => Math.max(m, p.sort_order), -1);

    if (presetsMissingTable) {
      const item: ItemPreset = {
        id: crypto.randomUUID(),
        gang_id: gangId,
        name: trimmed,
        default_price: price,
        sort_order: maxOrder + 1,
        is_active: true,
        created_at: new Date().toISOString(),
      };
      const next = [...presets, item];
      writeLocalPresets(gangId, next);
      setPresets(next);
      return;
    }

    const { error } = await supabase.from('item_presets').insert({
      gang_id: gangId,
      name: trimmed,
      default_price: price,
      sort_order: maxOrder + 1,
    });
    if (error) return setError('บันทึกไอเทมสำเร็จรูปไม่สำเร็จ: ' + error.message);
    logAudit(gangId, null, 'preset.add', { name: trimmed, price });
    loadPresets();
  }

  async function updatePresetDefaultPrice(preset: ItemPreset, newPrice: number) {
    if (!canEdit || !gangId) return;
    if (presetsMissingTable) {
      const next = presets.map((p) => (p.id === preset.id ? { ...p, default_price: newPrice } : p));
      writeLocalPresets(gangId, next);
      setPresets(next);
      return;
    }
    const { error } = await supabase.from('item_presets').update({ default_price: newPrice }).eq('id', preset.id);
    if (error) return setError('อัปเดตราคามาตรฐานไม่สำเร็จ: ' + error.message);
    logAudit(gangId, null, 'preset.update', { name: preset.name, price: newPrice });
    loadPresets();
  }

  function togglePlayer(pid: string) {
    if (!canEdit) return;
    setSelected((prev) => ({ ...prev, [pid]: !prev[pid] }));
    markDirty();
  }

  function selectAllActivePlayers() {
    if (!canEdit) return;
    const next: Record<string, boolean> = {};
    for (const p of players) {
      if (p.is_active) next[p.id] = true;
    }
    setSelected(next);
    markDirty();
  }

  function clearSelectedPlayers() {
    if (!canEdit) return;
    setSelected({});
    markDirty();
  }

  async function selectLastSessionTeam() {
    if (!canEdit || !gangId) return;
    setLoadingLastTeam(true);
    setError(null);
    try {
      let q = supabase
        .from('sessions')
        .select('id, session_players(player_id)')
        .eq('gang_id', gangId)
        .is('deleted_at', null)
        .order('session_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1);
      if (!isNew) q = q.neq('id', id);
      const { data, error } = await q;
      if (error) throw error;
      const latest = (data?.[0] ?? null) as { id: string; session_players: { player_id: string }[] } | null;
      if (!latest || !latest.session_players.length) {
        setError('ยังไม่มีประวัติรอบก่อนหน้าให้ดึงรายชื่อทีม');
        return;
      }
      const next: Record<string, boolean> = {};
      for (const sp of latest.session_players) {
        next[sp.player_id] = true;
      }
      setSelected(next);
      markDirty();
    } catch (e: unknown) {
      setError('ดึงทีมล่าสุดไม่สำเร็จ: ' + (e instanceof Error ? e.message : ''));
    } finally {
      setLoadingLastTeam(false);
    }
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
  if (!loaded) return <p className="text-violet-200/70">กำลังโหลด...</p>;
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
  const totalActivePlayers = players.filter((p) => p.is_active).length;

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

      {readOnly && <p className="rounded-lg bg-violet-400/10 p-3 text-sm text-violet-100">คุณเป็นสมาชิก ดูได้อย่างเดียว</p>}
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

      {/* ผู้เข้าร่วม */}
      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="font-medium">ผู้เข้าร่วม ({selectedIds.length} คน)</h2>
            {!isNew && selectedIds.length > 0 && (
              <span className="text-xs text-violet-200/70">
                จ่ายแล้ว {doneCount}/{Object.keys(paid).length}
              </span>
            )}
          </div>
          {canEdit && players.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                className="btn btn-sm"
                onClick={selectAllActivePlayers}
                disabled={totalActivePlayers === 0}
              >
                เลือกทั้งหมด ({totalActivePlayers})
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={selectLastSessionTeam}
                disabled={loadingLastTeam}
              >
                {loadingLastTeam ? 'กำลังดึง...' : '↺ ใช้ทีมรอบล่าสุด'}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={clearSelectedPlayers}
                disabled={selectedIds.length === 0}
              >
                ล้างที่เลือก
              </button>
            </div>
          )}
        </div>

        {players.filter((p) => p.is_active || selected[p.id]).length > 12 && (
          <input
            className="input"
            placeholder="🔍 ค้นหาชื่อผู้เล่น..."
            value={playerQuery}
            onChange={(e) => setPlayerQuery(e.target.value)}
          />
        )}

        {visiblePlayers.length === 0 && (
          <p className="text-sm text-violet-200/60">
            {playerQuery.trim() ? 'ไม่พบชื่อผู้เล่นที่ค้นหา' : 'ยังไม่มีรายชื่อผู้เล่น เพิ่มชื่อด้านล่างได้เลย'}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {visiblePlayers.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={readOnly}
              onClick={() => togglePlayer(p.id)}
              className={`chip ${selected[p.id] ? 'chip-active' : 'chip-idle'} ${!p.is_active ? 'opacity-60' : ''}`}
            >
              {selected[p.id] && <span>✓</span>}
              <span>{p.name}</span>
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
                    <tr key={pid} className="border-t border-violet-300/10">
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
                          <span className="text-xs text-violet-200/50">บันทึกก่อนจึงติ๊กได้</span>
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

      {/* ไอเทม */}
      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">ไอเทม</h2>
          <Link href="/items" className="text-xs text-violet-300 hover:underline">
            ⚙ จัดการไอเทมสำเร็จรูป
          </Link>
        </div>

        {/* ส่วนเลือกไอเทมสำเร็จรูป (Chips) */}
        {canEdit && (
          <div className="space-y-2 rounded-xl border border-violet-300/15 bg-[#120b2e]/70 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-violet-200/80">
                เลือกไอเทมด่วน (คลิกเพื่อเพิ่ม / คลิกซ้ำเพื่อ +1 / คลิกขวาเพื่อลด)
              </span>
              {presets.filter((p) => p.is_active).length === 0 && (
                <button type="button" className="btn btn-primary btn-sm" onClick={seedPresetsQuick}>
                  📥 นำเข้ารายการตั้งต้น (7 รายการ)
                </button>
              )}
            </div>

            {presets.filter((p) => p.is_active).length > 12 && (
              <input
                className="input"
                placeholder="🔍 ค้นหาไอเทมสำเร็จรูป..."
                value={presetQuery}
                onChange={(e) => setPresetQuery(e.target.value)}
              />
            )}

            {activePresets.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {activePresets.map((preset) => {
                  const count = qtyByPresetName[preset.name.trim().toLowerCase()] ?? 0;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handlePresetClick(preset)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        handlePresetDecrement(preset);
                      }}
                      className={`chip ${count > 0 ? 'chip-active' : 'chip-idle'}`}
                      title="คลิกซ้าย = เพิ่มจำนวน (+1) | คลิกขวา = ลดจำนวน (-1)"
                    >
                      <span className="font-medium">{preset.name}</span>
                      <span className="text-xs opacity-80">· {formatShort(preset.default_price)}</span>
                      {count > 0 && (
                        <span className="ml-0.5 rounded-full bg-white/20 px-1.5 py-0.5 text-xs font-bold">
                          ×{count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="space-y-2">
          {items.map((it, idx) => {
            const p = parsed[idx];
            const badPrice = Boolean(it.priceText.trim()) && p.price === null;
            const matchedPreset = p.name ? presetByName[p.name.toLowerCase()] : undefined;
            const priceDiffers =
              matchedPreset !== undefined && p.price !== null && p.price !== matchedPreset.default_price;
            const canSaveAsPreset = canEdit && Boolean(p.name) && p.price !== null && !matchedPreset;

            return (
              <div key={it.key} className="rounded-xl border border-violet-300/15 bg-[#120b2e]/50 p-2.5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    className="input sm:flex-1"
                    placeholder="ชื่อไอเทม เช่น weapon box"
                    value={it.name}
                    disabled={readOnly}
                    onChange={(e) => updateItem(it.key, { name: e.target.value })}
                  />
                  <div className="flex items-center gap-2">
                    <input
                      className={`input !w-28 sm:!w-32 ${badPrice ? '!border-red-400' : ''}`}
                      placeholder="ราคา 50k"
                      inputMode="text"
                      value={it.priceText}
                      disabled={readOnly}
                      onChange={(e) => updateItem(it.key, { priceText: e.target.value })}
                    />
                    <span className="text-sm text-violet-200/60">×</span>
                    <input
                      className="input !w-16 text-center"
                      inputMode="numeric"
                      value={it.qty}
                      disabled={readOnly}
                      onChange={(e) => updateItem(it.key, { qty: e.target.value.replace(/[^\d]/g, '') })}
                    />
                    <span
                      className={`ml-auto min-w-[6.5rem] text-right text-sm font-medium tabular-nums ${
                        badPrice ? 'text-red-300' : 'text-violet-100'
                      }`}
                    >
                      {badPrice ? 'ราคาไม่ถูกต้อง' : p.price !== null ? `= ${formatFull(p.price * p.quantity)}` : ''}
                    </span>
                    {canEdit && (
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => removeItem(it.key)}
                        title="ลบแถว"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* แจ้งเตือนราคาต่างจากมาตรฐาน หรือปุ่มบันทึกเป็นรายการมาตรฐาน */}
                {(priceDiffers || canSaveAsPreset) && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                    {priceDiffers && matchedPreset && p.price !== null && (
                      <>
                        <span className="text-amber-300/90">
                          ต่างจากราคามาตรฐาน ({formatShort(matchedPreset.default_price)})
                        </span>
                        {canEdit && (
                          <button
                            type="button"
                            className="text-violet-300 underline hover:text-violet-100"
                            onClick={() => updatePresetDefaultPrice(matchedPreset, p.price!)}
                          >
                            ตั้ง {formatShort(p.price)} เป็นราคามาตรฐาน
                          </button>
                        )}
                      </>
                    )}
                    {canSaveAsPreset && p.price !== null && (
                      <button
                        type="button"
                        className="text-violet-300 underline hover:text-violet-100"
                        onClick={() => saveRowAsPreset(p.name, p.price!)}
                      >
                        + บันทึก &quot;{p.name}&quot; ({formatShort(p.price)}) ไว้ใช้ครั้งต่อไป
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {canEdit && (
          <button type="button" className="btn" onClick={addItem}>
            + ไอเทมอื่น
          </button>
        )}
      </section>

      {!isNew && (
        <section className="card">
          <h2 className="mb-2 font-medium">ประวัติการแก้ไขของรอบนี้</h2>
          {logs.length === 0 ? (
            <p className="text-sm text-violet-200/60">ยังไม่มีบันทึก</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {logs.map((l) => (
                <li key={l.id} className="flex flex-wrap gap-x-2 border-t border-violet-300/10 pt-1">
                  <span className="text-violet-200/60">{formatDateTime(l.created_at)}</span>
                  <span className="font-medium">{(l.actor_id && names[l.actor_id]) || 'ใครสักคน'}</span>
                  <span>{ACTION_LABELS[l.action] ?? l.action}</span>
                  <span className="text-violet-100/70">{describeLog(l)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* แถบสรุปติดด้านล่าง */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-violet-300/20 bg-[#0b061d]/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 tabular-nums">
            <span className="text-sm text-violet-200/70">รวม</span>
            <span className="text-lg font-bold">{formatFull(split.total)}</span>
            <span className="text-sm text-violet-200/70">÷ {selectedIds.length || '-'} =</span>
            <span className="text-xl font-bold text-emerald-300">
              {split.perPerson === null ? '-' : `${formatShort(split.perPerson)} (${formatFull(split.perPerson)})`}
            </span>
            <span className="text-sm text-violet-200/70">ต่อคน</span>
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
