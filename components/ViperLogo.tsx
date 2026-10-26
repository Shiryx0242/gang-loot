'use client';

import { useState } from 'react';

/**
 * แสดงโลโก้ VIPER:
 * - ถ้ามีไฟล์ `/logo.png` หรือ `/logo-mark.png` ใน `public/` จะแสดงไฟล์ภาพต้นฉบับพร้อมแสงเรือง (glow)
 * - ถ้ายังไม่มีไฟล์ จะแสดงโลโก้ SVG ตรา V สีชมพู-ม่วง สไตล์ VIPER แทนโดยอัตโนมัติ
 */
export function ViperLogoFull({ className = 'mx-auto h-28 w-auto' }: { className?: string }) {
  const [fallback, setFallback] = useState(false);

  if (!fallback) {
    return (
      <img
        src="/logo.png"
        alt="VIPER"
        className={`${className} drop-shadow-[0_0_24px_rgba(236,72,153,0.45)]`}
        onError={() => setFallback(true)}
      />
    );
  }

  return (
    <div className="inline-flex flex-col items-center select-none drop-shadow-[0_0_24px_rgba(236,72,153,0.5)]">
      <svg viewBox="0 0 120 100" className="h-20 w-auto" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="viperGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f472b6" />
            <stop offset="55%" stopColor="#ec4899" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>
        <path
          d="M14 12L44 12L60 56L76 12L106 12L68 90H52L14 12Z"
          fill="url(#viperGrad)"
        />
        <path
          d="M34 12L50 12L60 40L70 12L86 12L60 72L34 12Z"
          fill="#090414"
          fillOpacity="0.45"
        />
      </svg>
      <span className="mt-1 bg-gradient-to-r from-pink-400 via-fuchsia-400 to-violet-400 bg-clip-text text-xl font-extrabold tracking-[0.28em] text-transparent">
        VIPER
      </span>
    </div>
  );
}

export function ViperLogoMark({ className = 'h-7 w-7' }: { className?: string }) {
  const [fallback, setFallback] = useState(false);

  if (!fallback) {
    return (
      <img
        src="/logo-mark.png"
        alt="V"
        className={`${className} object-contain drop-shadow-[0_0_10px_rgba(236,72,153,0.45)]`}
        onError={() => setFallback(true)}
      />
    );
  }

  return (
    <svg
      viewBox="0 0 64 64"
      className={`${className} shrink-0 drop-shadow-[0_0_10px_rgba(236,72,153,0.5)]`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="viperMarkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f472b6" />
          <stop offset="55%" stopColor="#ec4899" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <path d="M6 10H24L32 36L40 10H58L37 56H27L6 10Z" fill="url(#viperMarkGrad)" />
    </svg>
  );
}
