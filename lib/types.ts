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

export interface ItemPreset {
  id: string;
  gang_id: string;
  name: string;
  default_price: number;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export const DEFAULT_ITEM_PRESETS: { name: string; default_price: number }[] = [
  { name: 'weapon box', default_price: 50_000 },
  { name: 'weapon box gang', default_price: 250_000 },
  { name: 'fairy dusk', default_price: 30_000 },
  { name: 'upgard part', default_price: 50_000 },
  { name: 'Bolter', default_price: 10_000 },
  { name: 'ยาเขียว', default_price: 20_000 },
  { name: 'Fairy', default_price: 150_000 },
];

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
