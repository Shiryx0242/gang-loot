// ฟังก์ชันคำนวณเงิน ใช้จำนวนเต็มทั้งหมด (ไม่มี import เพื่อให้เทสต์ด้วย Node ได้)

export type RoundingMode = 'ceil_1000' | 'floor_1000' | 'round_1000' | 'none';

export const ROUNDING_LABELS: Record<RoundingMode, string> = {
  ceil_1000: 'ปัดขึ้นเป็นหลักพัน (เช่น 207,500 → 208,000)',
  floor_1000: 'ปัดลงเป็นหลักพัน (เช่น 207,500 → 207,000)',
  round_1000: 'ปัดใกล้สุดเป็นหลักพัน',
  none: 'ไม่ปัดหลักพัน (ปัดขึ้นเป็นจำนวนเต็ม)',
};

/** แปลงข้อความราคา เช่น "250k", "1.5m", "250,000" → ตัวเลข (ไม่ถูกต้อง = null) */
export function parseMoney(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/[,\s_฿]/g, '');
  if (!s) return null;
  const m = s.match(/^(\d+(?:\.\d+)?)(k|m|b)?$/);
  if (!m) return null;
  const unit = m[2];
  const mult = unit === 'k' ? 1e3 : unit === 'm' ? 1e6 : unit === 'b' ? 1e9 : 1;
  const value = Math.round(parseFloat(m[1]) * mult);
  return Number.isSafeInteger(value) ? value : null;
}

export function formatFull(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

function trimNum(n: number): string {
  return Number(n.toFixed(2)).toString();
}

/** รูปแบบย่อ: 250000 → "250k", 1500000 → "1.5m" */
export function formatShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e6) return trimNum(n / 1e6) + 'm';
  if (abs >= 1e3) return trimNum(n / 1e3) + 'k';
  return String(Math.round(n));
}

function ceilDiv(a: number, b: number): number {
  return Math.floor((a + b - 1) / b);
}

/** ราคาต่อคน ตามโหมดปัดเศษ (จำนวนคน ≤ 0 → null) */
export function perPersonOf(total: number, count: number, mode: RoundingMode): number | null {
  if (!Number.isFinite(total) || count <= 0) return null;
  switch (mode) {
    case 'ceil_1000':
      return ceilDiv(total, count * 1000) * 1000;
    case 'floor_1000':
      return Math.floor(total / (count * 1000)) * 1000;
    case 'round_1000':
      return Math.round(total / count / 1000) * 1000;
    case 'none':
    default:
      return ceilDiv(total, count);
  }
}

export interface ItemLike {
  price: number;
  quantity: number;
}

export interface Split {
  total: number;
  count: number;
  /** ค่าเฉลี่ยจริงก่อนปัด */
  raw: number | null;
  perPerson: number | null;
  /** ส่วนเกินจากการปัดขึ้น (perPerson × count − total) */
  overage: number | null;
}

export function calcSplit(items: ItemLike[], count: number, mode: RoundingMode): Split {
  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const perPerson = perPersonOf(total, count, mode);
  return {
    total,
    count,
    raw: count > 0 ? total / count : null,
    perPerson,
    overage: perPerson === null ? null : perPerson * count - total,
  };
}
