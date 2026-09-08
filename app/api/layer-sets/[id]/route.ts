import { NextRequest,NextResponse } from 'next/server';
import { requireUser } from '@/lib/apiauth';
import { sql } from '@/lib/db';
import { ensureLayerSets } from '@/lib/layerSets';
import { errorResponse } from '@/lib/errors';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const auth=await requireUser(req);if('error' in auth)return auth.error;
 try {const {id}=await params;if(!/^[0-9a-f-]{36}$/i.test(id))return NextResponse.json({error:{message:'找不到圖層'}},{status:404});
 await ensureLayerSets();const {rows}=await sql.query('SELECT id,model,prompt,layers,credits_spent AS "creditsSpent",created_at AS "createdAt" FROM generation_layer_sets WHERE id=$1 AND user_id=$2',[id,auth.user.id]);
 return rows[0]?NextResponse.json(rows[0]):NextResponse.json({error:{message:'找不到圖層'}},{status:404});}catch(e){return errorResponse(e);}
}
