'use client';

const ring = 'shrink-0 items-center justify-center rounded-full bg-[#15111d] shadow-[0_0_0_5px_#ffd3e4]';

export function ViperLogoFull({ className = 'mx-auto' }: { className?: string }) {
  return (
    <div className={`${className} flex h-32 w-32 ${ring}`}>
      <img src="/logo.png" alt="VIPER" className="w-24 object-contain" />
    </div>
  );
}

export function ViperLogoMark({ className = '' }: { className?: string }) {
  return (
    <div className={`${className} flex h-[68px] w-[68px] ${ring}`}>
      <img src="/logo-mark.png" alt="VIPER" className="w-12 object-contain" />
    </div>
  );
}
