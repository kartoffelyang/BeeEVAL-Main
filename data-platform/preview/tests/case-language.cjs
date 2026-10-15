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
global.__caseAPI = (params, options) =>
  new Promise((resolve, reject) =>
    requests.push({ params, options, resolve, reject }),
  );
const result = (id, text) => ({
  data: [
    {
      id,
      case_id: id,
      brand_model: "大众ID.ERA 9X", function_domain: "车控域",
      system_version: "1",
      metadata: { user_question: text, response_quality_score: 4 },
    },
  ],
  total: 1,
});
(async () => {
  const esbuild = require(resolve("esbuild"));
  const output = path.join(root, "node_modules/.tmp/case-language-test.cjs");
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
              `export const getAllResults=(p,o)=>globalThis.__caseAPI(p,o);export const getCaseContentSearch=getAllResults;export const getFilterOptions=()=>Promise.resolve({function_domains:[]});export const listVehiclesForAggregation=()=>Promise.resolve([]);export const getMetricsMap=()=>Promise.resolve({});export const getDomainsMap=()=>Promise.resolve({车控域:"Vehicle Control"});export const getTaskDetailMap=()=>Promise.resolve({});export const getBrandMap=()=>Promise.resolve({大众:"Volkswagen",小米:"Xiaomi",问界:"AITO",理想:"Li Auto",蔚来:"NIO",极氪:"Zeekr",萤火虫:"firefly"});`,
          }));
          b.onLoad({ filter: /LanguageContext\.tsx$/ }, () => ({
            loader: "ts",
            contents: 'export const useLanguage=()=>({language:globalThis.__language||"en"});',
          }));
          b.onLoad({ filter: /ComparisonContext\.tsx$/ }, () => ({
            loader: "ts",
            contents:
              `const setVehicles=()=>{};export const useComparison=()=>({vehicles:[{brand_model:"大众ID.ERA 9X",system_version:"1"}],setVehicles});`,
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
  const app=createRoot(document.getElementById("root"));
  const render=()=>app.render(React.createElement(MemoryRouter,{initialEntries:["/"]},React.createElement(CaseSearch)));
  await act(async()=>render());
  await act(async()=>requests.at(-1).resolve(result("1","打开天窗")));
  assert.equal(document.querySelector(".case-record strong").textContent,"Volkswagen ID.ERA 9X");
  assert.ok(document.querySelector(".case-group").textContent.includes("Vehicle Control"));
  const option=[...document.querySelectorAll("option")].find(o=>o.value==="大众ID.ERA 9X");
  assert.ok(option);assert.equal(option.textContent,"Volkswagen ID.ERA 9X");
  const select=option.closest("select");
  await act(async()=>Simulate.change(select,{target:{value:"大众ID.ERA 9X"}}));
  assert.equal(requests.at(-1).params.brand_model,"大众ID.ERA 9X");
  await act(async()=>requests.at(-1).resolve(result("2","打开天窗")));
  assert.ok(document.querySelector(".case-active-filters").textContent.includes("Volkswagen ID.ERA 9X"));
  global.__language="zh";await act(async()=>render());
  assert.equal(document.querySelector(".case-record strong").textContent,"大众ID.ERA 9X");
  assert.equal([...document.querySelectorAll("option")].find(o=>o.value==="大众ID.ERA 9X").textContent,"大众ID.ERA 9X");
  await act(async()=>app.unmount());
  console.log("PASS: English model/domain labels, dropdowns and filter chips; original model query values preserved; Chinese switching restored.");
})().catch(e=>{console.error(e);process.exit(1)});
