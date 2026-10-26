'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useGang } from '@/lib/gang-context';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import type { Player } from '@/lib/types';

export default function PlayersPage() {
  const { current, canEdit } = useGang();
  const gangId = current?.gang.id ?? '';

  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [gameId, setGameId] = useState('');
  const [note, setNote] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ name: '', game_id: '', note: '' });
  const [showInactive, setShowInactive] = useState(true);

  const load = useCallback(async () => {
    if (!gangId) return;
    const { data, error } = await supabase.from('players').select('*').eq('gang_id', gangId).order('name');
    if (error) setError(error.message);
    setPlayers((data ?? []) as Player[]);
    setLoading(false);
  }, [gangId]);

  useEffect(() => {
    load();
    if (!gangId) return;
    const ch = supabase
      .channel(`players-${gangId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `gang_id=eq.${gangId}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [gangId, load]);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    const { error } = await supabase.from('players').insert({
      gang_id: gangId,
      name: name.trim(),
      game_id: gameId.trim() || null,
      note: note.trim() || null,
    });
    if (error) return setError('เพิ่มไม่สำเร็จ: ' + error.message);
    logAudit(gangId, null, 'player.add', { name: name.trim() });
    setName('');
    setGameId('');
    setNote('');
    load();
  }

  async function saveEdit(p: Player) {
    if (!edit.name.trim()) return;
    const { error } = await supabase
      .from('players')
      .update({ name: edit.name.trim(), game_id: edit.game_id.trim() || null, note: edit.note.trim() || null })
      .eq('id', p.id);
    if (error) return setError('แก้ไขไม่สำเร็จ: ' + error.message);
    logAudit(gangId, null, 'player.update', { name: edit.name.trim() });
    setEditId(null);
    load();
  }

  async function toggleActive(p: Player) {
    const { error } = await supabase.from('players').update({ is_active: !p.is_active }).eq('id', p.id);
    if (error) return setError(error.message);
    load();
  }

  async function remove(p: Player) {
    if (!window.confirm(`ลบ "${p.name}" ?`)) return;
    const { error } = await supabase.from('players').delete().eq('id', p.id);
    if (error) {
      setError(`ลบ "${p.name}" ไม่ได้ เพราะมีประวัติในรอบที่ผ่านมา ให้ปิดการใช้งานแทน`);
      return;
    }
    logAudit(gangId, null, 'player.delete', { name: p.name });
    load();
  }

  const shown = players.filter((p) => showInactive || p.is_active);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">รายชื่อผู้เล่น</h1>
      {error && <p className="alert tone-bad">{error}</p>}

      {canEdit && (
        <form onSubmit={add} className="card grid gap-4 sm:grid-cols-4">
          <div>
            <label className="label">ชื่อในเกม *</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น Nanzy" />
          </div>
          <div>
            <label className="label">ID (ถ้ามี)</label>
            <input className="input" value={gameId} onChange={(e) => setGameId(e.target.value)} placeholder="297189" />
          </div>
          <div>
            <label className="label">โน้ต</label>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="flex items-end">
            <button className="btn btn-primary w-full" disabled={!name.trim()}>
              + เพิ่มผู้เล่น
            </button>
          </div>
        </form>
      )}

      <label className="flex items-center gap-2 text-sm muted">
        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
        แสดงคนที่ปิดการใช้งานด้วย
      </label>

      {loading && <p className="text-sm muted">กำลังโหลด...</p>}
      {!loading && shown.length === 0 && <p className="card text-sm muted">ยังไม่มีรายชื่อผู้เล่น</p>}

      <ul className="space-y-2">
        {shown.map((p) => (
          <li key={p.id} className={`card ${p.is_active ? '' : 'opacity-60'}`}>
            {editId === p.id ? (
              <div className="grid gap-2 sm:grid-cols-4">
                <input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                <input className="input" value={edit.game_id} onChange={(e) => setEdit({ ...edit, game_id: e.target.value })} placeholder="ID" />
                <input className="input" value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} placeholder="โน้ต" />
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
                <div>
                  <span className="font-semibold">{p.name}</span>
                  {p.game_id && <span className="ml-2 text-xs muted">#{p.game_id}</span>}
                  {!p.is_active && <span className="badge tone-chip ml-2">ปิดใช้งาน</span>}
                  {p.note && <div className="text-xs muted">{p.note}</div>}
                </div>
                {canEdit && (
                  <div className="flex gap-1">
                    <button
                      className="btn btn-sm"
                      onClick={() => {
                        setEditId(p.id);
                        setEdit({ name: p.name, game_id: p.game_id ?? '', note: p.note ?? '' });
                      }}
                    >
                      แก้ไข
                    </button>
                    <button className="btn btn-sm" onClick={() => toggleActive(p)}>
                      {p.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => remove(p)}>
                      ลบ
                    </button>
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
