import { supabase } from './supabase';
import { perPersonOf, type RoundingMode } from './money';
import type { SessionFull, SessionPlayerRow } from './types';

/** วันที่ท้องถิ่นรูปแบบ yyyy-mm-dd (ไม่ใช้ toISOString เพราะจะเพี้ยนเป็นเวลา UTC) */
export function localDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return localDate(new Date(y, m - 1, d + days));
}

export function formatThaiDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('th-TH', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** ดึงรอบ (ไม่รวมที่ถูกลบ) พร้อมไอเทมและผู้เข้าร่วม */
export async function fetchSessions(gangId: string, from?: string, to?: string): Promise<SessionFull[]> {
  let q = supabase
    .from('sessions')
    .select('*, session_items(*), session_players(*, players(name))')
    .eq('gang_id', gangId)
    .is('deleted_at', null)
    .order('session_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1000);
  if (from) q = q.gte('session_date', from);
  if (to) q = q.lte('session_date', to);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as SessionFull[];
}

export function sessionTotal(s: SessionFull): number {
  return s.session_items.reduce((sum, i) => sum + i.price * i.quantity, 0);
}

/** ยอดต่อคนของผู้เล่นในรอบ (ใช้ snapshot ถ้ามี ไม่มีก็คำนวณใหม่) */
export function shareOf(s: SessionFull, sp: SessionPlayerRow, mode: RoundingMode): number {
  if (sp.share_amount !== null && sp.share_amount !== undefined) return sp.share_amount;
  return perPersonOf(sessionTotal(s), s.session_players.length, mode) ?? 0;
}

/** user_id → ชื่อที่แสดง (display_name หรือรหัสสั้น ๆ) */
export async function fetchMemberNames(gangId: string): Promise<Record<string, string>> {
  const { data } = await supabase.from('gang_users').select('user_id, display_name, role').eq('gang_id', gangId);
  const map: Record<string, string> = {};
  for (const r of (data ?? []) as { user_id: string; display_name: string | null; role: string }[]) {
    map[r.user_id] = r.display_name?.trim() || `สมาชิก ${r.user_id.slice(0, 4)}`;
  }
  return map;
}
