'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { IconCheck, IconGear, IconPlus, IconX } from '@/components/Icons';

interface TitlePreset {
  id: string;
  name: string;
  sort_order: number;
}

interface Props {
  gangId: string;
  value: string;
  disabled: boolean;
  canManage: boolean;
  onChange: (title: string) => void;
}

/** เลือกชื่อรอบจากหัวข้อสำเร็จรูป (เพิ่ม/แก้ไข/ลบได้) */
export default function TitlePicker({ gangId, value, disabled, canManage, onChange }: Props) {
  const [presets, setPresets] = useState<TitlePreset[]>([]);
  const [manage, setManage] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('title_presets')
      .select('id, name, sort_order')
      .eq('gang_id', gangId)
      .order('sort_order')
      .order('created_at');
    if (error) {
      setMsg('ยังไม่ได้รัน schema-patch-2.sql ใน Supabase');
      return;
    }
    setMsg(null);
    setPresets((data ?? []) as TitlePreset[]);
  }, [gangId]);

  useEffect(() => {
    if (gangId) load();
  }, [gangId, load]);

  const dup = (name: string, exceptId?: string) =>
    presets.some((p) => p.id !== exceptId && p.name.trim().toLowerCase() === name.trim().toLowerCase());

  async function add() {
    const name = newName.trim();
    if (!name) return;
    if (dup(name)) return setMsg('มีหัวข้อนี้แล้ว');
    const maxOrder = presets.reduce((m, p) => Math.max(m, p.sort_order), -1);
    const { error } = await supabase.from('title_presets').insert({ gang_id: gangId, name, sort_order: maxOrder + 1 });
    if (error) return setMsg(`เพิ่มไม่สำเร็จ: ${error.message}`);
    setNewName('');
    setAdding(false);
    setMsg(null);
    load();
  }

  async function saveEdit(p: TitlePreset) {
    const name = editName.trim();
    if (!name) return;
    if (dup(name, p.id)) return setMsg('มีหัวข้อนี้แล้ว');
    const { error } = await supabase.from('title_presets').update({ name }).eq('id', p.id);
    if (error) return setMsg(`แก้ไขไม่สำเร็จ: ${error.message}`);
    if (value === p.name) onChange(name);
    setEditId(null);
    setMsg(null);
    load();
  }

  async function remove(p: TitlePreset) {
    if (!confirm(`ลบหัวข้อ "${p.name}" ?`)) return;
    const { error } = await supabase.from('title_presets').delete().eq('id', p.id);
    if (error) return setMsg(`ลบไม่สำเร็จ: ${error.message}`);
    load();
  }

  const matched = presets.some((p) => p.name === value);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((p) =>
          manage && editId === p.id ? (
            <span key={p.id} className="inline-flex items-center gap-1">
              <input
                className="input !min-h-0 !w-40 !py-1.5"
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveEdit(p)}
              />
              <button type="button" className="btn btn-sm" onClick={() => saveEdit(p)} aria-label="บันทึก">
                <IconCheck size={16} />
              </button>
              <button type="button" className="btn btn-sm" onClick={() => setEditId(null)} aria-label="ยกเลิก">
                <IconX size={16} />
              </button>
            </span>
          ) : manage ? (
            <span key={p.id} className="chip chip-idle !pr-2">
              <button
                type="button"
                className="font-medium"
                title="แก้ไขชื่อ"
                onClick={() => {
                  setEditId(p.id);
                  setEditName(p.name);
                }}
              >
                {p.name} ✎
              </button>
              <button type="button" className="chip-count" title="ลบ" onClick={() => remove(p)}>
                <IconX size={14} />
              </button>
            </span>
          ) : (
            <button
              key={p.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(value === p.name ? '' : p.name)}
              className={`chip ${value === p.name ? 'chip-active' : 'chip-idle'}`}
            >
              {p.name}
            </button>
          ),
        )}
        {!manage && value && !matched && <span className="chip chip-active">{value}</span>}
        {manage &&
          (adding ? (
            <span className="inline-flex items-center gap-1">
              <input
                className="input !min-h-0 !w-40 !py-1.5"
                autoFocus
                placeholder="ชื่อหัวข้อ"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && add()}
              />
              <button type="button" className="btn btn-sm" onClick={add} aria-label="เพิ่ม">
                <IconCheck size={16} />
              </button>
              <button type="button" className="btn btn-sm" onClick={() => setAdding(false)} aria-label="ยกเลิก">
                <IconX size={16} />
              </button>
            </span>
          ) : (
            <button type="button" className="chip btn-dashed" onClick={() => setAdding(true)}>
              <IconPlus size={16} />
              หัวข้อใหม่
            </button>
          ))}
        {canManage && !disabled && (
          <button
            type="button"
            className="link ml-auto text-sm"
            onClick={() => {
              setManage((m) => !m);
              setEditId(null);
              setAdding(false);
            }}
          >
            <IconGear size={16} />
            {manage ? 'เสร็จสิ้น' : 'จัดการหัวข้อ'}
          </button>
        )}
      </div>
      {msg && <p className="muted text-sm">{msg}</p>}
    </div>
  );
}
