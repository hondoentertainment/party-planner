import { useEffect } from "react";

/**
 * Privacy-friendly analytics (optional). Set `VITE_PLAUSIBLE_DOMAIN` on the build
 * (e.g. your production hostname without protocol). Self-hosted: set `VITE_PLAUSIBLE_SCRIPT_URL`.
 */
export function PlausibleLoader() {
  const domain = import.meta.env.VITE_PLAUSIBLE_DOMAIN?.trim();
  const scriptSrc =
    import.meta.env.VITE_PLAUSIBLE_SCRIPT_URL?.trim() || "https://plausible.io/js/script.js";

  useEffect(() => {
    if (!domain || import.meta.env.DEV) return;
    if (document.querySelector("script[data-domain][data-plausible-loader]")) return;

    const s = document.createElement("script");
    s.defer = true;
    s.dataset.domain = domain;
    s.dataset.plausibleLoader = "";
    s.src = scriptSrc;
    document.head.appendChild(s);
  }, [domain, scriptSrc]);

  return null;
}
