/** Additive companion migration only. Does not print environment values or rows. */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
const here=dirname(fileURLToPath(import.meta.url));
try {const {createRequire}=await import('node:module');const {loadEnvConfig}=createRequire(import.meta.url)('@next/env');loadEnvConfig(join(here,'..'),false,{info(){},error(){}});} catch {}
process.env.POSTGRES_URL ||= process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || '';
if(!process.env.POSTGRES_URL){console.error('Database is not configured');process.exit(1);}
const {sql}=await import('@vercel/postgres');
try {
 const before=await sql.query("select (select count(*)::int from character_scenes) as scenes, case when to_regclass('public.character_idle_videos') is null then false else true end as had_idle");
 let oldIdle=null;
 if(before.rows[0]?.had_idle)oldIdle=(await sql.query('select count(*)::int as n from character_idle_videos')).rows[0].n;
 for(const file of ['migrate-character-idle-video.sql','migrate-character-scene-requests.sql','migrate-character-scene-quotes.sql'])await sql.query(readFileSync(join(here,file),'utf8').replace(/^\uFEFF/,''));
 const after=await sql.query('select (select count(*)::int from character_scenes) as scenes,(select count(*)::int from character_idle_videos) as idle');
 if(after.rows[0].scenes!==before.rows[0].scenes || (oldIdle!==null && after.rows[0].idle!==oldIdle))throw Error('Count mismatch');
 console.log('Companion schema ready; existing scene and idle-video row counts preserved.');
 process.exit(0);
} catch {console.error('Companion migration failed; no environment values or rows were printed.');process.exit(1);}
