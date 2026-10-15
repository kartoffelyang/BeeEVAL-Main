import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { verifyRelease } from "./verify";
import { createCaseSearch } from "../local-server/case-search";
import { requestAuthorization } from "../local-server/session-auth";
const upstream = process.env.BEEEVAL_UPSTREAM || "https://open.beeeval.com";
const search = createCaseSearch(upstream, (r) => {
  console.log(
    JSON.stringify({
      event: "search",
      status: r.status,
      error: r.error,
      index_total: r.index_total,
      hidden_vehicle_records: r.hidden_vehicle_records,
      missing_vehicle_records: r.missing_vehicle_records,
      visible_vehicle_records: r.visible_vehicle_records,
      total: r.total,
      returned: r.returned,
      index_records: r.index_records,
      duration_ms: r.duration_ms,
    }),
  );
});
let verified = false;
const warmed = new Map<string, number>();
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    const authorization = requestAuthorization(req);
    if (url.pathname === "/health") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ service: "BeeEVAL Light", ok: true }));
      return;
    }
    if (url.pathname === "/api/cases/search" && req.method !== "GET") {
      res.writeHead(405);
      res.end();
      return;
    }
    if (await search(req, res)) return;
    if (
      !url.pathname.startsWith("/api/") &&
      !url.pathname.startsWith("/screenshots/")
    ) {
      res.writeHead(404);
      res.end();
      return;
    }
    const headers = new Headers();
    for (const name of [
      "authorization",
      "content-type",
      "range",
      "if-range",
      "accept",
      "cookie",
      "origin",
      "referer",
      "x-forwarded-host",
      "x-forwarded-proto",
    ]) {
      const value = req.headers[name];
      if (typeof value === "string") headers.set(name, value);
    }
    const method = req.method || "GET";
    const init: any = {
      method,
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(600000),
    };
    if (!["GET", "HEAD"].includes(method)) {
      init.body = req;
      init.duplex = "half";
    }
    const response = await fetch(upstream + url.pathname + url.search, init);
    console.log(
      JSON.stringify({
        event: "upstream",
        path: url.pathname,
        method,
        status: response.status,
        range: !!req.headers.range,
      }),
    );
    if (
      !verified &&
      process.env.BEEEVAL_VERIFY_ONCE === "1" &&
      response.ok &&
      authorization
    ) {
      verified = true;
      void verifyRelease(upstream, authorization, search);
    }
    res.statusCode = response.status;
    for (const [name, value] of response.headers) {
      if (
        ![
          "content-length",
          "content-encoding",
          "transfer-encoding",
          "connection",
          "set-cookie",
        ].includes(name)
      )
        res.setHeader(name, value);
    }
    const cookies = response.headers.getSetCookie();
    if (cookies.length) res.setHeader("set-cookie", cookies);
    if (
      response.ok &&
      typeof authorization === "string" &&
      [
        "/api/auth/me",
        "/api/aggregation/vehicles",
        "/api/video/all-results",
      ].includes(url.pathname)
    ) {
      const key = createHash("sha256")
        .update(authorization)
        .digest("hex");
      if ((warmed.get(key) || 0) < Date.now()) {
        if (warmed.size >= 50) warmed.delete(warmed.keys().next().value!);
        warmed.set(key, Date.now() + 15 * 60_000);
        void search(
          {
            url: "/api/cases/search?exclude_review=true",
            method: "GET",
            headers: { authorization },
          } as any,
          { setHeader() {}, set statusCode(v: number) {}, end() {} } as any,
        );
      }
    }
    if (method === "HEAD" || !response.body) res.end();
    else await pipeline(Readable.fromWeb(response.body as any), res);
  } catch {
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ detail: "upstream_unavailable" }));
    } else res.destroy();
  }
});
server.listen(Number(process.env.PORT || 5188), "127.0.0.1");
