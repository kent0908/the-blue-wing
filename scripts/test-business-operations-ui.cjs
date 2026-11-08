/* Exercise the actual asset and billing controls with local React/API fixtures. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
const jsxRuntime = { jsx, jsxs: jsx, Fragment: Symbol("Fragment") };
const css = { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
const elements = (node) => node == null || typeof node === "boolean" ? []
  : Array.isArray(node) ? node.flatMap(elements)
  : typeof node === "object" ? [node, ...elements(node.props?.children)] : [];
const text = (node) => node == null || typeof node === "boolean" ? ""
  : Array.isArray(node) ? node.map(text).join("")
  : typeof node === "object" ? text(node.props?.children) : String(node);
const button = (tree, label) => {
  const match = elements(tree).find(node => node.type === "button" && text(node) === label);
  assert.ok(match, `Missing button: ${label}`);
  return match.props;
};
const response = (body, ok = true) => ({ ok, json: async () => body });
const flush = () => new Promise(resolve => setImmediate(resolve));

function load(file, mocks = {}, globals = {}) {
  const loaded = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  new Function("require", "module", "exports", ...Object.keys(globals), output)(name => {
    if (name.endsWith(".module.css")) return css;
    if (name === "react/jsx-runtime") return jsxRuntime;
    assert.ok(Object.hasOwn(mocks, name), `Unmocked import ${name}`);
    return mocks[name];
  }, loaded, loaded.exports, ...Object.values(globals));
  return loaded.exports;
}

const { businessAssetsCopy, businessAssetsError } = load("lib/i18n/businessAssets.ts");
const { businessOperationsCopy } = load("lib/i18n/businessOperations.ts");
const assetsCopy = businessAssetsCopy("en");
const usageCopy = businessOperationsCopy("en");
function hooks() {
  let cursor = 0, effects = [];
  const entries = [];
  const next = make => {
    const index = cursor++;
    if (!Object.hasOwn(entries, index)) entries[index] = make();
    return entries[index];
  };
  return {
    react: {
      useState: initial => {
        const state = next(() => ({ value: typeof initial === "function" ? initial() : initial }));
        return [state.value, value => { state.value = typeof value === "function" ? value(state.value) : value; }];
      },
      useRef: initial => next(() => ({ current: initial })),
      useCallback: fn => next(() => fn),
      useEffect: fn => next(() => effects.push(fn)),
    },
    render: (Component, props) => { cursor = 0; return Component(props); },
    mount: () => { effects.forEach(run => run()); effects = []; },
  };
}

function assetFixture({ completeStatus = "unknown", failInitialize = false } = {}) {
  const h = hooks(), requests = [], catalog = [], blobs = [];
  let uuid = 0;
  const configs = { directUpload: true, types: { "image/png": { maxBytes: 500, type: "image", ext: "png" } }, uploads: [] };
  const asset = (id, name) => ({ id, name, type: "image", status: "active" });
  const assets = [asset("one", "Copper bowl"), asset("two", "Blue vase")];
  let calls = 0;
  const { default: Component } = load("components/business/BusinessAssets.tsx", {
    react: h.react,
    "next/image": function FixtureImage() {},
    "@vercel/blob/client": { upload: async (url, file) => { blobs.push(file.name); assert.ok(url.startsWith("business/")); } },
    "@/lib/i18n/client": { useLocale: () => "en" },
    "@/lib/i18n/businessAssets": { businessAssetsCopy, businessAssetsError },
  }, {
    crypto: { randomUUID: () => `client-${++uuid}` },
    fetch: async (url, init) => {
      if (url === "/api/business/provider-assets/upload") {
        if (init.method !== "POST") return response(configs);
        const body = JSON.parse(init.body);
        requests.push(body);
        if (body.action === "initialize") {
          if (failInitialize && calls++ === 0) throw new Error("connection lost");
          return response({ pathname: "business/fixture", upload: { id: body.clientRequestId, name: body.name, type: "image", status: "created" } });
        }
        assert.equal(body.action, "complete");
        return response({ upload: { id: body.uploadId, name: requests.find(call => call.clientRequestId === body.uploadId).name, type: "image", status: completeStatus, storageReady: true } });
      }
      assert.ok(url.startsWith("/api/business/provider-assets?"), "Only business asset APIs");
      const query = new URL(url, "https://fixture.invalid").searchParams;
      catalog.push(query);
      const name = query.get("name")?.toLowerCase() ?? "";
      return response({ assets: assets.filter(asset => asset.name.toLowerCase().includes(name)), pagination: { totalPages: 1 } });
    },
  });
  const render = () => h.render(Component, {});
  render(); h.mount();
  const select = names => {
    const input = elements(render()).find(node => node.type === "input" && node.props.type === "file");
    assert.equal(input.props.hidden, true);
    const target = { value: "fixture", files: names.map(name => new File(["png-fixture"], name, { type: "image/png" })) };
    input.props.onChange({ target });
    assert.equal(target.value, "", "The same file can be selected again after error");
    elements(render()).find(node => node.type === "input" && node.props.type === "checkbox").props.onChange({ target: { checked: true } });
  };
  return { render, select, requests, catalog, blobs };
}

async function run() {
  const partial = assetFixture();
  await flush();
  assert.equal(button(partial.render(), assetsCopy.choose).disabled, false);
  partial.select(["first.png", "untouched.png"]);
  const start = button(partial.render(), "Upload 2 selected");
  start.onClick(); start.onClick();
  await flush();
  assert.deepEqual(partial.requests.map(call => call.action), ["initialize", "complete"]);
  assert.deepEqual(partial.blobs, ["first.png"]);
  assert.ok(text(partial.render()).includes(assetsCopy.uncertain));
  assert.ok(text(partial.render()).includes("untouched.png"));
  assert.equal(button(partial.render(), "Upload 1 selected").disabled, true, "Untouched assets stay queued; recovering an uncertain record is separate");
  console.log("PASS assets: one direct picker, duplicate-click guard, partial upload preserves untouched files");

  const retry = assetFixture({ failInitialize: true, completeStatus: "processing" });
  await flush(); retry.select(["retry.png"]);
  button(retry.render(), "Upload 1 selected").onClick(); await flush();
  assert.equal(button(retry.render(), "Upload 1 selected").disabled, false);
  button(retry.render(), "Upload 1 selected").onClick(); await flush();
  assert.equal(retry.requests[0].clientRequestId, retry.requests[1].clientRequestId, "Retry uses the original durable upload request ID");
  assert.deepEqual(retry.blobs, ["retry.png"]);
  assert.ok(text(retry.render()).includes(assetsCopy.uploadFinished));
  console.log("PASS assets: lost initialization response can retry safely with the same request ID");

  const search = assetFixture(); await flush();
  const searchInput = elements(search.render()).find(node => node.props.type === "search");
  searchInput.props.onChange({ target: { value: "vase" } });
  assert.ok(text(search.render()).includes("Copper bowl"), "Typing does not replace the result list");
  elements(search.render()).find(node => node.type === "form").props.onSubmit({ preventDefault() {} });
  await flush();
  assert.ok(!text(search.render()).includes("Copper bowl"));
  assert.ok(text(search.render()).includes("Blue vase"));
  assert.equal(search.catalog.at(-1).get("name"), "vase");
  console.log("PASS assets: search commits only on submit");

  const usage = hooks(), calls = [], exports = [], clicks = [];
  const row = { id: "job", providerRequestId: "request", kind: "image", model: "  =FORMULA()", status: "completed", createdAt: "2026-11-08T01:00:00Z", durationMs: 5000, billingStatus: "pending" };
  const report = { generations: [row], models: ["sample"], range: { from: "2026-11-01", to: "2026-11-08", timezone: "Asia/Taipei" }, pagination: { page: 1, total: 51, totalPages: 2, hasMore: true }, stats: { requests: 51, completed: 51, failed: 0, pending: 0, matchedCost: null, currency: "USD", unmatchedCount: 51 } };
  const ReceiptMarker = function ReceiptMarker() {};
  const { default: Usage } = load("components/business/BusinessUsage.tsx", {
    react: usage.react,
    "@/lib/i18n/client": { useLocale: () => "en" },
    "@/lib/i18n/business": { businessCopy: () => ({ completed: "Completed", failed: "Failed", unknown: "Unknown", processing: "Processing", submitting: "Submitting" }) },
    "@/lib/i18n/businessOperations": { businessOperationsCopy },
    "@/lib/modelLabel": { modelLabel: id => id },
    "./BusinessGenerationReceipt": { __esModule: true, default: ReceiptMarker, businessCostText: () => "Awaiting billing", businessDurationText: () => "5 s" },
  }, {
    URL: { createObjectURL: blob => { exports.push(blob); return "blob:fixture"; }, revokeObjectURL() {} },
    document: { createElement: () => ({ click() { clicks.push(this.download); }, remove() {} }), body: { append() {} } },
    setTimeout: fn => fn(),
    fetch: async url => { calls.push(url); return response(report); },
  });
  const renderUsage = () => usage.render(Usage, {});
  renderUsage(); usage.mount(); await flush();
  assert.ok(elements(renderUsage()).some(node => node.type === ReceiptMarker && node.props.inUsageTable));
  const csv = button(renderUsage(), usageCopy.download);
  csv.onClick(); assert.equal(clicks[0], "business-usage-2026-11-01-2026-11-08-page1.csv");
  const downloaded = await exports[0].text();
  assert.ok(downloaded.includes("'  =FORMULA()"));
  assert.ok(downloaded.includes("Awaiting billing"));
  assert.ok(!downloaded.includes("USD 0"));
  assert.ok(text(renderUsage()).includes(usageCopy.downloadStarted));
  elements(renderUsage()).find(node => node.type === "form").props.onSubmit({ preventDefault() {} });
  await flush();
  assert.ok(calls.at(-1).includes("from=2026-11-01&to=2026-11-08"));
  assert.ok(text(renderUsage()).includes(usageCopy.filterOn));
  button(renderUsage(), usageCopy.clear).onClick(); await flush();
  assert.equal(calls.at(-1), "/api/business/usage?page=1");
  assert.ok(!text(renderUsage()).includes(usageCopy.filterOn));
  console.log("PASS usage: filter/reset, reachable receipt, page CSV action with spreadsheet escaping and no inferred costs");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
