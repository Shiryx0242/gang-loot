'use client';

export function ViperLogoFull({ className = 'mx-auto h-36 w-auto' }: { className?: string }) {
  return (
    <img
      src="/logo.png"
      alt="VIPER"
      className={`${className} object-contain drop-shadow-[0_0_24px_rgba(236,72,153,0.5)]`}
    />
  );
}

export function ViperLogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <img
      src="/logo-mark.png"
      alt="VIPER"
      className={`${className} shrink-0 object-contain drop-shadow-[0_0_10px_rgba(236,72,153,0.45)]`}
    />
  );
}
