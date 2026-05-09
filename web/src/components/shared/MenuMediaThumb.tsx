import type { ReactNode } from "react";
import { resolveMediaUrl } from "@/lib/api";

type MenuMediaThumbProps = {
  /** Raw image path from the API (or absolute URL). */
  mediaPath?: string | null;
  alt: string;
  className?: string;
  fallback?: ReactNode;
};

/**
 * Square or fixed-height media area for menu items, categories, or cart thumbs.
 */
export function MenuMediaThumb({ mediaPath, alt, className = "", fallback }: MenuMediaThumbProps) {
  const url = resolveMediaUrl(mediaPath ?? null);
  if (!url) {
    return (
      <div className={`flex items-center justify-center bg-surface-alt text-muted-foreground ${className}`}>
        {fallback ?? <span className="text-2xl" aria-hidden>🍽️</span>}
      </div>
    );
  }
  return (
    <div className={`relative isolate min-h-0 overflow-hidden bg-surface-alt ${className}`}>
      <img
        src={url}
        alt={alt}
        className="block h-full w-full min-h-0 object-cover"
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}
