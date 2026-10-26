'use client';

import { useEffect, useState } from 'react';

// ลิงก์เชิญ: /join?code=xxxx เก็บรหัสไว้ก่อน แล้วไปหน้าหลัก
// (ถ้ายังไม่ล็อกอินจะถูกส่งไปหน้า login แล้วเข้าร่วมแก็งอัตโนมัติหลังล็อกอิน)
export default function JoinPage() {
  const [msg, setMsg] = useState('กำลังเข้าร่วมแก็ง...');

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code');
    if (!code) {
      setMsg('ไม่พบรหัสเชิญในลิงก์');
      return;
    }
    try {
      localStorage.setItem('pendingInvite', code);
    } catch {
      setMsg('เบราว์เซอร์ไม่อนุญาตให้เก็บข้อมูล กรุณาใส่รหัสเชิญด้วยตนเองหลังล็อกอิน: ' + code);
      return;
    }
    window.location.replace('/');
  }, []);

  return (
    <div className="mx-auto flex min-h-screen max-w-sm items-center justify-center p-4 text-center">
      <p className="text-indigo-200/80">{msg}</p>
    </div>
  );
}
