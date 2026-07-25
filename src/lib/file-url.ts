const BACKEND = (import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");

/**
 * Resolve a stored document path to a usable URL. Vercel Blob stores an absolute
 * URL, while the local-dev fallback stores a relative `uploads/<name>` path that
 * has to be served from the backend origin.
 */
export function assetUrl(pathOrUrl: string | null | undefined): string {
  if (!pathOrUrl) return "";
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${BACKEND}/${pathOrUrl.replace(/^\//, "")}`;
}
