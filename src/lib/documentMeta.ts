/** Default head values — keep in sync with `index.html`. */
export const DEFAULT_DOCUMENT_TITLE = "Party Planner — Plan parties together";
export const DEFAULT_DOCUMENT_DESCRIPTION =
  "Plan parties together. Track food, drinks, music, decor, setup, and everything in between.";

const META_MARKER = "data-party-planner-meta";

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  const sel = `meta[${attr}="${CSS.escape(key)}"][${META_MARKER}]`;
  let el = document.head.querySelector<HTMLMetaElement>(sel);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    el.setAttribute(META_MARKER, "true");
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertLink(rel: string, href: string) {
  const sel = `link[rel="${CSS.escape(rel)}"][${META_MARKER}]`;
  let el = document.head.querySelector<HTMLLinkElement>(sel);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    el.setAttribute(META_MARKER, "true");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function removeMarkedHeadNodes() {
  document.head.querySelectorAll(`[${META_MARKER}]`).forEach((n) => n.remove());
}

/** Restore shell defaults (e.g. share link error / unavailable). */
export function resetPublicPageMeta() {
  document.title = DEFAULT_DOCUMENT_TITLE;
  const descEl = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (descEl && !descEl.hasAttribute(META_MARKER)) {
    descEl.setAttribute("content", DEFAULT_DOCUMENT_DESCRIPTION);
  }
  removeMarkedHeadNodes();
}

export interface PublicPageMetaInput {
  title: string;
  description: string;
  /** Full URL for og:url / canonical (https://your-domain.com/s/...) */
  canonicalUrl: string;
}

/**
 * Sets title, description, Open Graph, Twitter card, and canonical for public share pages.
 * Call the returned cleanup from useEffect to restore defaults when leaving the route.
 */
export function applyPublicPageMeta(input: PublicPageMetaInput): () => void {
  const { title, description, canonicalUrl } = input;
  const prevTitle = document.title;
  const descEl = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  const hadDesc = Boolean(descEl && !descEl.hasAttribute(META_MARKER));
  const prevDescContent = descEl?.getAttribute("content") ?? null;

  document.title = title;
  if (descEl && !descEl.hasAttribute(META_MARKER)) {
    descEl.setAttribute("content", description);
  } else {
    upsertMeta("name", "description", description);
  }

  upsertMeta("property", "og:title", title);
  upsertMeta("property", "og:description", description);
  upsertMeta("property", "og:type", "website");
  upsertMeta("property", "og:url", canonicalUrl);
  try {
    const u = new URL(canonicalUrl);
    if (u.protocol === "http:" || u.protocol === "https:") {
      upsertMeta("property", "og:image", `${u.origin}/party.svg`);
    }
  } catch {
    // invalid canonical URL — skip preview image
  }
  upsertMeta("name", "twitter:card", "summary");
  upsertMeta("name", "twitter:title", title);
  upsertMeta("name", "twitter:description", description);
  upsertLink("canonical", canonicalUrl);

  return () => {
    removeMarkedHeadNodes();
    document.title = prevTitle;
    if (descEl && hadDesc) {
      descEl.setAttribute("content", prevDescContent ?? DEFAULT_DOCUMENT_DESCRIPTION);
    }
  };
}

export function publicShareCanonicalUrl(pathname: string): string {
  const base = import.meta.env.VITE_PUBLIC_SITE_URL?.replace(/\/$/, "").trim();
  if (base) {
    const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
    return `${base}${path}`;
  }
  if (typeof window !== "undefined") return window.location.href;
  return "";
}
