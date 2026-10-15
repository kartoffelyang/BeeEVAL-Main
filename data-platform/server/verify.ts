/** Optional one-shot read-only release acceptance, using the caller's actual scope. */
export async function verifyRelease(
  upstream: string,
  authorization: string,
  search: any,
) {
  const log = (name: string, data: any) =>
    console.log(JSON.stringify({ event: "acceptance", name, ...data }));
  const json = async (name: string, path: string, init: any = {}) => {
    const r = await fetch(upstream + path, {
      ...init,
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(90000),
    });
    const body = await r.json().catch(() => null);
    log(name, {
      status: r.status,
      count: Array.isArray(body) ? body.length : body?.total,
    });
    return r.ok ? body : null;
  };
  try {
    const user = await json("account", "/api/auth/me");
    if (!user) return;
    const vehicles = await json("vehicles", "/api/aggregation/vehicles");
    if (["admin", "analyst"].includes(user.role))
      await json("review-read", "/api/video/review-triage?limit=1");
    if (user.role === "admin") await json("accounts-read", "/api/admin/users");
    const cache = await json("video-cache", "/api/nas/cache/stats");
    if (cache)
      log("video-cache-state", {
        proxy_enabled: cache.proxy?.enabled,
        proxy_files: cache.proxy?.files,
        warming: cache.proxy?.warming,
      });
    const records = await json(
      "records",
      "/api/video/all-results?limit=1&exclude_review=true",
    );
    const v = vehicles?.find((v: any) => v.has_cache) || vehicles?.[0];
    if (v) {
      const params = new URLSearchParams({
        brand_model: v.brand_model,
        ...(v.system_version ? { system_version: v.system_version } : {}),
      });
      await json("scores", "/api/aggregation/vehicle?" + params);
      const baseline = await json(
        "acceptance-baseline",
        "/api/aggregation/vehicle/acceptance-completion?" + params,
      );
      const domain = baseline?.by_domain?.[0]?.function_domain || "车控域";
      params.set("function_domain", domain);
      const detail = await json(
        "task-comparison",
        "/api/aggregation/vehicle/acceptance-task-detail?" + params,
      );
      const group = detail?.by_grade?.find((g: any) => g.task_details?.length);
      if (group) {
        params.set("task_detail", group.task_details[0].task_detail);
        params.set("acceptance_tag", group.grade);
        await json(
          "task-video-cards",
          "/api/aggregation/vehicle/task-detail-cases?" + params,
        );
      }
    }
    const path = records?.data?.find((r: any) => !r._locked && r.metadata?.path)
      ?.metadata.path;
    if (path) {
      const signed = await json("video-sign", "/api/video/stream/sign", {
        method: "POST",
        body: JSON.stringify({
          path,
          source: path.startsWith("/") ? "nas" : "local",
          quality: "proxy",
        }),
      });
      if (signed)
        log("video-quality", {
          quality: signed.quality,
          proxy_ready: signed.proxy_ready,
        });
      if (signed?.url) {
        const url = new URL(signed.url, upstream);
        const r = await fetch(url, {
          headers: { Range: "bytes=0-1023" },
          signal: AbortSignal.timeout(90000),
        });
        const reader = r.body?.getReader();
        const first = await reader?.read();
        await reader?.cancel();
        log("video-stream", {
          status: r.status,
          type: r.headers.get("content-type"),
          bytes: first?.value?.length || 0,
          range: !!r.headers.get("content-range"),
        });
        url.searchParams.set("token", "invalid-release-check");
        const invalid = await fetch(url, {
          headers: { Range: "bytes=0-1" },
          signal: AbortSignal.timeout(15000),
        });
        await invalid.body?.cancel();
        log("invalid-video-token", { status: invalid.status });
      }
    } else log("video-stream", { status: "no-playable-record" });
    for (let i = 0; i < 180; i++) {
      let status = 0;
      await search(
        {
          url: "/api/cases/search?exclude_review=true&search=%E5%A4%A9%E7%AA%97",
          method: "GET",
          headers: { authorization },
        } as any,
        {
          setHeader() {},
          set statusCode(v: number) {
            status = v;
          },
          end(body: string) {
            const j = JSON.parse(body);
            if (status !== 202)
              log("keyword-search", {
                status,
                total: j.total,
                returned: j.data?.length,
              });
          },
        } as any,
      );
      if (status !== 202) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    log("complete", { ok: true });
  } catch (e) {
    log("incomplete", { error: e instanceof Error ? e.name : "error" });
  }
}
