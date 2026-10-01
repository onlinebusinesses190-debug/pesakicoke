/**
 * PESAKI brand mark.
 *
 * Uses the real PWA icon (`/icons/icon-192.png`) inside a circular container
 * with a subtle green glow. Used by the landing header, /auth, /about hero and
 * the authenticated app header.
 */

const LOGO_SRC = "/icons/icon-192.png";

export function PesakiLogo({
  size = 44,
  className = "",
  tone = "light",
  alt = "PESAKI",
}: {
  size?: number;
  className?: string;
  /** "light" = logo sits on a dark hero, "dark" = logo sits on a light surface */
  tone?: "light" | "dark";
  alt?: string;
}) {
  const ring = tone === "light" ? "ring-1 ring-white/35 bg-white" : "ring-1 ring-black/5 bg-white";

  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full ${ring} ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src={LOGO_SRC}
        alt={alt}
        width={size}
        height={size}
        className="h-full w-full object-cover"
        draggable={false}
      />
    </span>
  );
}

export function PesakiWordmark({
  tagline = "WORK • GROW • BANK",
  size = "md",
  tone = "light",
  className = "",
}: {
  tagline?: string;
  size?: "sm" | "md" | "lg";
  tone?: "light" | "dark";
  className?: string;
}) {
  const titleSize =
    size === "lg"
      ? "text-[26px] leading-none"
      : size === "sm"
        ? "text-base leading-none"
        : "text-xl leading-none";

  const taglineSize = size === "lg" ? "text-[9px]" : "text-[8px]";

  // The wordmark is real text (the logo mark itself is an image and must not be
  // recoloured), so the "S" can be accented independently.
  const wordColor = tone === "light" ? "text-white" : "text-brand-deep";
  const letters = ["P", "E", "S", "A", "K", "I"];

  return (
    <span className={`flex min-w-0 flex-col ${className}`}>
      <span
        className={`font-display font-bold tracking-[0.06em] ${titleSize} ${wordColor}`}
        aria-label="PESAKI"
      >
        {letters.map((letter, i) => (
          <span key={i} className={i === 2 ? "text-brand-gold" : undefined}>
            {letter}
          </span>
        ))}
      </span>
      {tagline && (
        <span
          className={`mt-1 font-medium tracking-[0.22em] ${taglineSize} ${tone === "light" ? "text-white/70" : "text-muted-foreground"}`}
        >
          {tagline}
        </span>
      )}
    </span>
  );
}

export default PesakiLogo;
