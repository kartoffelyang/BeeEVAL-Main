import type { IncomingMessage } from "node:http";

/** Normalize the original shared session only inside the server, never expose it to JS. */
export function requestAuthorization(req: Pick<IncomingMessage, "headers">): string | undefined {
  const cookies = new Map((req.headers.cookie || "").split(";").map((entry) => {
    const at = entry.indexOf("=");
    return [entry.slice(0, at).trim(), entry.slice(at + 1).trim()];
  }));
  if (cookies.get("beeeval_signed_out") === "1") return undefined;
  const session = cookies.get("beeeval_session");
  if (session && !/[\r\n]/.test(session)) return `Bearer ${session}`;
  return typeof req.headers.authorization === "string" ? req.headers.authorization : undefined;
}
