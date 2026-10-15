const path = require("node:path"),
  assert = require("node:assert/strict");
const root = process.cwd();
const resolve = (m) => require.resolve(m, { paths: [root] });
const { JSDOM } = require(resolve("jsdom"));
const dom = new JSDOM(
  '<!doctype html><html><body><form id="f"><div id="root"></div></form><button id="outside">outside</button></body></html>',
  { url: "http://localhost/" },
);
Object.assign(global, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Event: dom.window.Event,
  KeyboardEvent: dom.window.KeyboardEvent,
  MouseEvent: dom.window.MouseEvent,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(global, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
Element.prototype.scrollIntoView = function () {};
HTMLElement.prototype.getBoundingClientRect = function () {
  return {
    left: 880,
    right: 1060,
    top: 600,
    bottom: 640,
    width: 180,
    height: 40,
  };
};
const React = require(resolve("react"));
const { createRoot } = require(resolve("react-dom/client"));
const { act } = React;
const { Simulate } = require(resolve("react-dom/test-utils"));
const esbuild = require(resolve("esbuild"));
(async () => {
  const output = path.join(root, "node_modules/.tmp/light-select-test.cjs");
  await esbuild.build({
    entryPoints: [path.join(root, "src/components/LightSelect.tsx")],
    outfile: output,
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["react", "react-dom"],
    loader: { ".css": "empty" },
    plugins: [
      {
        name: "isolate-language",
        setup(b) {
          b.onLoad({ filter: /LanguageContext\.tsx$/ }, () => ({
            contents: 'export const useLanguage=()=>({language:"zh"});',
            loader: "tsx",
          }));
        },
      },
    ],
  });
  const LightSelect = require(output).default;
  let changed = null;
  function Harness({ disabled = false }) {
    const [value, setValue] = React.useState("0");
    return React.createElement(
      LightSelect,
      {
        value,
        disabled,
        name: "model",
        "aria-label": "车型",
        onChange: (e) => {
          changed = e.target.value;
          setValue(e.target.value);
        },
      },
      Array.from({ length: 10 }, (_, i) =>
        React.createElement(
          "option",
          { key: i, value: String(i), disabled: i === 3 },
          "车型 " + i,
        ),
      ),
    );
  }
  const tree = createRoot(document.getElementById("root"));
  await act(() => tree.render(React.createElement(Harness)));
  const trigger = () => document.querySelector(".be-select-trigger");
  assert.equal(trigger().textContent, "车型 0");
  await act(() => Simulate.click(trigger()));
  assert.equal(document.querySelectorAll("[role=option]").length, 10);
  assert.equal(trigger().getAttribute("aria-expanded"), "true");
  const menu = document.querySelector(".be-select-panel");
  assert.ok(parseFloat(menu.style.left) >= 0);
  assert.equal(menu.style.transform, "translateY(-100%)");
  assert.ok(parseFloat(menu.style.left) + parseFloat(menu.style.width) <= 1024);
  const input = document.querySelector(".be-select-search input");
  assert.equal(document.activeElement, input);
  await act(() => Simulate.change(input, { target: { value: "车型 7" } }));
  assert.equal(document.querySelectorAll("[role=option]").length, 1);
  await act(() => Simulate.keyDown(input, { key: "Enter" }));
  assert.equal(changed, "7");
  assert.equal(trigger().textContent, "车型 7");
  assert.equal(document.querySelector(".be-select-panel"), null);
  assert.equal(document.activeElement, trigger());
  assert.equal(
    new dom.window.FormData(document.getElementById("f")).get("model"),
    "7",
  );
  await act(() => Simulate.keyDown(trigger(), { key: "ArrowDown" }));
  await act(() =>
    Simulate.click(document.querySelectorAll("[role=option]")[3]),
  );
  assert.equal(changed, "7");
  assert.ok(document.querySelector(".be-select-panel"));
  await act(() =>
    Simulate.keyDown(document.querySelector(".be-select-search input"), {
      key: "Escape",
    }),
  );
  assert.equal(document.querySelector(".be-select-panel"), null);
  await act(() => Simulate.click(trigger()));
  await act(() =>
    document
      .getElementById("outside")
      .dispatchEvent(
        new dom.window.MouseEvent("pointerdown", { bubbles: true }),
      ),
  );
  assert.equal(document.querySelector(".be-select-panel"), null);
  await act(() =>
    tree.render(React.createElement(Harness, { disabled: true })),
  );
  assert.equal(trigger().disabled, true);
  await act(() => tree.unmount());
  const dialog = document.createElement("dialog");
  document.body.append(dialog);
  const container = document.createElement("div");
  dialog.append(container);
  const droot = createRoot(container);
  await act(() =>
    droot.render(
      React.createElement(
        LightSelect,
        { value: "a", onChange: () => {}, "aria-label": "test" },
        React.createElement(
          "optgroup",
          { label: "车型组" },
          React.createElement("option", { value: "a" }, "蔚来"),
          React.createElement("option", { value: "b" }, "小米"),
        ),
      ),
    ),
  );
  await act(() => Simulate.click(dialog.querySelector(".be-select-trigger")));
  assert.equal(
    document.querySelector(".be-select-panel").parentElement,
    dialog,
  );
  assert.equal(
    document.querySelector(".be-select-group").textContent,
    "车型组",
  );
  assert.equal(document.activeElement.getAttribute("role"), "listbox");
  await act(() => droot.unmount());
  console.log(
    "PASS: controlled changes, native form value, search, keyboard, disabled option/control, Escape, outside close, viewport placement, focus return, dialog portal, optgroups.",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
