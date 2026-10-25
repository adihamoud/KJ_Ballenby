import { Link } from "@/i18n/navigation";
import { MicIcon } from "@/components/icons";

/** The app mark: a pink-to-violet tile with a mic. Same shape as the PWA icon. */
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="from-brand to-brand-2 inline-flex shrink-0 items-center justify-center rounded-[28%] bg-gradient-to-br text-white shadow-[0_6px_16px_-6px_rgba(255,77,141,0.7)]"
      style={{ width: size, height: size }}
    >
      <MicIcon size={Math.round(size * 0.56)} strokeWidth={2.4} />
    </span>
  );
}

/** Mark plus wordmark. Links home unless `asLink` is false (the guest home is already home). */
export function Brand({ name, asLink = true }: { name: string; asLink?: boolean }) {
  const inner = (
    <>
      <BrandMark />
      <span className="text-base font-extrabold tracking-tight">{name}</span>
    </>
  );
  const cls = "inline-flex items-center gap-2.5";
  return asLink ? (
    <Link href="/" className={cls}>
      {inner}
    </Link>
  ) : (
    <span className={cls}>{inner}</span>
  );
}
