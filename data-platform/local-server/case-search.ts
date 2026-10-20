import caseClassification from "./data/case-classification.json";
import { isHiddenVehicle } from '../src/utils/vehicleVisibility';
import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { requestAuthorization } from "./session-auth";

export type CaseRecord = Record<string, any>;
export function hasVehicleModel(model: unknown): boolean {
  if (typeof model !== "string") return false;
  const value = model.trim();
  return !!value && !/^(?:-|—|–|null|undefined|none|n\/a|unknown|未知|未知车型|车型未提供|未提供)$/i.test(value);
}
export function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{Z}\s]/gu, "");
}
function readable(value: any): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (Array.isArray(value)) return value.map(readable).join(" ");
  if (typeof value === "object")
    return Object.values(value).map(readable).join(" ");
  return "";
}
/** Only actual case fields, never inferred labels or scores. */
const textCache = new WeakMap<CaseRecord, string>();
export function caseContent(row: CaseRecord): string {
  if (row._locked) return "";
  if (textCache.has(row)) return textCache.get(row)!;
  const m = row.metadata || {};
  const value = normalize(
    [
      row.case_id,
      row.video_name,
      row.user_question,
      row.transcript,
      row.content,
      row.task_detail,
      row.labels,
      row.case_definition,
      row.case_tags,
      m.user_question,
      m.system_response,
      m.dialogue,
      m.summary,
      m.content,
      m.task_detail,
      m.task_family,
      m.intent_label,
      m.labels,
      m.case_tags,
      m.scenario_tags,
    ]
      .map(readable)
      .join(" "),
  );
  textCache.set(row, value);
  return value;
}
/** Official source taxonomy; display-only snapshot, never inferred from scores. */
export function classifyCase(row: CaseRecord) {
  if (row._locked) return { task_detail: "", acceptance_tag: "" };
  const tag = (caseClassification as Record<string, any>)[String(row.case_id)] || {};
  return {
    task_detail: row.task_detail || row.metadata?.task_detail || tag.task_detail || "未分类",
    acceptance_tag: row.acceptance_tag || row.metadata?.acceptance_tag || tag.acceptance_tag || "未分类",
  };
}
export function queryCases(rows: CaseRecord[], params: URLSearchParams) {
  const terms = (params.get("search") || "")
    .trim()
    .split(/\s+/u)
    .map(normalize)
    .filter(Boolean);
  const filtered = rows.filter((row) => {
    if (!hasVehicleModel(row.brand_model)) return false;
    if (params.get("hide_volkswagen") === "true" && isHiddenVehicle(row.brand_model)) return false;
    if (
      terms.length &&
      (row._locked || !terms.every((t) => caseContent(row).includes(t)))
    )
      return false;
    for (const field of [
      "case_id",
      "brand_model",
      "system_version",
      "function_domain",
      "video_name",
    ])
      if (params.get(field) && String(row[field] ?? "") !== params.get(field))
        return false;
    const classification = classifyCase(row);
    for (const key of ["task_detail", "acceptance_tag"] as const)
      if (params.get(key) && classification[key] !== params.get(key)) return false;
    const score = row.metadata?.response_quality_score;
    if (
      (params.has("min_score") || params.has("max_score")) &&
      (score == null || score === "" || !Number.isFinite(Number(score)))
    )
      return false;
    if (
      params.has("min_score") &&
      (score == null || Number(score) < Number(params.get("min_score")))
    )
      return false;
    if (
      params.has("max_score") &&
      (score == null ||
        (params.get("max_score_exclusive") === "true"
          ? Number(score) >= Number(params.get("max_score"))
          : Number(score) > Number(params.get("max_score"))))
    )
      return false;
    return true;
  });
  const field =
    params.get("sort_by") === "created_at" ? "created_at" : "case_id";
  const dir = params.get("sort_order") === "desc" ? -1 : 1;
  filtered.sort((a, b) => {
    const x = String(a[field] ?? ""),
      y = String(b[field] ?? "");
    return (
      dir * (x < y ? -1 : x > y ? 1 : String(a.id).localeCompare(String(b.id)))
    );
  });
  const offset = Math.max(0, Math.floor(Number(params.get("offset")) || 0));
  const limit = Math.max(
    1,
    Math.min(100, Math.floor(Number(params.get("limit")) || 30)),
  );
  return {
    facets: (() => {
      const scoped = rows.filter(row => !row._locked && hasVehicleModel(row.brand_model) && (params.get("hide_volkswagen") !== "true" || !isHiddenVehicle(row.brand_model)) &&
        ["brand_model", "system_version", "function_domain"].every(key => !params.get(key) || String(row[key] ?? "") === params.get(key)));
      const tags = scoped.map(classifyCase);
      return { task_types: [...new Set(tags.map(t => t.task_detail))].sort((a,b) => a.localeCompare(b, "zh-CN")),
        difficulties: [...new Set(tags.map(t => t.acceptance_tag))] };
    })(),
    data: filtered.slice(offset, offset + limit),
    total: filtered.length,
    offset,
    limit,
  };
}
type Index = {
  rows: CaseRecord[];
  total: number;
  state: "loading" | "ready" | "error";
  expires: number;
  error?: string;
  refreshing?: boolean;
  warning?: string;
  schemaVersion?: number;
};
export function createCaseSearch(
  upstream: string,
  observe: (result: Record<string, unknown>) => void,
) {
  const globalCaches = ((globalThis as any).__beeevalCaseIndexes ||= new Map<
    string,
    Map<string, Index>
  >());
  const indexes: Map<string, Index> = globalCaches.get(upstream) || new Map();
  globalCaches.set(upstream, indexes);
  const ttl = 15 * 60_000;
  async function fetchJson(path: string, authorization: string) {
    const r = await fetch(upstream + path, {
      headers: { Authorization: authorization },
      signal: AbortSignal.timeout(60_000),
    });
    if (!r.ok) {
      const e: any = new Error(`upstream_${r.status}`);
      e.status = r.status;
      throw e;
    }
    return r.json();
  }
  async function load(
    index: Index,
    authorization: string,
    params: URLSearchParams,
  ) {
    try {
      const scope = new URLSearchParams({ limit: "1", freeze_snapshot: "true", index_only: "true" });
      for (const key of ["exclude_review", "include_failed", "status"])
        if (params.has(key)) scope.set(key, params.get(key)!);
      const first = await fetchJson(
        "/api/video/all-results?" + scope,
        authorization,
      );
      scope.delete("freeze_snapshot");
      if (first.snapshot_before) scope.set("created_before", first.snapshot_before);
      index.total = first.total;
      if (!Number.isInteger(index.total) || index.total < 0)
        throw new Error("invalid_case_response");
      // Large full-content responses can exceed the upstream timeout. Fetch bounded
      // pages with modest concurrency, retaining progress without publishing a partial index.
      const pageSize = 500;
      scope.set("limit", String(pageSize));
      scope.set("sort_by", "video_name");
      scope.set("sort_order", "asc");
      for (let offset = 0; offset < index.total; offset += pageSize * 2) {
        const offsets = [offset, offset + pageSize]
          .filter((value) => value < index.total);
        const pages = await Promise.all(offsets.map(async (value) => {
          const query = new URLSearchParams(scope);
          query.set("offset", String(value));
          const page = await fetchJson("/api/video/all-results?" + query, authorization);
          if (!Array.isArray(page.data) || page.total !== index.total)
            throw new Error("case_data_changed_retry");
          if (page.data.length !== Math.min(pageSize, index.total - value))
            throw new Error("incomplete_case_page");
          return page.data;
        }));
        index.rows.push(...pages.flat());
      }
      index.rows = Array.from(
        new Map(index.rows.map((r) => [r.id, r])).values(),
      );
      if (index.rows.length !== index.total)
        throw new Error("case_data_changed_retry");
      // Publish actual test content first; canonical wording enriches it in the background.
      index.state = "ready";
      index.schemaVersion = 2;
      index.expires = Date.now() + ttl;
      observe({
        validation: true,
        status: 200,
        index_records: index.rows.length,
        snapshot_ready: true,
        hidden_vehicle_records: index.rows.filter((r) => isHiddenVehicle(r.brand_model)).length,
        missing_vehicle_records: index.rows.filter((r) => !hasVehicleModel(r.brand_model)).length,
        visible_vehicle_records: index.rows.filter((r) => hasVehicleModel(r.brand_model) && !isHiddenVehicle(r.brand_model)).length,
      });
      // PK's question is the server's canonical case wording, not inferred from a vehicle transcript.
      const models = [
        ...new Set(
          index.rows
            .filter((r) => !r._locked)
            .map((r) => r.brand_model)
            .filter(Boolean),
        ),
      ];
      try {
        if (models.length >= 2) {
          const definitions = new Map<string, string>();
          let start = 0;
          while (true) {
            const page = await fetchJson(
              "/api/video/pk-cases?" +
                new URLSearchParams({
                  brand_models: models.join(","),
                  offset: String(start),
                  limit: "300",
                  sort_by: "case_id",
                  sort_dir: "asc",
                }),
              authorization,
            );
            if (!Array.isArray(page.data) || typeof page.total !== "number")
              throw new Error("invalid_case_definition_response");
            for (const row of page.data)
              if (row.user_question)
                definitions.set(String(row.case_id), row.user_question);
            start += page.data.length;
            if (start >= page.total) break;
            if (!page.data.length) break;
          }
          for (const row of index.rows)
            if (!row._locked && definitions.has(String(row.case_id))) {
              row.case_definition = definitions.get(String(row.case_id));
              textCache.delete(row);
            }
        }
      } catch (e) {
        index.warning = "标准用例描述暂未加载，当前检索实际提问和对话。";
        observe({
          enrichment: true,
          status: (e as any).status || 503,
          error: (e as Error).message,
        });
      }
      index.rows = Array.from(
        new Map(index.rows.map((r) => [r.id, r])).values(),
      );
      if (index.rows.length !== index.total)
        throw new Error("case_data_changed_retry");
      index.state = "ready";
      index.schemaVersion = 2;
      index.expires = Date.now() + ttl;
      const keywords = ["天窗", "音乐", "导航", "打开 天窗"];
      const counts = Object.fromEntries(
        keywords.map((search) => [
          search,
          queryCases(index.rows, new URLSearchParams({ search, limit: "1" }))
            .total,
        ]),
      );
      observe({
        validation: true,
        status: 200,
        index_records: index.rows.length,
        keyword_counts: counts,
        checked_at: new Date().toISOString(),
      });
    } catch (e) {
      index.rows = [];
      index.state = "error";
      index.expires = Date.now() + 5_000;
      index.error = e instanceof Error ? e.message : "case_search_failed";
      observe({
        status: 503,
        error: index.error,
        checked_at: new Date().toISOString(),
      });
    }
  }
  return async function handle(req: IncomingMessage, res: ServerResponse) {
    const started = Date.now();
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (url.pathname !== "/api/cases/search") return false;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    const reply = (status: number, data: unknown) => {
      res.statusCode = status;
      res.end(JSON.stringify(data));
      return true;
    };
    if (req.method !== "GET") return reply(405, { detail: "read_only" });
    const authorization = requestAuthorization(req);
    if (!authorization) return reply(401, { detail: "unauthorized" });
    const scope = new URLSearchParams();
    for (const key of ["exclude_review", "include_failed", "status"])
      if (url.searchParams.has(key)) scope.set(key, url.searchParams.get(key)!);
    let key = "";
    try {
      const user = await fetchJson("/api/auth/me", authorization);
      if (user.must_reset_pwd)
        return reply(403, { detail: "must_reset_password" });
      key = createHash("sha256").update(JSON.stringify({
        user: String(user.id || authorization), scope: scope.toString(), role: user.role,
        membership_tier: user.membership_tier ?? null,
        data_visible_until: user.data_visible_until ?? null,
        expires_at: user.expires_at ?? null,
        is_active: user.is_active ?? true,
        permissions: user.permissions ?? null,
      })).digest("hex");
      const indexKey = key;
      let index = indexes.get(indexKey);
      if (
        index?.state === "ready" &&
        index.warning &&
        index.schemaVersion !== 2
      ) {
        index.schemaVersion = 2;
        index.expires = Math.min(index.expires, Date.now() - 1);
      }
      if (index?.state === "ready" && index.expires < Date.now()) {
        if (!index.refreshing) {
          index.refreshing = true;
          const previous = index;
          const fresh: Index = {
            rows: [],
            total: 0,
            state: "loading",
            expires: Date.now() + ttl,
          };
          void load(fresh, authorization, scope).then(() => {
            previous.refreshing = false;
            if (fresh.state === "ready") indexes.set(key, fresh);
            else previous.expires = Date.now() + 60_000;
          });
        }
      }
      if (!index || (index.state !== "ready" && index.expires < Date.now())) {
        for (const [k, v] of indexes)
          if (v.expires < Date.now()) indexes.delete(k);
        if (indexes.size >= 3) indexes.delete(indexes.keys().next().value);
        index = {
          rows: [],
          total: 0,
          state: "loading",
          expires: Date.now() + 10 * 60_000,
        };
        indexes.set(key, index);
        void load(index, authorization, scope);
      }
      if (index.state === "loading") {
        observe({
          status: 202,
          index_records: index.rows.length,
          index_total: index.total,
          checked_at: new Date().toISOString(),
        });
        return reply(202, {
          status: "indexing",
          scanned: index.rows.length,
          total: index.total,
        });
      }
      if (index.state === "error") {
        indexes.delete(key);
        return reply(503, { detail: index.error });
      }
      const result = queryCases(index.rows, url.searchParams);
      observe({
        status: 200,
        index_records: index.rows.length,
        total: result.total,
        returned: result.data.length,
        duration_ms: Date.now() - started,
        checked_at: new Date().toISOString(),
      });
      return reply(200, { ...result, warning: index.warning });
    } catch (e) {
      if ([401, 403].includes((e as any).status)) indexes.delete(key);
      observe({
        status: (e as any).status || 503,
        error: (e as Error).message,
        checked_at: new Date().toISOString(),
      });
      return reply((e as any).status || 503, { detail: (e as Error).message });
    }
  };
}
