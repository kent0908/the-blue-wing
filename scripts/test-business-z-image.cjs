const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const source = fs.readFileSync("lib/businessZImage.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const tested = { exports: {} };
new Function("module", "exports", compiled.outputText)(tested, tested.exports);
const { getBusinessZImageCapability, buildBusinessZImagePayload } = tested.exports;

const standard = { model: "z-image-spicy", prompt: "A paper lighthouse at dusk" };
const pro = { ...standard, model: "z-image-spicy-pro" };

assert.equal(getBusinessZImageCapability(standard.model).providerPromptExtendDefault, true);
assert.equal(getBusinessZImageCapability(standard.model).promptExtendSurcharged, true);
assert.equal(getBusinessZImageCapability(pro.model).providerPromptExtendDefault, false);
assert.equal(getBusinessZImageCapability(pro.model).maxDimension, 2560);
assert.equal(getBusinessZImageCapability("z-image"), undefined);
assert.equal(getBusinessZImageCapability("z-image-spicy-guess"), undefined);

assert.deepEqual(buildBusinessZImagePayload(standard, 0), {
  ...standard, size: "1024x1536", prompt_extend: false,
});
assert.deepEqual(buildBusinessZImagePayload(pro, 0), {
  ...pro, size: "1024x1024", prompt_extend: false,
});
assert.deepEqual(buildBusinessZImagePayload({
  ...standard, width: 1, height: 2, size: "1536x256", n: 1, seed: 0, prompt_extend: true,
}, 0), {
  ...standard, size: "1536x256", seed: 0, prompt_extend: true,
});
assert.equal(buildBusinessZImagePayload({ ...pro, width: 2560, height: 2560 }, 0).size, "2560x2560");

for (const invalid of [
  { size: "1537x256" }, { size: "255x1024" }, { size: "auto" },
  { width: 1537 }, { height: 255.5 }, { n: 2 }, { seed: -1 },
  { prompt: " " }, { prompt_extend: "false" }, { model: "z-image" },
  { image: "https://example.test/unowned.png" }, { reference_images: [] },
  { response_format: "url" }, { callbackUrl: "https://example.test/callback" },
]) {
  assert.throws(() => buildBusinessZImagePayload({ ...standard, ...invalid }, 0));
}
assert.throws(() => buildBusinessZImagePayload({ ...pro, size: "2561x1024" }, 0));
assert.throws(() => buildBusinessZImagePayload(standard, 1));
console.log("PASS Z-Image exact grants, provider defaults, single image, per-tier dimensions, explicit surcharge opt-in and unsupported fields. No network calls.");
