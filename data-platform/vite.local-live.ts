import { createCaseSearch } from "./local-server/case-search";
import { gunzipSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
/** Local UI against the original authenticated backend; never opens database ports. */
import { defineConfig, mergeConfig, type Plugin } from "vite";
import base from "./vite.config";
const upstream = process.env.VITE_API_TARGET || "https://open.beeeval.com";
const checks: Record<string, unknown> = {};
let probed = false;
const save = () =>
  writeFileSync(
    resolve("preview/live-data-checks.json"),
    JSON.stringify({ upstream, checks }, null, 2) + "\n",
  );
async function verifyData(authorization: string) {
  if (probed) return;
  probed = true;
  let list: any[] = [];
  let sample: any = null;
  for (const endpoint of [
    "/api/aggregation/vehicles",
    "/api/video/all-results?limit=1",
    "/api/video/all-results?limit=1&exclude_review=true",
  ]) {
    const result: any = { checked_at: new Date().toISOString() };
    try {
      const response = await fetch(upstream + endpoint, {
        headers: { Authorization: authorization },
        signal: AbortSignal.timeout(90000),
      });
      result.status = response.status;
      const body = await response.json();
      if (endpoint === "/api/aggregation/vehicles" && Array.isArray(body))
        list = body;
      if (endpoint.endsWith("exclude_review=true")) sample = body.data?.[0];
      if (Array.isArray(body)) result.returned = body.length;
      else {
        if (typeof body.total === "number") result.total = body.total;
        if (Array.isArray(body.data)) result.returned = body.data.length;
      }
    } catch (e) {
      result.error = e instanceof Error ? e.name : "request_failed";
    }
    checks["verify:" + endpoint] = result;
    save();
  }
  const v = list.find((v: any) => v.has_cache) || list[0];
  const vehicleParams = v
    ? new URLSearchParams({
        brand_model: v.brand_model,
        ...(v.system_version ? { system_version: v.system_version } : {}),
      }).toString()
    : "";
  const probes: Array<[string, string]> = v
    ? [
        ["vehicle-scores", "/api/aggregation/vehicle?" + vehicleParams],
        [
          "acceptance-baseline",
          "/api/aggregation/vehicle/acceptance-completion?" + vehicleParams,
        ],
        [
          "case-matrix",
          "/api/video/pk-cases?" +
            new URLSearchParams({
              brand_models: list
                .slice(0, 2)
                .map((v: any) => v.brand_model)
                .join(","),
              limit: "1",
            }),
        ],
      ]
    : [];
  if (sample?.case_id)
    probes.push([
      "case-exact",
      "/api/video/all-results?" +
        new URLSearchParams({
          case_id: sample.case_id,
          brand_model: sample.brand_model,
          ...(sample.system_version
            ? { system_version: sample.system_version }
            : {}),
          limit: "100",
          exclude_review: "true",
        }),
    ]);
  for (const [name, endpoint] of probes) {
    const result: any = { checked_at: new Date().toISOString() };
    try {
      const response = await fetch(upstream + endpoint, {
        headers: { Authorization: authorization },
        signal: AbortSignal.timeout(90000),
      });
      result.status = response.status;
      const body = await response.json();
      if (Array.isArray(body)) result.returned = body.length;
      else {
        if (typeof body.total === "number") result.total = body.total;
        if (Array.isArray(body.data)) result.returned = body.data.length;
      }
      if (name === "case-exact")
        result.original_record_found =
          body.data?.some((r: any) => r.id === sample.id) === true;
      if (name === "vehicle-scores")
        result.domain_count = body.function_domain_scores?.length || 0;
      if (name === "acceptance-baseline") {
        result.domain_count = body.by_domain?.length || 0;
        const domain = body.by_domain?.find((d: any) =>
          Object.values(d.grades || {}).some((g: any) => g.case_count > 0),
        )?.function_domain;
        if (domain)
          probes.push([
            "task-improvement",
            "/api/aggregation/vehicle/acceptance-task-detail?" +
              vehicleParams +
              "&" +
              new URLSearchParams({ function_domain: domain }),
          ]);
      }
      if (name === "task-improvement")
        result.task_groups =
          body.by_grade?.reduce(
            (n: number, g: any) => n + (g.task_details?.length || 0),
            0,
          ) || 0;
      if (name === "case-matrix") {
        const row = body.data?.[0];
        const keys = Object.keys(row?.scores || {});
        if (row && keys.length) {
          const [a, av] = keys[0].split("||");
          const [b, bv] = (keys[1] || keys[0]).split("||");
          probes.push([
            "comparison-evidence",
            "/api/video/pk-detail?" +
              new URLSearchParams({
                case_id: row.case_id,
                brand_model_a: a,
                brand_model_b: b,
                ...(av ? { system_version_a: av } : {}),
                ...(bv ? { system_version_b: bv } : {}),
              }),
          ]);
        }
      }
      if (name === "comparison-evidence") {
        result.primary_found = !!body.a;
        result.reference_found = !!body.b;
      }
    } catch (e) {
      result.error = e instanceof Error ? e.name : "request_failed";
    }
    checks["verify:" + name] = result;
    save();
  }
}
const authenticationPaths = new Set([
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/change-password",
]);
// Signing authorizes an existing video read; it does not edit evaluation records.
const videoReadPaths = new Set(["/api/video/stream/sign"]);
const caseSearch = createCaseSearch(upstream, (result) => {
  checks[
    result.validation ? "case-content-validation" : result.enrichment ? "case-content-enrichment" : "case-content-search"
  ] = result;
  save();
});
const readonly: Plugin = {
  name: "local-live-readonly",
  transformIndexHtml(html) {
    return html.replace(
      "<head>",
      `<head><script>if(localStorage.getItem('beeeval.auth.token')==='local-design-preview')localStorage.removeItem('beeeval.auth.token');</script>`,
    );
  },
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (await caseSearch(req, res)) return;
      const path = new URL(req.url || "/", "http://127.0.0.1").pathname;
      if (!path.startsWith("/api/")) return next();
      if (
        !["GET", "HEAD", "OPTIONS"].includes(req.method || "GET") &&
        !authenticationPaths.has(path) &&
        !(req.method === "POST" && videoReadPaths.has(path))
      ) {
        res.statusCode = 403;
        res.setHeader("Content-Type", "application/json");
        return res.end(
          JSON.stringify({
            detail: "本地查询版仅允许读取数据和账号认证，不执行业务写入。",
          }),
        );
      }
      next();
    });
  },
};
export default mergeConfig(
  base,
  defineConfig({
    server: {
      host: "127.0.0.1",
      port: 5186,
      strictPort: true,
      open: false,
      proxy: {
        "/api": {
          target: upstream,
          changeOrigin: true,
          secure: true,
          configure(proxy) {
            proxy.on("proxyRes", (response, request) => {
              const path = new URL(request.url || "/", "http://127.0.0.1")
                .pathname;
              if (request.method !== "GET") return;
              const entry: any = {
                status: response.statusCode,
                checked_at: new Date().toISOString(),
              };
              entry.filter_keys = [
                ...new URL(
                  request.url || "/",
                  "http://127.0.0.1",
                ).searchParams.keys(),
              ];
              checks[path] = entry;
              if (
                response.statusCode === 200 &&
                request.headers.authorization &&
                !probed
              ) {
                probed = true;
                void caseSearch(
                  {
                    url: "/api/cases/search?exclude_review=true",
                    method: "GET",
                    headers: { authorization: request.headers.authorization },
                  } as any,
                  {
                    setHeader() {},
                    set statusCode(value: number) {},
                    end() {},
                  } as any,
                );
              }
              const chunks: Buffer[] = [];
              let bytes = 0;
              response.on("data", (chunk: Buffer) => {
                bytes += chunk.length;
                if (bytes <= 1048576) chunks.push(chunk);
              });
              response.on("end", () => {
                // Save only verification counts/status. Never save credentials, token, text or personal data.
                try {
                  if (bytes <= 1048576 && response.statusCode === 200) {
                    const raw = Buffer.concat(chunks);
                    const body = JSON.parse(
                      (response.headers["content-encoding"] === "gzip"
                        ? gunzipSync(raw)
                        : raw
                      ).toString(),
                    );
                    if (path === "/api/auth/me") {
                      entry.authenticated = true;
                      entry.role = body.role;
                      if (request.headers.authorization) {
                        probed = true;
                        void caseSearch(
                          {
                            url: "/api/cases/search?exclude_review=true",
                            method: "GET",
                            headers: {
                              authorization: request.headers.authorization,
                            },
                          } as any,
                          {
                            setHeader() {},
                            set statusCode(value: number) {},
                            end() {},
                          } as any,
                        );
                      }
                    } else if (Array.isArray(body))
                      entry.returned = body.length;
                    else {
                      if (typeof body.total === "number")
                        entry.total = body.total;
                      if (Array.isArray(body.data))
                        entry.returned = body.data.length;
                    }
                  }
                } catch {}
                writeFileSync(
                  resolve("preview/live-data-checks.json"),
                  JSON.stringify({ upstream, checks }, null, 2) + "\n",
                );
              });
            });
          },
        },
        "/screenshots": { target: upstream, changeOrigin: true, secure: true },
      },
    },
    plugins: [readonly],
  }),
);
