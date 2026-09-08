import { randomUUID } from 'node:crypto';
import { sql } from './db';
import type { DecomposedLayer } from './layerDecomposition';
export async function ensureLayerSets(){
 await sql.query(`CREATE TABLE IF NOT EXISTS generation_layer_sets(id uuid PRIMARY KEY,user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,model text NOT NULL,prompt text NOT NULL,layers jsonb NOT NULL,credits_spent integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now())`);
}
export async function saveLayerSet(userId:number,model:string,prompt:string,layers:DecomposedLayer[],credits:number){
 await ensureLayerSets();const id=randomUUID();
 await sql.query('INSERT INTO generation_layer_sets(id,user_id,model,prompt,layers,credits_spent) VALUES($1,$2,$3,$4,$5::jsonb,$6)',[id,userId,model,prompt,JSON.stringify(layers),credits]);return id;
}
