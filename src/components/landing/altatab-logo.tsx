import { cn } from "@/lib/utils";

type AltatabLogoProps = {
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
  showWordmark?: boolean;
};

/** Minimal geometric mark: nested squares suggesting a table + digital tab. */
export function AltatabLogo({
  className,
  markClassName,
  wordmarkClassName,
  showWordmark = true,
}: AltatabLogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg
        viewBox="0 0 32 32"
        aria-hidden
        className={cn("size-7 shrink-0", markClassName)}
      >
        <rect
          x="3"
          y="3"
          width="26"
          height="26"
          rx="6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          opacity="0.9"
        />
        <rect
          x="9"
          y="9"
          width="14"
          height="14"
          rx="3"
          fill="currentColor"
          opacity="0.95"
        />
        <path
          d="M13 16h6M16 13v6"
          stroke="#0a0a0b"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
      {showWordmark ? (
        <span
          className={cn(
            "text-[1.05rem] font-semibold tracking-[-0.04em] sm:text-lg",
            wordmarkClassName,
          )}
        >
          Altatab
        </span>
      ) : null}
    </span>
  );
}
