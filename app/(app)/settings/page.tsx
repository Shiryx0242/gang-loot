'use client';

import { useCallback, useEffect, useState } from 'react';
import { useGang } from '@/lib/gang-context';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { ROUNDING_LABELS, type RoundingMode } from '@/lib/money';
import { ROLE_LABELS, type Role } from '@/lib/types';
import { formatDateTime } from '@/lib/queries';

interface Member {
  user_id: string;
  role: Role;
  display_name: string | null;
  joined_at: string;
}

interface Invite {
  code: string;
  role: 'admin' | 'member';
  expires_at: string;
}

export default function SettingsPage() {
  const { user, current, canEdit, isOwner, reload } = useGang();
  const gangId = current?.gang.id ?? '';

  const [gangName, setGangName] = useState(current?.gang.name ?? '');
  const [rounding, setRounding] = useState<RoundingMode>(current?.gang.rounding_mode ?? 'ceil_1000');
  const [myName, setMyName] = useState(current?.display_name ?? '');
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('admin');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    if (!gangId) return;
    const { data } = await supabase
      .from('gang_users')
      .select('user_id, role, display_name, joined_at')
      .eq('gang_id', gangId)
      .order('joined_at');
    setMembers((data ?? []) as Member[]);
  }, [gangId]);

  const loadInvites = useCallback(async () => {
    if (!gangId || !canEdit) return;
    const { data } = await supabase
      .from('gang_invites')
      .select('code, role, expires_at')
      .eq('gang_id', gangId)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });
    setInvites((data ?? []) as Invite[]);
  }, [gangId, canEdit]);

  useEffect(() => {
    setGangName(current?.gang.name ?? '');
    setRounding(current?.gang.rounding_mode ?? 'ceil_1000');
    setMyName(current?.display_name ?? '');
    loadMembers();
    loadInvites();
  }, [current, loadMembers, loadInvites]);

  function flash(text: string) {
    setMsg(text);
    setError(null);
    setTimeout(() => setMsg(null), 2500);
  }

  async function saveGang() {
    const { error } = await supabase
      .from('gangs')
      .update({ name: gangName.trim() || current?.gang.name, rounding_mode: rounding })
      .eq('id', gangId);
    if (error) return setError('บันทึกไม่สำเร็จ: ' + error.message);
    logAudit(gangId, null, 'gang.update', { name: gangName.trim(), rounding });
    await reload();
    flash('บันทึกการตั้งค่าแก็งแล้ว');
  }

  async function saveMyName() {
    const { error } = await supabase.rpc('set_my_display_name', { p_gang: gangId, p_name: myName });
    if (error) {
      setError('บันทึกชื่อไม่สำเร็จ (ต้องรันไฟล์ schema-patch.sql ใน Supabase ก่อน): ' + error.message);
      return;
    }
    await reload();
    loadMembers();
    flash('บันทึกชื่อของคุณแล้ว');
  }

  async function changeRole(m: Member, role: Role) {
    const { error } = await supabase.from('gang_users').update({ role }).eq('gang_id', gangId).eq('user_id', m.user_id);
    if (error) return setError(error.message);
    logAudit(gangId, null, 'member.role', { member: m.display_name || m.user_id.slice(0, 4), role: ROLE_LABELS[role] });
    loadMembers();
  }

  async function removeMember(m: Member) {
    if (!window.confirm('ลบสมาชิกคนนี้ออกจากแก็ง?')) return;
    const { error } = await supabase.from('gang_users').delete().eq('gang_id', gangId).eq('user_id', m.user_id);
    if (error) return setError(error.message);
    logAudit(gangId, null, 'member.remove', { member: m.display_name || m.user_id.slice(0, 4) });
    loadMembers();
  }

  async function createInvite() {
    const { error } = await supabase.from('gang_invites').insert({ gang_id: gangId, role: inviteRole });
    if (error) return setError('สร้างรหัสเชิญไม่สำเร็จ: ' + error.message);
    logAudit(gangId, null, 'invite.create', { role: ROLE_LABELS[inviteRole] });
    loadInvites();
  }

  async function deleteInvite(code: string) {
    await supabase.from('gang_invites').delete().eq('code', code);
    loadInvites();
  }

  async function copyLink(code: string) {
    const link = `${window.location.origin}/join?code=${code}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      window.prompt('คัดลอกลิงก์นี้', link);
    }
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 1800);
  }

  if (!current) return null;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">ตั้งค่า</h1>
      {msg && <p className="alert tone-mint">{msg}</p>}
      {error && <p className="alert tone-bad">{error}</p>}

      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">ชื่อของฉัน</h2>
        <p className="text-xs muted">ใช้แสดงในประวัติการแก้ไข เพื่อให้รู้ว่าใครเป็นคนทำ</p>
        <div className="flex gap-2">
          <input className="input" value={myName} onChange={(e) => setMyName(e.target.value)} placeholder="เช่น หัวแก็ง Nanzy" />
          <button className="btn btn-primary" onClick={saveMyName}>
            บันทึก
          </button>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">แก็ง</h2>
        <div>
          <label className="label">ชื่อแก็ง</label>
          <input className="input" value={gangName} disabled={!isOwner} onChange={(e) => setGangName(e.target.value)} />
        </div>
        <div>
          <label className="label">วิธีปัดเศษยอดต่อคน</label>
          <select
            className="input"
            value={rounding}
            disabled={!isOwner}
            onChange={(e) => setRounding(e.target.value as RoundingMode)}
          >
            {(Object.keys(ROUNDING_LABELS) as RoundingMode[]).map((k) => (
              <option key={k} value={k}>
                {ROUNDING_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        {isOwner ? (
          <button className="btn btn-primary" onClick={saveGang}>
            บันทึกการตั้งค่าแก็ง
          </button>
        ) : (
          <p className="text-xs muted">เฉพาะหัวแก็งที่แก้การตั้งค่านี้ได้</p>
        )}
      </section>

      <section className="card space-y-2">
        <h2 className="text-lg font-semibold">สมาชิก ({members.length})</h2>
        <ul className="space-y-2">
          {members.map((m) => {
            const isMe = m.user_id === user?.id;
            return (
              <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 divider pt-2">
                <div>
                  <span className="font-semibold">{m.display_name || `สมาชิก ${m.user_id.slice(0, 4)}`}</span>
                  {isMe && <span className="badge tone-lavender ml-2">คุณ</span>}
                  <div className="text-xs muted">เข้าร่วม {formatDateTime(m.joined_at)}</div>
                </div>
                <div className="flex items-center gap-2">
                  {isOwner && m.role !== 'owner' ? (
                    <>
                      <select className="input !w-auto" value={m.role} onChange={(e) => changeRole(m, e.target.value as Role)}>
                        <option value="admin">{ROLE_LABELS.admin}</option>
                        <option value="member">{ROLE_LABELS.member}</option>
                      </select>
                      <button className="btn btn-sm btn-danger" onClick={() => removeMember(m)}>
                        ลบ
                      </button>
                    </>
                  ) : (
                    <span className="badge tone-lavender">{ROLE_LABELS[m.role]}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {canEdit && (
        <section className="card space-y-3">
          <h2 className="text-lg font-semibold">เชิญสมาชิก</h2>
          <p className="text-xs muted">รหัสเชิญใช้ได้ 7 วัน ส่งลิงก์ให้รองแก็งหรือสมาชิก แล้วให้เขาล็อกอินตามลิงก์</p>
          <div className="flex flex-wrap gap-2">
            <select className="input !w-auto" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member')}>
              <option value="admin">เชิญเป็นรองแก็ง (แก้ไขได้)</option>
              <option value="member">เชิญเป็นสมาชิก (ดูอย่างเดียว)</option>
            </select>
            <button className="btn btn-primary" onClick={createInvite}>
              + สร้างรหัสเชิญ
            </button>
          </div>
          <ul className="space-y-2">
            {invites.map((i) => (
              <li key={i.code} className="row-soft flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <div>
                  <code className="font-semibold">{i.code}</code>
                  <span className="badge tone-lavender ml-2">{ROLE_LABELS[i.role]}</span>
                  <div className="text-xs muted">หมดอายุ {formatDateTime(i.expires_at)}</div>
                </div>
                <div className="flex gap-1">
                  <button className="btn btn-sm" onClick={() => copyLink(i.code)}>
                    {copiedCode === i.code ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => deleteInvite(i.code)}>
                    ลบ
                  </button>
                </div>
              </li>
            ))}
            {invites.length === 0 && <li className="text-sm muted">ยังไม่มีรหัสเชิญที่ใช้งานได้</li>}
          </ul>
        </section>
      )}
    </div>
  );
}
