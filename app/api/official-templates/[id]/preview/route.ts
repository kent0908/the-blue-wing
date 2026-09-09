import { NextRequest } from 'next/server';
import { get } from '@vercel/blob';
import { getOfficialTemplate } from '@/lib/officialTemplates';
import { getOfficialTemplateMedia } from '@/lib/officialTemplateMedia';
import { byteRange } from '@/lib/byteRange';
export const runtime='nodejs';
export async function GET(req:NextRequest,ctx:{params:Promise<{id:string}>}) {
 const {id}=await ctx.params;
 if(!getOfficialTemplate(id))return new Response(null,{status:404});
 const media=getOfficialTemplateMedia(id);
 if(!media)return new Response(null,{status:404});
 try {
  const blob=await get(media.pathname,{access:'private'});
  if(!blob||blob.statusCode!==200)return new Response(null,{status:404});
  const bytes=new Uint8Array(await new Response(blob.stream).arrayBuffer());
  const range=byteRange(req.headers.get('range'),bytes.length);
  if(range==='invalid')return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+bytes.length}});
  const headers:Record<string,string>={'Content-Type':'video/mp4','Accept-Ranges':'bytes','Cache-Control':'public, max-age=3600, s-maxage=86400','X-Content-Type-Options':'nosniff'};
  if(range){headers['Content-Range']='bytes '+range.start+'-'+range.end+'/'+bytes.length;headers['Content-Length']=String(range.end-range.start+1);return new Response(bytes.slice(range.start,range.end+1),{status:206,headers})}
  headers['Content-Length']=String(bytes.length);return new Response(bytes,{headers});
 } catch { return Response.json({error:{message:'預覽暫時無法載入'}},{status:503}); }
}
