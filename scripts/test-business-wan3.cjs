/* Wan 3.0 BYOK adapter: pure contract regressions, no live requests or charges. */
const fs = require("node:fs");
const assert = require("node:assert/strict");
const ts = require("typescript");

const mod = { exports: {} };
const source = fs.readFileSync("lib/businessWan3.ts", "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
new Function("module", "exports", js)(mod, mod.exports);
const {
  getBusinessWan3Capability: caps,
  assertBusinessWan3References: validateRefs,
  buildBusinessWan3Payload: build,
  BusinessWan3ParameterError,
} = mod.exports;

const base = { model: "wan3.0-video", prompt: "Pan across a blue harbor" };
const first = { type: "image", url: "https://owned.invalid/source/first?signature=test" };
const last = { type: "image", url: "https://owned.invalid/source/last?signature=test" };
const expectedError = error => error instanceof BusinessWan3ParameterError && error.code === "invalid_parameters";
const reject = (parameters, refs = []) => assert.throws(() => build(parameters, refs), expectedError);

const tiers = {
  "wan3.0-video": ["480p", "720p", "1080p"],
  "wan3.0-video-pro": ["1080p", "2k", "4k"],
  "wan3.0-video-prime": ["480p", "720p", "1080p"],
  "wan3.0-video-prime-pro": ["1080p", "2k", "4k"],
};
for (const [model, resolutions] of Object.entries(tiers)) {
  assert.deepEqual(caps(model).resolutions, resolutions);
  for (const resolution of resolutions) assert.equal(build({ ...base, model, resolution }, []).resolution, resolution);
  for (const resolution of ["480p", "720p", "1080p", "2k", "4k", "1080P"].filter(value => !resolutions.includes(value))) reject({ ...base, model, resolution });
  const spicy = `${model}-spicy`;
  assert.deepEqual(caps(spicy), { ...caps(model), label: `${caps(model).label} Spicy` });
  for (const resolution of resolutions) {
    const parameters = { ...base, model, resolution, mode: "first-last-frame", seconds: -1 };
    assert.deepEqual(build({ ...parameters, model: spicy }, [first, last]), {
      ...build(parameters, [first, last]), model: spicy,
    });
  }
  for (const resolution of ["480p", "720p", "1080p", "2k", "4k", "1080P"].filter(value => !resolutions.includes(value))) reject({ ...base, model: spicy, resolution });
}
for (const model of ["wan2.7-t2v", "wan3.0-t2v", "wan3.0-video-preview", "WAN3.0-VIDEO", "NSFW-wan3.0-video", "wan3.0-video-spicy-pro", "wan3.0-video-spicy-preview", "toString", "__proto__", "", undefined]) {
  assert.equal(caps(model), undefined);
  reject({ ...base, model });
}

assert.deepEqual(build(base, []), {
  model: base.model, prompt: base.prompt, resolution: "1080p", seconds: 5, aspect_ratio: "16:9",
  async: true, generate_audio: true, prompt_extend: false,
});
for (const seconds of [-1, 2, 30]) assert.equal(build({ ...base, seconds }, []).seconds, seconds);
for (const seconds of [0, 1, 31, 5.5, "5", null, NaN]) reject({ ...base, seconds });
for (const prompt of ["", " ", undefined, null, "台".repeat(2001)]) reject({ ...base, prompt });
assert.equal(build({ ...base, prompt: "台".repeat(2000) }, []).prompt.length, 2000);
for (const ratio of ["16:9", "4:3", "1:1", "3:4", "9:16"]) assert.equal(build({ ...base, aspect_ratio: ratio }, []).aspect_ratio, ratio);
for (const ratio of ["21:9", "adaptive", "", null]) reject({ ...base, aspect_ratio: ratio });
for (const seed of [-1, 2147483648, "0", 2.5]) reject({ ...base, seed });
assert.deepEqual(build({ ...base, generate_audio: false, prompt_extend: true, seed: 0 }, []), {
  ...build(base, []), generate_audio: false, prompt_extend: true, seed: 0,
});
for (const key of ["generate_audio", "prompt_extend"]) reject({ ...base, [key]: "false" });

const frame = build({ model: base.model, mode: "image-to-video" }, [first]);
assert.equal(frame.first_frame, first.url);
assert.equal(frame.aspect_ratio, "adaptive");
assert.ok(!Object.hasOwn(frame, "last_frame") && !Object.hasOwn(frame, "prompt") && !Object.hasOwn(frame, "reference_images"));
const pair = build({ ...base, mode: "first-last-frame", aspect_ratio: "1:1" }, [last, first]);
assert.deepEqual({ first: pair.first_frame, last: pair.last_frame, ratio: pair.aspect_ratio }, { first: last.url, last: first.url, ratio: "1:1" });
reject({ ...base, mode: "image-to-video" }, [first, last]);
reject({ ...base, mode: "first-last-frame" }, [first]);
reject({ ...base, mode: "text-to-video" }, [first]);
reject({ ...base, mode: "subject-reference" });
reject({ ...base, mode: "video-edit" }, [first]);
reject({ ...base, mode: "last-frame" }, [first]);

const ten = Array.from({ length: 10 }, (_, i) => ({ type: "image", url: first.url + i }));
for (const mode of ["freestyle", "subject-reference", undefined]) {
  const refs = build({ ...base, mode, aspect_ratio: "adaptive", businessAssetIds: ["owned-id"], referenceGenerationIds: ["owned-job"] }, ten);
  assert.deepEqual(refs.reference_images, ten.map(ref => ref.url));
  for (const key of ["input_references", "frame_images", "first_frame", "last_frame", "businessAssetIds", "referenceGenerationIds", "mode"]) assert.ok(!Object.hasOwn(refs, key), key);
}
reject(base, [...ten, first]);
reject(base, new Array(1));
reject(null);
for (const type of ["audio", "video", "document"]) assert.throws(() => validateRefs("subject-reference", [{ type }]), expectedError);
reject(base, [{ ...first, voiceUrl: "https://owned.invalid/voice.wav" }]);
for (const url of ["", "asset://id", "data:image/png;base64,abc", "http://owned.invalid/a", "https://name:pw@owned.invalid/a", first.url + "#frag", " " + first.url]) reject(base, [{ ...first, url }]);
for (const key of ["first_frame", "last_frame", "reference_images", "reference_videos", "reference_audios", "file", "link", "assetIds", "providerAssets", "referenceOrder", "frame_images", "input_references", "watermark", "negative_prompt", "audio_setting", "extra_body", "callbackUrl", "async", "duration"]) {
  reject({ ...base, [key]: first.url }, [first]);
}

console.log("Wan 3.0 BYOK contract verified: exact tiers, flat async envelope, typed ordered image modes, boundary and passthrough rejection. No paid or remote calls.");
