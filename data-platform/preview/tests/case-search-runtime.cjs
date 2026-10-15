const path = require("node:path"),
  assert = require("node:assert/strict");
const root = process.cwd();
const esbuild = require(require.resolve("esbuild", { paths: [root] }));
(async () => {
  const output = path.join(root, "node_modules/.tmp/case-search-test.cjs");
  await esbuild.build({
    entryPoints: ["local-server/case-search.ts"],
    outfile: output,
    bundle: true,
    platform: "node",
    format: "cjs",
  });
  const { queryCases, caseContent, createCaseSearch } = require(output);
  const rows = [
    {
      id: "a",
      case_id: "1001",
      brand_model: "车型甲",
      system_version: "1",
      function_domain: "车控域",
      transcript: null,
      metadata: { user_question: "打开天窗", response_quality_score: 4 },
    },
    {
      id: "b",
      case_id: "1002",
      brand_model: "车型乙",
      system_version: "2",
      function_domain: "娱乐域",
      metadata: {
        dialogue: [{ user: "播放音乐", system: "好的" }],
        response_quality_score: 2,
      },
    },
    {
      id: "c",
      case_id: "1003",
      brand_model: "车型甲",
      system_version: "1",
      labels: { content: "导航到附近的加油站" },
      metadata: {},
    },
    {
      id: "d",
      case_id: "1004",
      brand_model: "车型乙",
      system_version: "1",
      metadata: {
        task_detail: "天窗开合任务",
        system_response: "天窗暂时无法打开",
      },
    },
    {
      id: "locked",
      case_id: "1005",
      _locked: true,
      metadata: { user_question: "打开天窗" },
    },
  ];
  rows.push({
    id: "definition",
    brand_model: "车型甲",
    case_id: "2000",
    case_definition: "将天幕打开",
    metadata: {},
  });
  const search = (search, params = {}) =>
    queryCases(rows, new URLSearchParams({ search, ...params }));
  assert.equal(search("天幕").total, 1);
  assert.equal(search("天窗").total, 2);
  assert.equal(search("打开 天窗").total, 2);
  assert.equal(search("音乐").total, 1);
  assert.equal(search("导航").total, 1);
  assert.equal(
    search("天窗", { brand_model: "车型甲", system_version: "1" }).total,
    1,
  );
  assert.equal(search("天窗", { system_version: "unknown" }).total, 0);
  assert.equal(search("音乐", { max_score: "2.99" }).total, 1);
  assert.equal(search("天窗", { max_score: "2.99" }).total, 0);
  assert.equal(search("天窗", { offset: "1", limit: "1" }).data[0].id, "d");
  assert.equal(caseContent(rows[4]), "");
  const invalidModels = [undefined, null, "", "   ", "车型未提供", "—", "null", "unknown"];
  const invalidRows = invalidModels.map((brand_model, i) => ({id: "missing-" + i, brand_model, case_id:"1001", metadata:{user_question:"打开天窗", response_quality_score:5}}));
  for (const params of [{}, {search:"天窗"}, {case_id:"1001"}, {min_score:"4"}]) {
    const result = queryCases([...invalidRows, rows[0]], new URLSearchParams(params));
    assert.equal(result.total, 1);
    assert.equal(result.data[0].id, "a");
  }
  assert.equal(queryCases([...invalidRows, rows[0]], new URLSearchParams({offset:"1"})).data.length, 0);
  assert.equal(search("车型甲").total, 0); // names/domains cannot masquerade as matching case content
  let visibleUntil = null;
  let role = "admin",
    valid = true,
    calls = 0;
  const full = Array.from({ length: 311 }, (_, i) => ({
    id: String(i),
    case_id: String(i).padStart(4, "0"),
    brand_model: "车",
    created_at: String(i),
    metadata: { user_question: i === 310 ? "打开天窗" : "其他任务" },
  }));
  const saved = global.fetch;
  global.fetch = async (url) => {
    const u = new URL(url);
    if (!valid) return { ok: false, status: 401 };
    if (u.pathname === "/api/auth/me")
      return { ok: true, json: async () => ({ id: 1, role, data_visible_until: visibleUntil }) };
    calls++;
    const visible = visibleUntil ? full.slice(0,100) : full;
    const offset = Number(u.searchParams.get("offset")),
      limit = Number(u.searchParams.get("limit"));
    assert.ok(limit <= 200, "full-content reads must stay bounded");
    return {
      ok: true,
      json: async () => ({
        data: visible
          .slice(offset, offset + limit)
          .map((r) =>
            role === "viewer" ? { ...r, _locked: true, metadata: {} } : r,
          ),
        total: visible.length,
      }),
    };
  };
  const handler = createCaseSearch("https://backend.invalid", () => {});
  async function request(auth = "Bearer test", cookie = undefined) {
    let status, body;
    const res = {
      setHeader() {},
      set statusCode(v) {
        status = v;
      },
      end(v) {
        body = JSON.parse(v);
      },
    };
    await handler(
      {
        url: "/api/cases/search?search=天窗&exclude_review=true",
        method: "GET",
        headers: { ...(auth ? { authorization: auth } : {}), ...(cookie ? {cookie} : {}) },
      },
      res,
    );
    return { status, body };
  }
  assert.equal((await request("")).status, 401);
  let r = await request();
  assert.equal(r.status, 202);
  for (let i = 0; i < 20 && r.status === 202; i++) {
    await new Promise((resolve) => setImmediate(resolve));
    r = await request();
  }
  assert.equal(r.status, 200);
  assert.equal(r.body.total, 1);
  assert.equal(r.body.data[0].id, "310");
  assert.equal(calls, 3);
  await request();
  assert.equal(calls, 3); // complete index reused, not a first-page scan
  role = "viewer";
  r = await request();
  for (let i = 0; i < 20 && r.status === 202; i++) {
    await new Promise((resolve) => setImmediate(resolve));
    r = await request();
  }
  assert.equal(r.body.total, 0);
  // An optional definition endpoint failure must not destroy successful record retrieval.
  role = "admin";
  const baseFetch = global.fetch;
  global.fetch = async (url, ...args) =>
    new URL(url).pathname === "/api/video/pk-cases"
      ? { ok: false, status: 503 }
      : baseFetch(url, ...args);
  const twoModels = full.map((r, i) => ({
    ...r,
    brand_model: i % 2 ? "车型甲" : "车型乙",
  }));
  const rawFetch = global.fetch;
  global.fetch = async (url, ...args) => {
    if (new URL(url).pathname === "/api/video/all-results") {
      calls++;
      const u = new URL(url);
      return {
        ok: true,
        json: async () => ({
          data: twoModels.slice(
            Number(u.searchParams.get("offset")),
            Number(u.searchParams.get("offset")) +
              Number(u.searchParams.get("limit")),
          ),
          total: twoModels.length,
        }),
      };
    }
    return rawFetch(url, ...args);
  };
  const extra = createCaseSearch(
    "https://enrichment-failure.invalid",
    () => {},
  );
  async function extraRequest() {
    let status, body;
    await extra(
      {
        url: "/api/cases/search?search=天窗&exclude_review=true",
        method: "GET",
        headers: { authorization: "Bearer other" },
      },
      {
        setHeader() {},
        set statusCode(v) {
          status = v;
        },
        end(v) {
          body = JSON.parse(v);
        },
      },
    );
    return { status, body };
  }
  let partial = await extraRequest();
  for (let i = 0; i < 20 && partial.status === 202; i++) {
    await new Promise((resolve) => setImmediate(resolve));
    partial = await extraRequest();
  }
  assert.equal(partial.status, 200);
  assert.equal(partial.body.total, 1);
  assert.ok(partial.body.warning);
  // Expired caches return the last valid result while a failed refresh runs.
  for (const index of global.__beeevalCaseIndexes
    .get("https://enrichment-failure.invalid")
    .values())
    index.expires = Date.now() - 1;
  global.fetch = async (url, ...args) =>
    new URL(url).pathname === "/api/video/all-results"
      ? { ok: false, status: 503 }
      : rawFetch(url, ...args);
  assert.equal((await extraRequest()).body.total, 1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await extraRequest()).status, 200);
  // Slow canonical enrichment cannot delay actual-content search readiness.
  let finishDefinitions;
  const pendingDefinitions = new Promise((resolve) => { finishDefinitions = resolve; });
  global.fetch = async (url, ...args) => {
    const u = new URL(url);
    if (u.pathname === "/api/video/pk-cases") return pendingDefinitions;
    if (u.pathname === "/api/video/all-results") return {ok:true,json:async()=>({data:twoModels.slice(Number(u.searchParams.get("offset")),Number(u.searchParams.get("offset"))+Number(u.searchParams.get("limit"))).map((r)=>({...r})),total:twoModels.length})};
    return baseFetch(url,...args);
  };
  const delayed = createCaseSearch("https://slow-definitions.invalid",()=>{});
  const delayedRequest = async (search) => {
    let status,body;
    await delayed({url:"/api/cases/search?exclude_review=true&search="+encodeURIComponent(search),method:"GET",headers:{authorization:"Bearer isolated-mock"}}, {setHeader(){},set statusCode(v){status=v},end(v){body=JSON.parse(v)}});
    return {status,body};
  };
  let ready = await delayedRequest("天窗");
  for(let i=0;i<20&&ready.status===202;i++){await new Promise((resolve)=>setImmediate(resolve));ready=await delayedRequest("天窗");}
  assert.equal(ready.status,200);
  assert.equal(ready.body.total,1);
  assert.equal((await delayedRequest("新增标准词")).body.total,0);
  finishDefinitions({ok:true,json:async()=>({data:[{case_id:"0310",user_question:"新增标准词"}],total:1})});
  await new Promise((resolve)=>setImmediate(resolve));
  assert.equal((await delayedRequest("新增标准词")).body.total,1);
  global.fetch = baseFetch;
  // Original HttpOnly sessions use the same account scope; no browser token is required.
  assert.equal((await request("", "beeeval_session=mock-cookie")).body.total,1);
  assert.equal((await request("", "beeeval_session=mock-cookie; beeeval_signed_out=1")).status,401);
  visibleUntil="2026-01-01T00:00:00Z";
  let reduced=await request("", "beeeval_session=mock-cookie");
  for(let i=0;i<20&&reduced.status===202;i++){await new Promise(resolve=>setImmediate(resolve));reduced=await request("", "beeeval_session=mock-cookie");}
  assert.equal(reduced.status,200);assert.equal(reduced.body.total,0);
  valid = false;
  assert.equal((await request()).status, 401);
  global.fetch = saved;
  console.log(
    "PASS: question/answer/dialogue/task/label search, multiple terms, exact model/version, score and pagination, locked-data exclusion, complete snapshot indexing, cache reuse, role changes and auth revocation.",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
