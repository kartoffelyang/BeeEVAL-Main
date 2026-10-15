export function usesUnifiedSession(hostname = window.location.hostname): boolean {
  return hostname === "beeeval.com" || hostname.endsWith(".beeeval.com");
}

export function unifiedLoginUrl(from = "/", base = import.meta.env.BASE_URL): string {
  const path = from.startsWith("/") && !from.startsWith("//") ? from : "/";
  const prefix = base.replace(/\/$/, "");
  const destination = `https://www.beeeval.com${prefix}${path}`;
  return `https://www.beeeval.com/login.html?return=${encodeURIComponent(destination)}`;
}
