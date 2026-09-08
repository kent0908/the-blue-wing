const fs=require('fs');
for(const kind of ['images','videos']) {
 const p=`app/api/${kind}/route.ts`;let s=fs.readFileSync(p,'utf8');
 s='import { assertModelAccess } from "@/lib/companionGenerationAccess";\n'+s;
 s=s.replace('const body = await req.json();','const body = await req.json();\n    assertModelAccess(req, body?.model);');fs.writeFileSync(p,s);
}
let p='app/api/characters/[id]/scenes/route.ts',s=fs.readFileSync(p,'utf8');
s='import { authorizeSceneRequest } from "@/lib/companionGenerationAccess";\n'+s;
s=s.replace('return new NextRequest(new URL(path, req.url), { method: body ? "POST" : "GET", headers, ...(body ? { body: JSON.stringify(body) } : {}) });','return authorizeSceneRequest(new NextRequest(new URL(path, req.url), { method: body ? "POST" : "GET", headers, ...(body ? { body: JSON.stringify(body) } : {}) }));');fs.writeFileSync(p,s);
p='lib/generationValidation.ts';s=fs.readFileSync(p,'utf8');s='import { assertPromptSafety } from "./promptSafety";\n'+s;s=s.replace('  if(kind==="imageEdit"){','  if(kind!=="text") assertPromptSafety(body.prompt);\n  if(kind==="imageEdit"){');fs.writeFileSync(p,s);
p='lib/characterSceneQuote.ts';s=fs.readFileSync(p,'utf8');s='import { assertPromptSafety } from "./promptSafety";\n'+s;s=s.replace('  const level = levelInfo(character.affection);','  assertPromptSafety(prompt);\n  const level = levelInfo(character.affection);');fs.writeFileSync(p,s);
p='lib/characterIdleVideo.ts';s=fs.readFileSync(p,'utf8');s='import { assertPromptSafety } from "./promptSafety";\n'+s;s=s.replace('  const prompt = buildIdlePrompt(character);','  const prompt = buildIdlePrompt(character);\n  assertPromptSafety(prompt);');fs.writeFileSync(p,s);
p='lib/errors.ts';s=fs.readFileSync(p,'utf8');s='import { PromptSafetyError } from "./promptSafety";\n'+s;s=s.replace('  if (err instanceof SirayaConfigError) {','  if (err instanceof PromptSafetyError) {\n    return NextResponse.json({ error: { message: err.message, type: err.type, code: err.code } }, { status: err.status });\n  }\n  if (err instanceof SirayaConfigError) {');fs.writeFileSync(p,s);
