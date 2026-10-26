'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useGang } from '@/lib/gang-context';
import { supabase } from '@/lib/supabase';
import { formatFull, formatShort, parseMoney } from '@/lib/money';
import { fetchItemPresets, writeLocalPresets } from '@/lib/queries';
import { logAudit } from '@/lib/audit';
import { IconArrowDown, IconArrowUp } from '@/components/Icons';
import { DEFAULT_ITEM_PRESETS, type ItemPreset } from '@/lib/types';

export default function ItemsPage() {
  const { current, canEdit } = useGang();
  const gangId = current?.gang.id ?? '';

  const [presets, setPresets] = useState<ItemPreset[]>([]);
  const [tableMissing, setTableMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [priceText, setPriceText] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ name: '', priceText: '' });
  const [showInactive, setShowInactive] = useState(true);
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async () => {
    if (!gangId) return;
    try {
      const { rows, tableMissing: missing } = await fetchItemPresets(gangId);
      setPresets(rows);
      setTableMissing(missing);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'โหลดรายการไอเทมไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [gangId]);

  useEffect(() => {
    load();
    if (!gangId) return;
    const ch = supabase
      .channel(`presets-${gangId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'item_presets', filter: `gang_id=eq.${gangId}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [gangId, load]);

  function flash(text: string) {
    setMsg(text);
    setError(null);
    setTimeout(() => setMsg(null), 2500);
  }

  async function seedDefaults() {
    if (!canEdit || !gangId) return;
    setSeeding(true);
    setError(null);
    const existingLower = new Set(presets.map((p) => p.name.trim().toLowerCase()));
    const toAdd = DEFAULT_ITEM_PRESETS.filter((d) => !existingLower.has(d.name.trim().toLowerCase()));
    if (toAdd.length === 0) {
      setSeeding(false);
      flash('มีรายการตั้งต้นครบทั้งหมดแล้ว');
      return;
    }
    const maxOrder = presets.reduce((m, p) => Math.max(m, p.sort_order), -1);

    if (tableMissing) {
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
      setSeeding(false);
      flash(`นำเข้ารายการตั้งต้น ${added.length} รายการแล้ว`);
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
    setSeeding(false);
    if (error) return setError('นำเข้าไม่สำเร็จ: ' + error.message);
    logAudit(gangId, null, 'preset.seed', { count: toAdd.length });
    flash(`นำเข้ารายการตั้งต้น ${toAdd.length} รายการแล้ว`);
    load();
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    const parsedPrice = parseMoney(priceText);
    if (!trimmed) return;
    if (parsedPrice === null) return setError('ราคามาตรฐานไม่ถูกต้อง (ตัวอย่าง: 50k, 150000, 1.5m)');
    if (presets.some((p) => p.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      return setError(`มีไอเทมชื่อ "${trimmed}" อยู่แล้ว`);
    }
    setError(null);
    const maxOrder = presets.reduce((m, p) => Math.max(m, p.sort_order), -1);

    if (tableMissing) {
      const item: ItemPreset = {
        id: crypto.randomUUID(),
        gang_id: gangId,
        name: trimmed,
        default_price: parsedPrice,
        sort_order: maxOrder + 1,
        is_active: true,
        created_at: new Date().toISOString(),
      };
      const next = [...presets, item];
      writeLocalPresets(gangId, next);
      setPresets(next);
      setName('');
      setPriceText('');
      return;
    }

    const { error } = await supabase.from('item_presets').insert({
      gang_id: gangId,
      name: trimmed,
      default_price: parsedPrice,
      sort_order: maxOrder + 1,
    });
    if (error) return setError('เพิ่มไม่สำเร็จ: ' + error.message);
    logAudit(gangId, null, 'preset.add', { name: trimmed, price: parsedPrice });
    setName('');
    setPriceText('');
    load();
  }

  async function saveEdit(p: ItemPreset) {
    const trimmed = edit.name.trim();
    const parsedPrice = parseMoney(edit.priceText);
    if (!trimmed) return;
    if (parsedPrice === null) return setError('ราคาไม่ถูกต้อง');
    if (presets.some((x) => x.id !== p.id && x.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      return setError(`มีไอเทมชื่อ "${trimmed}" อยู่แล้ว`);
    }

    if (tableMissing) {
      const next = presets.map((x) => (x.id === p.id ? { ...x, name: trimmed, default_price: parsedPrice } : x));
      writeLocalPresets(gangId, next);
      setPresets(next);
      setEditId(null);
      return;
    }

    const { error } = await supabase
      .from('item_presets')
      .update({ name: trimmed, default_price: parsedPrice })
      .eq('id', p.id);
    if (error) return setError('แก้ไขไม่สำเร็จ: ' + error.message);
    logAudit(gangId, null, 'preset.update', { name: trimmed, price: parsedPrice });
    setEditId(null);
    load();
  }

  async function toggleActive(p: ItemPreset) {
    if (tableMissing) {
      const next = presets.map((x) => (x.id === p.id ? { ...x, is_active: !p.is_active } : x));
      writeLocalPresets(gangId, next);
      setPresets(next);
      return;
    }
    const { error } = await supabase.from('item_presets').update({ is_active: !p.is_active }).eq('id', p.id);
    if (error) return setError(error.message);
    load();
  }

  async function moveOrder(index: number, dir: -1 | 1) {
    const targetIdx = index + dir;
    if (targetIdx < 0 || targetIdx >= presets.length) return;
    const next = [...presets];
    const [moved] = next.splice(index, 1);
    next.splice(targetIdx, 0, moved);
    const reordered = next.map((item, idx) => ({ ...item, sort_order: idx }));
    setPresets(reordered);

    if (tableMissing) {
      writeLocalPresets(gangId, reordered);
      return;
    }

    await Promise.all(
      reordered.map((item) => supabase.from('item_presets').update({ sort_order: item.sort_order }).eq('id', item.id)),
    );
    load();
  }

  async function remove(p: ItemPreset) {
    if (!window.confirm(`ลบไอเทมสำเร็จรูป "${p.name}" ? (ไม่มีผลกับรอบเก่าในประวัติ)`)) return;
    if (tableMissing) {
      const next = presets.filter((x) => x.id !== p.id);
      writeLocalPresets(gangId, next);
      setPresets(next);
      return;
    }
    const { error } = await supabase.from('item_presets').delete().eq('id', p.id);
    if (error) return setError('ลบไม่สำเร็จ: ' + error.message);
    logAudit(gangId, null, 'preset.delete', { name: p.name });
    load();
  }

  const shown = presets.filter((p) => showInactive || p.is_active);
  const allSeeded = DEFAULT_ITEM_PRESETS.every((d) =>
    presets.some((p) => p.name.trim().toLowerCase() === d.name.trim().toLowerCase()),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">ไอเทมสำเร็จรูป</h1>
          <p className="text-xs muted">
            ตั้งรายการไอเทมที่ใช้บ่อยพร้อมราคามาตรฐาน เพื่อให้คลิกเลือกเป็น chip ในหน้าสร้าง/แก้ไขรอบได้ทันที (การแก้หรือลบที่นี่ไม่กระทบรอบเก่า)
          </p>
        </div>
        {canEdit && !allSeeded && (
          <button type="button" className="btn btn-sm" onClick={seedDefaults} disabled={seeding}>
            {seeding ? 'กำลังนำเข้า...' : 'นำเข้ารายการตั้งต้น (7 รายการ)'}
          </button>
        )}
      </div>

      {tableMissing && (
        <div className="alert tone-butter">
          หมายเหตุ: ฐานข้อมูล Supabase ยังไม่ได้รันตาราง <code>item_presets</code> (ตอนนี้เก็บไว้ในเบราว์เซอร์เครื่องนี้ชั่วคราว) — ให้รันไฟล์{' '}
          <code>schema-patch.sql</code> ใน Supabase SQL Editor เพื่อซิงก์ข้ามเครื่องแบบ real-time
        </div>
      )}

      {msg && <p className="alert tone-mint">{msg}</p>}
      {error && <p className="alert tone-bad">{error}</p>}

      {canEdit && (
        <form onSubmit={add} className="card grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label">ชื่อไอเทม *</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น Fairy" />
          </div>
          <div>
            <label className="label">ราคามาตรฐาน *</label>
            <input
              className="input"
              value={priceText}
              onChange={(e) => setPriceText(e.target.value)}
              placeholder="เช่น 150k หรือ 150000"
            />
          </div>
          <div className="flex items-end">
            <button className="btn btn-primary w-full" disabled={!name.trim() || !priceText.trim()}>
              + เพิ่มไอเทมสำเร็จรูป
            </button>
          </div>
        </form>
      )}

      <label className="flex items-center gap-2 text-sm muted">
        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
        แสดงไอเทมที่ปิดการใช้งานด้วย
      </label>

      {loading && <p className="text-sm muted">กำลังโหลด...</p>}

      {!loading && shown.length === 0 && (
        <div className="card flex flex-wrap items-center justify-between gap-2 text-sm muted">
          <span>ยังไม่มีไอเทมสำเร็จรูป กดนำเข้ารายการตั้งต้นเพื่อเริ่มต้นใช้งาน</span>
          {canEdit && (
            <button type="button" className="btn btn-primary btn-sm" onClick={seedDefaults} disabled={seeding}>
              นำเข้ารายการตั้งต้น
            </button>
          )}
        </div>
      )}

      <ul className="space-y-2">
        {shown.map((p) => {
          const fullIdx = presets.findIndex((x) => x.id === p.id);
          return (
            <li key={p.id} className={`card ${p.is_active ? '' : 'opacity-60'}`}>
              {editId === p.id ? (
                <div className="grid gap-2 sm:grid-cols-3">
                  <input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="ชื่อไอเทม" />
                  <input
                    className="input"
                    value={edit.priceText}
                    onChange={(e) => setEdit({ ...edit, priceText: e.target.value })}
                    placeholder="ราคามาตรฐาน เช่น 150k"
                  />
                  <div className="flex gap-2">
                    <button className="btn btn-primary btn-sm" onClick={() => saveEdit(p)}>
                      บันทึก
                    </button>
                    <button className="btn btn-sm" onClick={() => setEditId(null)}>
                      ยกเลิก
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{p.name}</span>
                    <span className="badge tone-sky">{formatShort(p.default_price)}</span>
                    <span className="text-xs muted">({formatFull(p.default_price)})</span>
                    {!p.is_active && <span className="badge tone-chip">ปิดใช้งาน</span>}
                  </div>
                  {canEdit && (
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        className="btn btn-sm btn-icon"
                        disabled={fullIdx <= 0}
                        onClick={() => moveOrder(fullIdx, -1)}
                        title="เลื่อนขึ้น"
                        aria-label="เลื่อนขึ้น"
                      >
                        <IconArrowUp size={16} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-icon"
                        disabled={fullIdx < 0 || fullIdx >= presets.length - 1}
                        onClick={() => moveOrder(fullIdx, 1)}
                        title="เลื่อนลง"
                        aria-label="เลื่อนลง"
                      >
                        <IconArrowDown size={16} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => {
                          setEditId(p.id);
                          setEdit({ name: p.name, priceText: String(p.default_price) });
                        }}
                      >
                        แก้ไข
                      </button>
                      <button type="button" className="btn btn-sm" onClick={() => toggleActive(p)}>
                        {p.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                      </button>
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(p)}>
                        ลบ
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
