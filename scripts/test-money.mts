// รัน: npm run test:money  (ต้องใช้ Node 22.6+)
import { parseMoney, formatFull, formatShort, calcSplit, perPersonOf } from '../lib/money.ts';

let failed = 0;
function eq<T>(name: string, actual: T, expected: T) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  →  ${JSON.stringify(actual)}${ok ? '' : `  (คาดว่า ${JSON.stringify(expected)})`}`);
}

// parseMoney
eq('parse 250k', parseMoney('250k'), 250000);
eq('parse 250K', parseMoney('250K'), 250000);
eq('parse 1.5m', parseMoney('1.5m'), 1500000);
eq('parse 250,000', parseMoney('250,000'), 250000);
eq('parse 250000', parseMoney('250000'), 250000);
eq('parse ว่าง', parseMoney(''), null);
eq('parse abc', parseMoney('abc'), null);

// format
eq('short 250000', formatShort(250000), '250k');
eq('short 1500000', formatShort(1500000), '1.5m');
eq('short 500', formatShort(500), '500');
eq('full 207500', formatFull(207500), '207,500');

// ตัวอย่างจากภาพ: 250k+50k+150k+160k+220k = 830k หาร 4
const items = [250000, 50000, 150000, 160000, 220000].map((price) => ({ price, quantity: 1 }));
const s = calcSplit(items, 4, 'ceil_1000');
eq('รวม', s.total, 830000);
eq('ดิบ', s.raw, 207500);
eq('ต่อคน (ปัดขึ้น)', s.perPerson, 208000);
eq('ส่วนเกิน', s.overage, 2000);
eq('ต่อคน (ปัดลง)', perPersonOf(830000, 4, 'floor_1000'), 207000);
eq('ต่อคน (ใกล้สุด)', perPersonOf(830000, 4, 'round_1000'), 208000);
eq('ต่อคน (ไม่ปัดพัน)', perPersonOf(830000, 4, 'none'), 207500);
eq('หาร 3 ปัดขึ้น', perPersonOf(830000, 3, 'ceil_1000'), 277000);
eq('หาร 3 ไม่ปัดพัน', perPersonOf(830000, 3, 'none'), 276667);
eq('0 คน', perPersonOf(830000, 0, 'ceil_1000'), null);
eq('จำนวน x2', calcSplit([{ price: 100000, quantity: 2 }], 2, 'ceil_1000').total, 200000);

if (failed) {
  console.error(`\nล้มเหลว ${failed} รายการ`);
  process.exit(1);
}
console.log('\nผ่านทั้งหมด');
