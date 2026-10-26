import { supabase } from './supabase';
import { formatShort } from './money';
import type { AuditLog } from './types';

/** บันทึกประวัติการแก้ไข (ล้มเหลวก็ไม่ให้กระทบการทำงานหลัก) */
export async function logAudit(
  gangId: string,
  sessionId: string | null,
  action: string,
  detail?: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.from('audit_logs').insert({ gang_id: gangId, session_id: sessionId, action, detail: detail ?? null });
  } catch {
    // ignore
  }
}

export const ACTION_LABELS: Record<string, string> = {
  'session.create': 'สร้างรอบ',
  'session.update': 'แก้ไขรอบ',
  'session.delete': 'ลบรอบ',
  'paid.toggle': 'เปลี่ยนสถานะจ่าย',
  'player.add': 'เพิ่มผู้เล่น',
  'player.update': 'แก้ผู้เล่น',
  'player.delete': 'ลบผู้เล่น',
  'preset.add': 'เพิ่มไอเทมสำเร็จรูป',
  'preset.seed': 'นำเข้าไอเทมตั้งต้น',
  'preset.update': 'แก้ไอเทมสำเร็จรูป',
  'preset.delete': 'ลบไอเทมสำเร็จรูป',
  'invite.create': 'สร้างรหัสเชิญ',
  'member.role': 'เปลี่ยนสิทธิ์สมาชิก',
  'member.remove': 'ลบสมาชิก',
  'gang.update': 'แก้ตั้งค่าแก็ง',
};

function str(v: unknown): string {
  return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
}

/** สรุปรายละเอียดของ log เป็นข้อความสั้น ๆ */
export function describeLog(log: AuditLog): string {
  const d = log.detail ?? {};
  switch (log.action) {
    case 'session.create':
    case 'session.update': {
      const total = typeof d.total === 'number' ? formatShort(d.total) : '';
      const per = typeof d.per_person === 'number' ? formatShort(d.per_person) : '';
      const players = str(d.players);
      const items = Array.isArray(d.items) ? (d.items as unknown[]).map(str).join(', ') : '';
      return [
        total && `รวม ${total}`,
        per && `คนละ ${per}`,
        players && `${players} คน`,
        items && `ไอเทม: ${items}`,
      ]
        .filter(Boolean)
        .join(' · ');
    }
    case 'paid.toggle':
      return `${str(d.player)} → ${d.paid ? 'จ่ายแล้ว' : 'ยังไม่จ่าย'}`;
    case 'session.delete':
      return str(d.title);
    case 'player.add':
    case 'player.update':
    case 'player.delete':
      return str(d.name);
    case 'preset.add':
    case 'preset.update':
    case 'preset.delete': {
      const price = typeof d.price === 'number' ? ` (${formatShort(d.price)})` : '';
      return `${str(d.name)}${price}`;
    }
    case 'preset.seed':
      return `${str(d.count)} รายการ`;
    case 'member.role':
      return `${str(d.member)} → ${str(d.role)}`;
    default:
      return Object.keys(d).length ? JSON.stringify(d) : '';
  }
}
