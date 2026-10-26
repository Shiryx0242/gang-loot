import { formatFull, formatShort, type Split } from './money';

export interface DiscordPlayer {
  name: string;
  isPaid: boolean;
}

export interface DiscordItem {
  name: string;
  price: number;
  quantity: number;
}

/** ข้อความสำหรับวางใน Discord (ใช้ร่วมกันระหว่างหน้ารอบและหน้าใบสรุป) */
export function buildDiscordText(players: DiscordPlayer[], items: DiscordItem[], split: Split): string {
  const who = players.map((p) => `@${p.name}${p.isPaid ? ' ✅' : ''}`).join(' ');
  const lines = items.map((i) => `${i.name}${i.quantity > 1 ? ` x${i.quantity}` : ''} ${formatShort(i.price).toUpperCase()}`);
  const totalLabel = split.total >= 1000 && split.total % 1000 === 0 ? String(split.total / 1000) : formatFull(split.total);
  const per = split.perPerson === null ? '-' : formatShort(split.perPerson);
  return [who, ...lines, `รวม ${totalLabel} คนละ ${per}`].filter(Boolean).join('\n');
}
