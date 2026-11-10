/* Verify classification of exact account grants without provider I/O. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../lib/businessAdditionalModels.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exportsObject = {};
new Function("exports", compiled)(exportsObject);
const { getBusinessAdditionalModel: model } = exportsObject;

assert.deepEqual(model("gemini-omni-1.1-flash-preview"), {
  displayName: "Gemini Omni 1.1 Flash Preview", category: "video", nsfw: false,
});
for (const id of ["z-image-spicy", "qwen-image-edit-spicy"]) {
  assert.equal(model(id)?.nsfw, true, id);
  assert.equal(model(id)?.category, "image", id);
}
for (const id of ["face-swap-spicy", "head-swap-spicy"]) {
  assert.equal(model(id)?.nsfw, true, id);
  assert.equal(model(id)?.category, "tool", id);
}
const wan = [
  ["wan2.2-i2v-spicy", "Wan 2.2 I2V Spicy"],
  ["wan2.7-i2v-spicy", "Wan 2.7 I2V Spicy"],
  ["wan3.0-video-spicy", "Wan 3.0 Spicy"],
  ["wan3.0-video-prime-spicy", "Wan 3.0 Prime Spicy"],
  ["wan3.0-video-pro-spicy", "Wan 3.0 Pro Spicy"],
  ["wan3.0-video-prime-pro-spicy", "Wan 3.0 Prime Pro Spicy"],
];
for (const [id, displayName] of wan) {
  assert.deepEqual(model(id), { displayName, category: "video", nsfw: true }, id);
}
for (const invalid of [null, 1, {}, "__proto__", "constructor", "GEMINI-OMNI-1.1-FLASH-PREVIEW",
  "gemini-omni-1.1-flash", "wan3.0-video", "wan3.0-video-spicy-pro",
  "wan3.0-video-spicy ", "gpt-6-spicy", "qwen3.8-spicy"]) {
  assert.equal(model(invalid), undefined, String(invalid));
}
console.log("Business additional models: all eleven verified grant labels and categories, including adult tool isolation and exact IDs.");
