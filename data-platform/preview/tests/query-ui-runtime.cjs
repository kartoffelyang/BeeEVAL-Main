const path = require("node:path"),
  assert = require("node:assert/strict");
const root = process.cwd();
const resolve = (m) => require.resolve(m, { paths: [root] });
const { JSDOM } = require(resolve("jsdom"));
const dom = new JSDOM(
  '<div class="workspace-scroll"><div id="root"></div></div>',
  { url: "http://localhost/?q=天窗" },
);
Object.assign(global, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Event: dom.window.Event,
  sessionStorage: dom.window.sessionStorage,
  localStorage: dom.window.localStorage,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(global, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
Element.prototype.scrollIntoView = function () {};
const React = require(resolve("react"));
const { act } = React;
const { createRoot } = require(resolve("react-dom/client"));
const { Simulate } = require(resolve("react-dom/test-utils"));
const { MemoryRouter } = require(resolve("react-router-dom"));
const requests = [];
const facetRequests = [];
global.__facetAPI = () => new Promise(resolve => facetRequests.push(resolve));
global.__caseAPI = (params, options) =>
  new Promise((resolve, reject) =>
    requests.push({ params, options, resolve, reject }),
  );
const result = (id, text) => ({
  data: [
    {
      id,
      case_id: id,
      brand_model: "车",
      system_version: "1",
      metadata: { user_question: text, response_quality_score: 4 },
    },
  ],
  total: 1,
  facets: {task_types:["天窗天幕控制", "车窗开合控制"], difficulties:["基础验收", "进阶验收"]},
});
(async () => {
  const esbuild = require(resolve("esbuild"));
  const output = path.join(root, "node_modules/.tmp/query-ui-test.cjs");
  await esbuild.build({
    entryPoints: ["src/pages/CaseSearch.tsx"],
    outfile: output,
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["react", "react-dom", "react-router-dom"],
    loader: { ".css": "empty" },
    plugins: [
      {
        name: "isolated-query-context",
        setup(b) {
          b.onLoad({ filter: /\/api\.ts$/ }, () => ({
            loader: "ts",
            contents:
              "export const getAllResults=(p,o)=>globalThis.__caseAPI(p,o);export const getCaseContentSearch=getAllResults;export const getCaseSearchFacets=()=>globalThis.__facetAPI();export const getFilterOptions=()=>Promise.resolve({function_domains:[]});export const listVehiclesForAggregation=()=>Promise.resolve([]);export const getMetricsMap=()=>Promise.resolve({});export const getDomainsMap=()=>Promise.resolve({});export const getTaskDetailMap=()=>Promise.resolve({});export const getBrandMap=()=>Promise.resolve({});",
          }));
          b.onLoad({ filter: /LanguageContext\.tsx$/ }, () => ({
            loader: "ts",
            contents: 'export const useLanguage=()=>({language:"zh"});',
          }));
          b.onLoad({ filter: /ComparisonContext\.tsx$/ }, () => ({
            loader: "ts",
            contents:
              "const setVehicles=()=>{};export const useComparison=()=>({vehicles:[],setVehicles});",
          }));
          b.onLoad(
            { filter: /(ResultDetailModal|VideoPlayerModal)\.tsx$/ },
            () => ({ loader: "ts", contents: "export default ()=>null;" }),
          );
        },
      },
    ],
  });
  const CaseSearch = require(output).default;
  sessionStorage.setItem(
    "beeeval.case-query.v1",
    JSON.stringify({ query: "q=%E5%A4%A9%E7%AA%97", scroll: 320 }),
  );
  const app = createRoot(document.getElementById("root"));
  await act(async () =>
    app.render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ["/?q=天窗"] },
        React.createElement(CaseSearch),
      ),
    ),
  );
  await act(async () => requests.at(-1).resolve(result("1", "打开天窗")));
  assert.ok(document.querySelector(".case-group"));
  assert.ok(facetRequests.length, "Facets load separately after visible rows");
  assert.ok(!document.querySelector(".case-result-heading").textContent.includes("正在查找"));
  await act(async () => facetRequests.at(-1)(result("1", "打开天窗").facets));
  if (process.env.BEEEVAL_PREVIEW_HTML) {
    const fs = require("node:fs");
    const css = fs.readdirSync("dist/assets").find(name => name.endsWith(".css"));
    fs.writeFileSync(process.env.BEEEVAL_PREVIEW_HTML, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="file://${root}/dist/assets/${css}"></head><body style="background:#f7f7f3">${document.querySelector("#root").innerHTML}</body></html>`);
  }
  const scroll = document.querySelector(".workspace-scroll");
  scroll.scrollTop = 777;
  const input = () => document.querySelector(".case-search-box input");
  const form = () => document.querySelector(".case-search-box");
  async function submit(text) {
    await act(async () =>
      Simulate.change(input(), { target: { value: text } }),
    );
    await act(async () => Simulate.submit(form()));
  }
  await submit("音乐");
  assert.equal(
    document.querySelector(".case-group h3").textContent,
    "打开天窗",
  );
  assert.equal(scroll.scrollTop, 777);
  await act(async () => requests.at(-1).resolve(result("2", "播放音乐")));
  assert.equal(
    document.querySelector(".case-group h3").textContent,
    "播放音乐",
  );
  assert.equal(scroll.scrollTop, 777);
  const before = requests.length;
  await act(async () => Simulate.submit(form()));
  assert.equal(requests.length, before + 1);
  await act(async () =>
    requests.at(-1).reject(new Error("temporary upstream error")),
  );
  assert.equal(
    document.querySelector(".case-group h3").textContent,
    "播放音乐",
  );
  assert.ok(
    document
      .querySelector("[role=alert]")
      .textContent.includes("保留上次成功结果"),
  );
  await submit("导航");
  const old = requests.at(-1);
  await submit("天窗");
  assert.equal(old.options.signal.aborted, true);
  await act(async () => old.resolve(result("3", "过期结果")));
  assert.notEqual(
    document.querySelector(".case-group h3").textContent,
    "过期结果",
  );
  await act(async () => requests.at(-1).resolve(result("4", "新的天窗结果")));
  assert.equal(
    document.querySelector(".case-group h3").textContent,
    "新的天窗结果",
  );
  assert.equal(scroll.scrollTop, 777);
  assert.ok(document.querySelector('select[aria-label="任务类型"]'));
  assert.ok(document.querySelector('select[aria-label="难度"]'));
  await act(async () => Simulate.change(document.querySelector('select[aria-label="任务类型"]'), {target:{value:"天窗天幕控制"}}));
  assert.equal(requests.at(-1).params.task_detail,"天窗天幕控制");
  assert.equal(requests.at(-1).params.offset,0);
  await act(async () => requests.at(-1).resolve(result("5", "任务筛选结果")));
  await act(async () => Simulate.change(document.querySelector('select[aria-label="难度"]'), {target:{value:"进阶验收"}}));
  assert.equal(requests.at(-1).params.acceptance_tag,"进阶验收");
  assert.equal(requests.at(-1).params.task_detail,"天窗天幕控制");
  await act(async () => requests.at(-1).resolve(result("6", "难度筛选结果")));
  const domainSelect=[...document.querySelectorAll('select')].find(el=>el.closest('label')?.textContent.includes('功能域'));
  await act(async () => Simulate.change(domainSelect,{target:{value:"出行域"}}));
  assert.equal(requests.at(-1).params.task_detail,undefined);
  assert.equal(requests.at(-1).params.acceptance_tag,undefined);
  await act(async () => app.unmount());
  console.log(
    "PASS: visible results survive loading/errors, same-query retry works, new searches cancel stale requests, late results cannot overwrite current query, scroll remains stable.",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
