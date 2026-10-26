import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** false = ยังไม่ได้ตั้งค่า .env.local */
export const supabaseConfigured = Boolean(url && key);

// ใช้เฉพาะ publishable (anon) key ในเบราว์เซอร์ สิทธิ์ทั้งหมดคุมด้วย RLS ใน schema.sql
export const supabase = createClient(url || 'http://localhost:54321', key || 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
