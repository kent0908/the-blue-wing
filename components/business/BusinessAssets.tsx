"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { upload } from "@vercel/blob/client";
import { useLocale } from "@/lib/i18n/client";
import { businessAssetsCopy, businessAssetsError } from "@/lib/i18n/businessAssets";
import type { BusinessProviderAsset } from "./types";
import styles from "./BusinessAssets.module.css";

export type BusinessAssetRecord = BusinessProviderAsset & { uploadId?: string; storageReady?: boolean; providerReady?: boolean };
interface Props { onSelect?: (asset: BusinessAssetRecord) => void; selectedIds?: string[]; canSelect?: (asset: BusinessAssetRecord) => boolean; compact?: boolean; imageOnly?: boolean; onChanged?: () => void }
interface UploadRecord { id: string; uploadId: string; name: string; type: "image" | "video" | "audio"; status: string; storageReady: boolean; asset?: BusinessAssetRecord; errorCode?: string }
interface UploadConfig { directUpload: boolean; types: Record<string, { type: string; maxBytes: number; ext: string }>; uploads?: UploadRecord[] }
type Filters = { type: string; status: string; name: string };
const HEADERS={"Content-Type":"application/json"};
const interpolate=(text:string,values:Record<string,string|number>)=>text.replace(/\{(\w+)\}/g,(match,key:string)=>String(values[key]??match));
function AssetIcon({type}:{type:string}){return <svg aria-hidden="true" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.2">{type==="image"?<><rect x="7" y="9" width="34" height="30" rx="1"/><circle cx="17" cy="18" r="3"/><path d="m9 35 10-11 7 6 6-10 7 15"/></>:type==="video"?<><rect x="7" y="11" width="34" height="26" rx="1"/><path d="m20 18 11 6-11 6Z"/></>:<><path d="M18 34V13l19-4v22M18 20l19-4"/><ellipse cx="12" cy="35" rx="6" ry="4"/><ellipse cx="31" cy="32" rx="6" ry="4"/></>}</svg>;}
const typedFile=(file:File)=>{
  if(file.type)return file;
  const ext=file.name.toLowerCase().split(".").pop()??"";
  const mime:Record<string,string>={png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",gif:"image/gif",mp4:"video/mp4",mov:"video/quicktime",mp3:"audio/mpeg",wav:"audio/wav"};
  return mime[ext]?new File([file],file.name,{type:mime[ext]}):file;
};

export default function BusinessAssets({onSelect,selectedIds=[],canSelect,compact=false,imageOnly=false,onChanged}:Props){
  const t=businessAssetsCopy(useLocale());
  const [config,setConfig]=useState<UploadConfig|null>(null);
  const [catalog,setCatalog]=useState<BusinessAssetRecord[]>([]);
  const [uploads,setUploads]=useState<UploadRecord[]>([]);
  const [loading,setLoading]=useState(true);
  const [uploading,setUploading]=useState(false);
  const [files,setFiles]=useState<File[]>([]);
  const [consent,setConsent]=useState(false);
  const [progress,setProgress]=useState(0);
  const [stage,setStage]=useState<"uploading"|"registering">("uploading");
  const [fileName,setFileName]=useState("");
  const [error,setError]=useState("");
  const [catalogError,setCatalogError]=useState("");
  const [configError,setConfigError]=useState("");
  const [notice,setNotice]=useState("");
  const [query,setQuery]=useState("");
  const [appliedQuery,setAppliedQuery]=useState("");
  const [type,setType]=useState(imageOnly?"image":"all");
  const [status,setStatus]=useState("all");
  const [page,setPage]=useState(0);
  const [totalPages,setTotalPages]=useState(0);
  const [refreshingId,setRefreshingId]=useState("");
  const input=useRef<HTMLInputElement|null>(null);
  const activeRequest=useRef<AbortController|null>(null);
  const configRequest=useRef<AbortController|null>(null);
  const committed=useRef<Filters>({type:imageOnly?"image":"all",status:"all",name:""});
  const uploadLock=useRef(false);
  const fileRequests=useRef(new WeakMap<File,string>());
  const alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;activeRequest.current?.abort();configRequest.current?.abort();};},[]);

  const loadConfig=useCallback(async()=>{
    configRequest.current?.abort();
    const controller=new AbortController();
    configRequest.current=controller;
    try{
      const response=await fetch("/api/business/provider-assets/upload",{cache:"no-store",signal:controller.signal});
      const body=await response.json().catch(()=>null);
      if(!alive.current||controller.signal.aborted)return;
      if(!response.ok||!body?.types){setConfig(null);setConfigError(body?.error?.code??"business_asset_storage_unavailable");return;}
      setConfigError("");
      setConfig(body);setUploads(body.uploads??[]);
    }catch{if(alive.current&&!controller.signal.aborted){setConfig(null);setConfigError("business_asset_storage_unavailable");}}
  },[]);
  const loadCatalog=useCallback(async(nextPage=1,filters=committed.current)=>{
    activeRequest.current?.abort();const controller=new AbortController();activeRequest.current=controller;
    setLoading(true);setCatalogError("");
    if(nextPage===1){committed.current=filters;setAppliedQuery(filters.name.trim());}
    const params=new URLSearchParams({page:String(nextPage),pageSize:"30",status:filters.status});
    if(filters.type!=="all")params.set("assetType",filters.type);
    if(filters.name.trim())params.set("name",filters.name.trim());
    try{
      const response=await fetch(`/api/business/provider-assets?${params}`,{cache:"no-store",signal:controller.signal});
      const body=await response.json().catch(()=>null);
      if(controller.signal.aborted||!alive.current)return;
      if(!response.ok||body?.needsKey){setCatalogError(body?.needsKey?"credential_required":body?.error?.code??"business_asset_unavailable");return;}
      if(!Array.isArray(body?.assets)||!body.pagination)throw new Error("invalid_asset_list");
      const values=body.assets as BusinessAssetRecord[];
      setCatalog(previous=>Array.from(new Map((nextPage===1?values:[...previous,...values]).map(asset=>[asset.id,asset])).values()));
      setPage(nextPage);setTotalPages(body.pagination.totalPages);
    }catch{if(!controller.signal.aborted&&alive.current)setCatalogError("business_asset_unavailable");}
    finally{if(!controller.signal.aborted&&alive.current)setLoading(false);}
  },[]);
  useEffect(()=>{
    let active=true;
    void Promise.resolve().then(()=>{
      if(!active)return;
      void loadConfig();
      void loadCatalog();
    });
    return()=>{active=false;};
  },[loadConfig,loadCatalog]);

  function queueFiles(values:File[]){
    if(uploadLock.current||!config?.directUpload||!values.length)return;
    if(values.length>6){setError("too_many_files");return;}
    const normalized=values.map(typedFile);
    if(normalized.some(file=>!config?.types[file.type]||file.size<=0||file.size>config.types[file.type].maxBytes)){setError("business_asset_upload_invalid");return;}
    if(imageOnly&&normalized.some(file=>!file.type.startsWith("image/"))){setError("business_asset_upload_invalid");return;}
    setFiles(normalized);setConsent(false);setError("");setNotice("");
  }
  function rememberUpload(value:UploadRecord){setUploads(previous=>[value,...previous.filter(item=>item.id!==value.id)].slice(0,60));}
  async function apiUpload(body:Record<string,unknown>){
    const response=await fetch("/api/business/provider-assets/upload",{method:"POST",headers:HEADERS,body:JSON.stringify(body)});
    const value=await response.json().catch(()=>null);
    if(!response.ok)throw new Error(value?.error?.code??"business_asset_upload_invalid");
    return value;
  }
  async function uploadFiles(){
    if(uploadLock.current||!files.length||!consent||!config?.directUpload)return;
    uploadLock.current=true;setUploading(true);setError("");setNotice("");
    let started=0;
    let interrupted=false;
    try{
      for(const file of files){
        if(!alive.current)break;
        setFileName(file.name);setProgress(0);setStage("uploading");
        const clientRequestId=fileRequests.current.get(file)??crypto.randomUUID();
        fileRequests.current.set(file,clientRequestId);
        const initialized=await apiUpload({action:"initialize",clientRequestId,name:file.name.slice(0,120),contentType:file.type,size:file.size});
        started++;
        if(alive.current)rememberUpload(initialized.upload);
        await upload(initialized.pathname,file,{access:"private",handleUploadUrl:"/api/business/provider-assets/upload",contentType:file.type,multipart:file.size>8*1024*1024,clientPayload:JSON.stringify({uploadId:initialized.upload.id}),onUploadProgress:event=>{if(alive.current)setProgress(event.percentage);}});
        if(alive.current)setStage("registering");
        const completed=await apiUpload({action:"complete",uploadId:initialized.upload.id});
        if(!alive.current)break;
        rememberUpload(completed.upload);
        if(["created","unknown","registering"].includes(completed.upload.status)){setError("business_asset_upload_uncertain");interrupted=true;break;}
        if(completed.upload.status==="failed"){setError(completed.upload.errorCode??"business_asset_upload_rejected");interrupted=true;break;}
      }
      if(alive.current&&!interrupted)setNotice(t.uploadFinished);
    }catch(error){if(alive.current)setError(error instanceof Error&&/^[a-z_]{1,64}$/.test(error.message)?error.message:"business_asset_upload_uncertain");}
    finally{
      uploadLock.current=false;
      if(alive.current){
        // A file with a recorded upload has its own recovery path. Leave only untouched files queued.
        if(started){setFiles(files.slice(started));setConsent(false);void loadCatalog(1,committed.current);onChanged?.();}
        setUploading(false);setFileName("");
      }
    }
  }
  async function recoverUpload(item:UploadRecord){
    if(refreshingId)return;setRefreshingId(item.id);setError("");setNotice("");
    try{const value=await apiUpload({action:"complete",uploadId:item.id});rememberUpload(value.upload);if(["created","unknown","registering"].includes(value.upload.status))setError("business_asset_upload_uncertain");else if(value.upload.status==="failed")setError(value.upload.errorCode??"business_asset_upload_rejected");else{setNotice(t.uploadFinished);void loadCatalog(1,committed.current);}onChanged?.();}
    catch(error){setError(error instanceof Error?error.message:"business_asset_upload_uncertain");}
    finally{setRefreshingId("");}
  }
  async function refreshAsset(asset:BusinessAssetRecord){
    if(refreshingId)return;setRefreshingId(asset.id);setError("");
    try{
      const response=await fetch(`/api/business/provider-assets/${encodeURIComponent(asset.id)}`,{cache:"no-store"});
      const value=await response.json().catch(()=>null);
      if(!response.ok){setError(value?.error?.code??"business_asset_unavailable");return;}
      setCatalog(previous=>previous.map(item=>item.id===asset.id?{...item,...value.asset}:item));
      setUploads(previous=>previous.map(item=>item.asset?.id===asset.id?{...item,status:value.asset.status,asset:{...item.asset,...value.asset}}:item));onChanged?.();
    }catch{setError("business_asset_unavailable");}finally{setRefreshingId("");}
  }

  const known=new Set(catalog.map(asset=>asset.id));
  const material:BusinessAssetRecord[]=[...catalog.map(asset=>{
    const original=uploads.find(item=>item.asset?.id===asset.id);
    return {...asset,providerReady:asset.status==="active",...(original?{uploadId:original.id,storageReady:original.storageReady}:{})};
  }),...uploads.filter(item=>item.storageReady&&(!item.asset||!known.has(item.asset.id))).map(item=>({id:`upload:${item.id}`,name:item.name,type:item.type,status:item.status,uploadId:item.id,storageReady:true,providerReady:false}))]
    .filter(asset=>(type==="all"||asset.type===type)&&(!imageOnly||asset.type==="image")&&(status==="all"||asset.status===status||imageOnly&&asset.storageReady&&status==="active")&&(!appliedQuery||asset.name.toLowerCase().includes(appliedQuery.toLowerCase())));
  const statusText=(value:string)=>value==="active"?t.active:value==="processing"||value==="registering"?t.processing:value==="created"?t.created:value==="unknown"?t.unknown:t.failed;
  const accept=Object.keys(config?.types??{}).filter(mime=>!imageOnly||mime.startsWith("image/")).join(",");
  const pendingUploads=uploads.filter(item=>["created","registering","unknown"].includes(item.status));

  return <section className={`${styles.assets} ${compact?styles.compact:""}`} aria-label={t.title}>
    <div className={styles.uploadPanel} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();queueFiles(Array.from(event.dataTransfer.files));}}>
      <div className={styles.uploadToolbar}>
        <div><strong>{t.upload}</strong><p className={styles.note}>{imageOnly?t.imageLimits:t.limits}</p></div>
        <input ref={input} type="file" hidden multiple accept={accept} disabled={uploading||!config?.directUpload} onChange={event=>{queueFiles(Array.from(event.target.files??[]));event.target.value="";}}/>
        <button type="button" className={files.length?styles.small:styles.primary} disabled={uploading||!config?.directUpload} onClick={()=>input.current?.click()}>{!config&&!configError?t.loading:files.length?t.replaceFiles:t.choose}</button>
      </div>
      {(configError||config&&!config.directUpload)&&<p className={styles.warning} role="alert">{configError?businessAssetsError(t,configError):t.storageUnavailable} <button type="button" className={styles.textButton} onClick={()=>void loadConfig()}>{t.refresh}</button></p>}
      {!!files.length&&<>
        <ul className={styles.queue} aria-label={t.queued}>{files.map((file,index)=><li key={`${file.name}-${index}`}>
          <span>{file.name}<small>{(file.size/1024/1024).toFixed(2)} MB</small></span>
          <button type="button" disabled={uploading} aria-label={`${t.removeFile} ${file.name}`} onClick={()=>setFiles(values=>values.filter((_,i)=>i!==index))}>×</button>
        </li>)}</ul>
        <label className={styles.consent}><input type="checkbox" checked={consent} disabled={uploading} onChange={event=>setConsent(event.target.checked)}/>{t.consent}</label>
        <button type="button" className={styles.primary} disabled={uploading||!consent||!config?.directUpload} onClick={()=>void uploadFiles()}>{uploading?t[stage]:interpolate(t.uploadSelected,{n:files.length})}</button>
      </>}
      {uploading&&<div className={styles.uploadProgress} role="status"><span>{fileName}</span><progress aria-label={t.progress} max={100} value={stage==="registering"?100:progress}/></div>}
      <details className={styles.help}><summary>{t.uploadHelp}</summary><p>{imageOnly?t.imageFormats:t.formats} {t.noGeneration}</p><p>{t.providerNotice}</p></details>
    </div>
    {error&&<p className={styles.error} role="alert">{error==="too_many_files"?t.tooMany:businessAssetsError(t,error)}{error==="credential_required"&&<> <a href="/business?tab=key">{t.keyLink} ↗</a></>}</p>}
    {notice&&<p className={styles.success} role="status">{notice}</p>}
    {!!pendingUploads.length&&<details className={styles.recent}><summary>{t.pendingTitle} · {pendingUploads.length}</summary><ul>{pendingUploads.map(item=><li key={item.id}><span>{item.name}<small>{statusText(item.status)}</small></span><button type="button" className={styles.small} disabled={!!refreshingId||uploading} onClick={()=>void recoverUpload(item)}>{refreshingId===item.id?t.loading:t.recover}</button></li>)}</ul></details>}
    <div className={styles.libraryHeader}>
      <div className={styles.types} role="group" aria-label={t.source}>{(imageOnly?["image"]:["all","image","video","audio"]).map(value=><button type="button" key={value} aria-pressed={type===value} onClick={()=>{setType(value);void loadCatalog(1,{type:value,status,name:query});}}>{t[value as "all"|"image"|"video"|"audio"]}</button>)}</div>
      <button type="button" className={styles.textButton} disabled={loading||uploading||!!refreshingId} onClick={()=>{void loadConfig();void loadCatalog();}}>{loading?t.loading:t.refresh}</button>
    </div>
    <form className={styles.searchRow} role="search" aria-label={t.search} onSubmit={event=>{event.preventDefault();void loadCatalog(1,{type,status,name:query});}}><input type="search" maxLength={120} aria-label={t.search} placeholder={t.search} value={query} onChange={event=>setQuery(event.target.value)}/><button type="submit" className={styles.small} disabled={loading}>{t.searchButton}</button><select aria-label={t.status} value={status} onChange={event=>{setStatus(event.target.value);void loadCatalog(1,{type,status:event.target.value,name:query});}}><option value="all">{t.allStatus}</option><option value="active">{t.active}</option><option value="processing">{t.processing}</option><option value="failed">{t.failed}</option></select></form>
    {catalogError&&<p className={styles.error} role="alert">{businessAssetsError(t,catalogError)}{catalogError==="credential_required"&&<> <a href="/business?tab=key">{t.keyLink} ↗</a></>}</p>}
    {!material.length&&!loading&&!catalogError?<div className={styles.empty}><h3>{appliedQuery||status!=="all"||type!=="all"&&!imageOnly?t.noResults:t.empty}</h3></div>:<div className={styles.grid} aria-busy={loading}>{material.map(asset=>{
      const selected=selectedIds.includes(asset.id)||!!asset.uploadId&&selectedIds.includes(asset.uploadId);
      const available=imageOnly?asset.type==="image"&&!!asset.uploadId&&!!asset.storageReady:!!asset.providerReady;
      const disabled=!selected&&(!available||canSelect?.(asset)===false);
      const disabledReason=imageOnly&&!asset.uploadId?t.nativeRequired:!available?t.readyOnly:t.capacity;
      return <article className={styles.card} key={asset.id} data-selected={selected}>
        <div className={styles.thumbnail}>{asset.type==="image"&&asset.uploadId&&asset.storageReady?<Image src={`/api/business/provider-assets/uploads/${asset.uploadId}/preview`} alt="" width={640} height={420} loading="lazy" unoptimized/>:<AssetIcon type={asset.type}/>}<span className={styles.mediaType}>{t[asset.type]}</span></div>
        <div className={styles.cardBody}><h3 title={asset.name}>{asset.name}</h3><p className={styles.assetStatus} data-status={asset.storageReady&&imageOnly?"active":asset.status}>{asset.storageReady&&imageOnly?t.privateReady:statusText(asset.status)}</p><small>{asset.uploadId?t.native:t.provider}</small>
        {onSelect&&<button type="button" className={styles.selectButton} disabled={disabled} aria-pressed={selected} title={disabled?disabledReason:asset.name} onClick={()=>onSelect(asset)}>{selected?t.selected:imageOnly&&asset.storageReady?t.original:t.select}<span aria-hidden="true">{selected?"✓":"＋"}</span></button>}
        {!asset.id.startsWith("upload:")&&asset.status!=="active"&&<button type="button" className={styles.textButton} disabled={!!refreshingId||uploading} onClick={()=>void refreshAsset(asset)}>{refreshingId===asset.id?t.loading:t.refreshOne}</button>}
        {onSelect&&disabled&&<p className={styles.disabledReason}>{disabledReason}</p>}
        {asset.storageReady&&!asset.providerReady&&!imageOnly&&<p className={styles.disabledReason}>{t.storageOnly}</p>}
        </div>
      </article>;
    })}</div>}
    {(material.length>0||page<totalPages&&!catalogError)&&<div className={styles.footer}><p className={styles.note} role="status">{interpolate(t.count,{count:material.length})}</p>{page<totalPages&&!catalogError&&<button type="button" className={styles.small} disabled={loading} onClick={()=>void loadCatalog(page+1)}>{loading?t.loading:t.more}</button>}</div>}
  </section>;
}
