export function LogoBadge({ size = 68, ring = true }: { size?: number; ring?: boolean }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-[#15111d]"
      style={{ width: size, height: size, boxShadow: ring ? '0 0 0 4px #ffd3e4' : undefined }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-mark-square.png" alt="VIPER" width={size} height={size} className="block h-full w-full object-contain" />
    </span>
  );
}
