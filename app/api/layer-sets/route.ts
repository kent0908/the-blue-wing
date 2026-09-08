import { NextRequest,NextResponse } from 'next/server';
import { requireUser } from '@/lib/apiauth';
import { sql } from '@/lib/db';
import { ensureLayerSets } from '@/lib/layerSets';
import { errorResponse } from '@/lib/errors';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const auth=await requireUser(req);if('error' in auth)return auth.error;
 try {await ensureLayerSets();const {rows}=await sql.query(`SELECT id,prompt,created_at AS "createdAt",layers->0->>'url' AS "baseUrl" FROM generation_layer_sets WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,[auth.user.id]);return NextResponse.json({layerSets:rows});}catch(e){return errorResponse(e);}
}
