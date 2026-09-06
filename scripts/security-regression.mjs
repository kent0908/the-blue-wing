import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
const next = require("next/server");
function load(file, mocks = {}, env = "production") {
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports, require: name => {
      if (name in mocks) return mocks[name];
      if (name === "next/server") return next;
      throw Error("Unexpected dependency: " + name);
    },
    process: { env: { NODE_ENV: env } }, console: {error(){}, warn(){}},
    URL, Response, Date, Buffer, AbortSignal
  }, { filename: file });
  return exports;
}
const req = (path, body) => new next.NextRequest("https://app.example"+path, {
  method: "POST", headers: {"content-type":"application/json"}, body: JSON.stringify(body)
});
const db = {sql: async () => ({rows:[{id:1,email:"test@example.com",status:"active"}]})};
for (const env of ["production", "test"]) {
  const reset=load("app/api/auth/forgot-password/route.ts", {
    "@/lib/db":db, "@/lib/auth":{newToken:()=> "secret"},
    "@/lib/mail":{sendResetEmail:async()=>({sent:false})},
    "@/lib/rateLimit":{authLimit:async()=>null}
  },env);
  const response=await reset.POST(req("/api/auth/forgot-password",{email:"test@example.com"}));
  assert.deepEqual(await response.json(),{ok:true});
}
let call=0,insert=[];
const register=load("app/api/auth/register/route.ts",{
  "@/lib/db":{sql:async(strings,...values)=>{call++; if(call===1)return {rows:[]};insert=values;return {rows:[{id:2}]};},toPublicUser:u=>u},
  "@/lib/auth":{hashPassword:()=> "hash",newToken:()=> "secret"},
  "@/lib/mail":{sendVerifyEmail:async()=>({sent:false})},
  "@/lib/rateLimit":{authLimit:async()=>null}
});
const response=await register.POST(req("/api/auth/register",{email:"admin@example.com",password:"test-password"}));
const result=await response.json();
assert.equal(result.devVerifyUrl,undefined);
assert.equal(insert[2],"user");
assert.equal(insert[3],false);
let upstreamCalled=false;
const video=load("app/api/videos/[id]/route.ts",{
  "@/lib/apiauth":{requireUser:async()=>({user:{id:1}})},
  "@/lib/db":{sql:async()=>({rows:[]})},
  "@/lib/siraya":{getVideoStatus:async()=>{upstreamCalled=true;}},
  "@/lib/errors":{errorResponse:()=>new Response(null,{status:500})},
  "@/lib/credits":{}, "@/lib/generations":{}, "@/lib/mediaStore":{},
  "@/lib/creditTransactions":{refundCharge:async()=>{}}
});
assert.equal((await video.GET(new next.NextRequest("https://app.example/api/videos/other"),{params:Promise.resolve({id:"other"})})).status,404);
assert.equal(upstreamCalled,false);
const proxy=load("proxy.ts");
assert.equal(proxy.proxy(new next.NextRequest("https://app.example/api/auth/login",{
  method:"POST",headers:{origin:"https://evil.example"}
})).status,403);
assert.equal(proxy.proxy(new next.NextRequest("https://app.example/api/auth/login",{
  method:"POST",headers:{origin:"https://app.example"}
})).status,200);
console.log("PASS: production reset secrecy, registration role, video ownership, cross-origin protection");
