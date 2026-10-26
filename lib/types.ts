export type Role = 'owner' | 'admin' | 'member';
export type SessionStatus = 'draft' | 'open' | 'completed';

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'หัวแก็ง',
  admin: 'รองแก็ง',
  member: 'สมาชิก',
};

export const STATUS_LABELS: Record<SessionStatus, string> = {
  draft: 'ฉบับร่าง',
  open: 'รอจ่าย',
  completed: 'ครบแล้ว',
};

export interface Player {
  id: string;
  gang_id: string;
  name: string;
  game_id: string | null;
  note: string | null;
  is_active: boolean;
  created_at: string;
}

export interface SessionItem {
  id: string;
  session_id: string;
  name: string;
  price: number;
  quantity: number;
  note: string | null;
  created_at: string;
}

export interface SessionPlayerRow {
  session_id: string;
  player_id: string;
  share_amount: number | null;
  is_paid: boolean;
  paid_at: string | null;
  players?: { name: string } | null;
}

export interface SessionRow {
  id: string;
  gang_id: string;
  title: string | null;
  session_date: string;
  status: SessionStatus;
  note: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface SessionFull extends SessionRow {
  session_items: SessionItem[];
  session_players: SessionPlayerRow[];
}

export interface AuditLog {
  id: number;
  gang_id: string;
  session_id: string | null;
  actor_id: string | null;
  action: string;
  detail: Record<string, unknown> | null;
  created_at: string;
}
