import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { verifyGeneratedImageReference } from "@/lib/generatedImageReference";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","Content-Security-Policy":"default-src 'none'; sandbox"};
export async function GET(req:NextRequest) {
 const p=req.nextUrl.searchParams,path=p.get('path')||'',expires=Number(p.get('expires')),token=p.get('token')||'';
 try {
  if(!verifyGeneratedImageReference(path,expires,token))return NextResponse.json({error:'素材連結無效或已過期'},{status:403,headers});
  const blob=await get(path,{access:'private'});
  if(!blob||blob.statusCode!==200)return NextResponse.json({error:'找不到參考圖'},{status:404,headers});
  const type=blob.blob.contentType?.split(';')[0]||'';
  if(!['image/png','image/jpeg','image/webp'].includes(type))return NextResponse.json({error:'不支援此參考圖片格式'},{status:400,headers});
  return new Response(blob.stream,{headers:{...headers,'Content-Type':type}});
 }catch{return NextResponse.json({error:'素材暫時無法讀取'},{status:503,headers});}
}
