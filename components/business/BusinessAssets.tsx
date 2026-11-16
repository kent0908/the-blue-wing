"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import BusinessAssetPreview from "./BusinessAssetPreview";
import BusinessDialog from "./BusinessDialog";
import { useLocale } from "@/lib/i18n/client";
import { businessAssetsCopy, businessAssetsError } from "@/lib/i18n/businessAssets";
import type { BusinessProviderAsset } from "./types";
import styles from "./BusinessAssets.module.css";

export type BusinessAssetRecord = BusinessProviderAsset & { uploadId?: string; storageReady?: boolean; providerReady?: boolean };
export type BusinessAssetDeletion = { scope: "upload" | "provider"; id: string; name: string; pending?: boolean };
interface Props { onSelect?: (asset: BusinessAssetRecord) => void; selectedIds?: string[]; canSelect?: (asset: BusinessAssetRecord) => boolean; compact?: boolean; imageOnly?: boolean; wanReferences?: boolean; seedanceReferences?: boolean; onChanged?: () => void; onDeleted?: (target: BusinessAssetDeletion) => void; onUploading?: (uploading: boolean) => void }
interface UploadRecord { id: string; uploadId: string; name: string; type: "image" | "video" | "audio"; status: string; storageReady: boolean; asset?: BusinessAssetRecord; errorCode?: string }
interface UploadConfig { directUpload: boolean; types: Record<string, { type: string; maxBytes: number; ext: string }>; uploads?: UploadRecord[] }
type Filters = { type: string; status: string; name: string };
const HEADERS={"Content-Type":"application/json"};
const interpolate=(text:string,values:Record<string,string|number>)=>text.replace(/\{(\w+)\}/g,(match,key:string)=>String(values[key]??match));
const typedFile=(file:File)=>{
  if(file.type&&file.type!=="application/octet-stream"&&file.type!=="audio/mp3"&&file.type!=="audio/vnd.wave")return file;
  const ext=file.name.toLowerCase().split(".").pop()??"";
  const mime:Record<string,string>={png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",gif:"image/gif",mp4:"video/mp4",mov:"video/quicktime",mp3:"audio/mpeg",wav:"audio/wav"};
  return mime[ext]?new File([file],file.name,{type:mime[ext]}):file;
};

export default function BusinessAssets({onSelect,selectedIds=[],canSelect,compact=false,imageOnly=false,wanReferences=false,seedanceReferences=false,onChanged,onDeleted,onUploading}:Props){
  const t=businessAssetsCopy(useLocale());
  const originalOnly = imageOnly || wanReferences;
  const originalParameters = wanReferences ? { wanOriginal: true } : imageOnly ? { originalOnly: true } : {};
  const [config,setConfig]=useState<UploadConfig|null>(null);
  const [catalog,setCatalog]=useState<BusinessAssetRecord[]>([]);
  const [uploads,setUploads]=useState<UploadRecord[]>([]);
  const [loading,setLoading]=useState(true);
  const [uploading,setUploading]=useState(false);
  const [files,setFiles]=useState<File[]>([]);
  const [consent,setConsent]=useState(false);
  const [progress,setProgress]=useState(0);
  const [stage,setStage]=useState<"uploading"|"registering"|"converting">("uploading");
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
  const [deleteTarget,setDeleteTarget]=useState<BusinessAssetDeletion|null>(null);
  const [deleting,setDeleting]=useState(false);
  const [deleteError,setDeleteError]=useState("");
  const deleteLock=useRef(false);
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
    if(imageOnly&&normalized.some(file=>!["image/jpeg","image/png","image/webp"].includes(file.type))){setError("business_asset_upload_invalid");return;}
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
    uploadLock.current=true;setUploading(true);onUploading?.(true);setError("");setNotice("");
    let started=0;
    let interrupted=false;
    try{
      for(const original of files){
        if(!alive.current)break;
        setFileName(original.name);setProgress(0);setStage("uploading");
        let file=original;
        if(wanReferences&&file.type==="image/gif"){
          setStage("converting");
          file=await (await import("@/lib/wanGifToMp4")).wanGifToMp4(file);
        }
        const wanVideo=wanReferences&&file.type.startsWith("video/");
        if(wanVideo){
          try{await (await import("@/lib/wanReferenceVideo")).inspectWanReferenceVideo(file);}
          catch{throw new Error("wan_video_invalid");}
          if(file.size>config.types[file.type].maxBytes)throw new Error("business_asset_upload_too_large");
        }
        if(!alive.current)break;
        setStage("uploading");
        const clientRequestId=fileRequests.current.get(original)??crypto.randomUUID();
        fileRequests.current.set(original,clientRequestId);
        const initialized=await apiUpload({action:"initialize",clientRequestId,name:file.name.slice(0,120),contentType:file.type,size:file.size});
        if(alive.current)rememberUpload(initialized.upload);
        await upload(initialized.pathname,file,{access:"private",handleUploadUrl:"/api/business/provider-assets/upload",contentType:file.type,multipart:file.size>8*1024*1024,clientPayload:JSON.stringify({uploadId:initialized.upload.id}),onUploadProgress:event=>{if(alive.current)setProgress(event.percentage);}});
        started++;
        if(alive.current)setStage("registering");
        const completed=await apiUpload({action:"complete",uploadId:initialized.upload.id,...originalParameters});
        if(!alive.current)break;
        rememberUpload(completed.upload);
        if(["created","unknown","registering"].includes(completed.upload.status)){setError("business_asset_upload_uncertain");interrupted=true;break;}
        if(completed.upload.status==="failed"){setError(completed.upload.errorCode??"business_asset_upload_rejected");interrupted=true;break;}
      }
      if(alive.current&&!interrupted)setNotice(t.uploadFinished);
    }catch(error){if(alive.current)setError(error instanceof Error&&/^[a-z_]{1,64}$/.test(error.message)?error.message:"business_asset_upload_uncertain");}
    finally{
      uploadLock.current=false;
      onUploading?.(false);
      if(alive.current){
        // A file with a recorded upload has its own recovery path. Leave only untouched files queued.
        if(started){
          setFiles(files.slice(started));
          setConsent(false);
          if (!interrupted && started === files.length) {
            const filter = { type: imageOnly ? "image" : "all", status: "all", name: "" };
            setQuery(""); setType(filter.type); setStatus(filter.status);
            void loadCatalog(1, filter);
          } else void loadCatalog(1,committed.current);
          onChanged?.();
        }
        setUploading(false);setFileName("");
      }
    }
  }
  async function recoverUpload(item:UploadRecord){
    if(refreshingId)return;setRefreshingId(item.id);setError("");setNotice("");
    try{const value=await apiUpload({action:"complete",uploadId:item.id,...originalParameters});rememberUpload(value.upload);if(["created","unknown","registering"].includes(value.upload.status))setError("business_asset_upload_uncertain");else if(value.upload.status==="failed")setError(value.upload.errorCode??"business_asset_upload_rejected");else{setNotice(t.uploadFinished);void loadCatalog(1,committed.current);}onChanged?.();}
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
  function askDelete(target:BusinessAssetDeletion){
    setDeleteError("");setDeleteTarget(target);
  }
  async function confirmDelete(){
    if(!deleteTarget||deleteLock.current)return;
    const target=deleteTarget;
    const original=target.scope==="upload";
    deleteLock.current=true;setDeleting(true);setDeleteError("");
    try{
      const response=await fetch(original?"/api/business/provider-assets/upload":`/api/business/provider-assets/${encodeURIComponent(target.id)}`,{
        method:"DELETE",...(original?{headers:HEADERS,body:JSON.stringify({uploadId:target.id})}:{}),
      });
      const body=await response.json().catch(()=>null);
      if(!response.ok||body?.deleted!==true){if(alive.current)setDeleteError(body?.error?.code??"business_asset_delete_failed");return;}
      if(!alive.current)return;
      if(original)setUploads(items=>items.filter(item=>item.id!==target.id));
      else {
        setCatalog(items=>items.filter(item=>item.id!==target.id));
        setUploads(items=>items.map(item=>item.asset?.id===target.id?{...item,asset:undefined,status:item.storageReady?"active":"failed"}:item));
      }
      setDeleteTarget(null);setError("");setNotice(t.deleted);
      onDeleted?.(target);onChanged?.();
      void loadConfig();void loadCatalog();
    }catch{if(alive.current)setDeleteError("business_asset_delete_failed");}
    finally{deleteLock.current=false;if(alive.current)setDeleting(false);}
  }

  const known=new Set(catalog.map(asset=>asset.id));
  const providerMaterials:BusinessAssetRecord[]=catalog.map(asset=>{
    const original=uploads.find(item=>item.asset?.id===asset.id);
    return {...asset,providerReady:asset.status==="active",...(original?{uploadId:original.id,storageReady:original.storageReady}:{})};
  });
  const uploadedMaterials:BusinessAssetRecord[]=uploads.filter(item=>item.storageReady&&(!item.asset||!known.has(item.asset.id))).map(item=>({
    id:`upload:${item.id}`,name:item.name,type:item.type,status:item.status,uploadId:item.id,storageReady:true,providerReady:false,
  }));
  const material=(originalOnly ? [...uploadedMaterials,...providerMaterials] : [...providerMaterials,...uploadedMaterials])
    .filter(asset=>(type==="all"||asset.type===type)&&(!imageOnly||asset.type==="image")&&(status==="all"||asset.status===status||(imageOnly||wanReferences)&&asset.storageReady&&status==="active")&&(!appliedQuery||asset.name.toLowerCase().includes(appliedQuery.toLowerCase())));
  const statusText=(value:string)=>value==="active"?t.active:value==="processing"||value==="registering"?t.processing:value==="created"?t.created:value==="unknown"?t.unknown:t.failed;
  const accept=Object.keys(config?.types??{}).filter(mime=>!imageOnly||["image/jpeg","image/png","image/webp"].includes(mime)).join(",");
  const pendingUploads=uploads.filter(item=>["created","registering","unknown"].includes(item.status)||item.status==="failed"&&!item.storageReady);
  const canDelete=!refreshingId&&!uploading&&!deleting;

  return <section className={`${styles.assets} ${compact?styles.compact:""}`} aria-label={t.title}>
    <div className={styles.uploadPanel} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();queueFiles(Array.from(event.dataTransfer.files));}}>
      <div className={styles.uploadToolbar}>
        <div><strong>{t.upload}</strong><p className={styles.note}>{wanReferences?t.wanFormats:imageOnly?t.imageLimits:t.limits}</p></div>
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
      <details className={styles.help}><summary>{t.uploadHelp}</summary><p>{imageOnly?t.originalImageFormats:t.formats} {t.noGeneration}</p>{!originalOnly&&<p>{t.providerNotice}</p>}</details>
    </div>
    {error&&<p className={styles.error} role="alert">{error==="too_many_files"?t.tooMany:businessAssetsError(t,error)}{error==="credential_required"&&<> <a href="/business?tab=key">{t.keyLink} ↗</a></>}</p>}
    {notice&&<p className={styles.success} role="status">{notice}</p>}
    {!!pendingUploads.length&&<details className={styles.recent}><summary>{t.pendingTitle} · {pendingUploads.length}</summary><ul>{pendingUploads.map(item=><li key={item.id}>
      <span>{item.name}<small>{statusText(item.status)}</small></span>
      <div className={styles.assetActions}>
        {item.status!=="failed"&&<button type="button" className={styles.small} disabled={!!refreshingId||uploading} onClick={()=>void recoverUpload(item)}>{refreshingId===item.id?t.loading:t.recover}</button>}
        {item.status!=="registering"&&<button type="button" className={styles.deleteAsset} disabled={!canDelete} onClick={()=>askDelete({scope:"upload",id:item.id,name:item.name,pending:true})}>{t.deleteUpload}</button>}
      </div>
    </li>)}</ul></details>}
    <div className={styles.libraryHeader}>
      <div className={styles.types} role="group" aria-label={t.source}>{(imageOnly?["image"]:["all","image","video","audio"]).map(value=><button type="button" key={value} aria-pressed={type===value} onClick={()=>{setType(value);void loadCatalog(1,{type:value,status,name:query});}}>{t[value as "all"|"image"|"video"|"audio"]}</button>)}</div>
      <button type="button" className={styles.textButton} disabled={loading||uploading||!!refreshingId} onClick={()=>{void loadConfig();void loadCatalog();}}>{loading?t.loading:t.refresh}</button>
    </div>
    <form className={styles.searchRow} role="search" aria-label={t.search} onSubmit={event=>{event.preventDefault();void loadCatalog(1,{type,status,name:query});}}><input type="search" maxLength={120} aria-label={t.search} placeholder={t.search} value={query} onChange={event=>setQuery(event.target.value)}/><button type="submit" className={styles.small} disabled={loading}>{t.searchButton}</button><select aria-label={t.status} value={status} onChange={event=>{setStatus(event.target.value);void loadCatalog(1,{type,status:event.target.value,name:query});}}><option value="all">{t.allStatus}</option><option value="active">{t.active}</option><option value="processing">{t.processing}</option><option value="failed">{t.failed}</option></select></form>
    {catalogError&&<p className={styles.error} role="alert">{businessAssetsError(t,catalogError)}{catalogError==="credential_required"&&<> <a href="/business?tab=key">{t.keyLink} ↗</a></>}</p>}
    {!material.length&&!loading&&!catalogError?<div className={styles.empty}><h3>{appliedQuery||status!=="all"||type!=="all"&&!imageOnly?t.noResults:t.empty}</h3></div>:<div className={styles.grid} aria-busy={loading}>{material.map(asset=>{
      const selected=selectedIds.includes(asset.id)||!!asset.uploadId&&selectedIds.includes(asset.uploadId);
      const available=imageOnly||wanReferences?!!asset.uploadId&&!!asset.storageReady:!!asset.providerReady||seedanceReferences&&asset.type==="image"&&!!asset.storageReady;
      const disabled=!selected&&(!available||canSelect?.(asset)===false);
      const disabledReason=wanReferences&&!asset.uploadId?t.wanOriginalRequired:imageOnly&&!asset.uploadId?t.nativeRequired:!available?t.readyOnly:t.capacity;
      return <article className={styles.card} key={asset.id} data-selected={selected}>
        <BusinessAssetPreview asset={asset} copy={t}/>
        <div className={styles.cardBody}><h3 title={asset.name}>{asset.name}</h3><p className={styles.assetStatus} data-status={asset.storageReady&&(imageOnly||wanReferences)?"active":asset.status}>{asset.storageReady&&(imageOnly||wanReferences)?t.privateReady:statusText(asset.status)}</p><small>{asset.uploadId?t.native:t.provider}</small>
        {onSelect&&<button type="button" className={styles.selectButton} disabled={disabled} aria-pressed={selected} title={disabled?disabledReason:asset.name} onClick={()=>onSelect(asset)}>{selected?t.selected:imageOnly&&asset.storageReady?t.original:t.select}<span aria-hidden="true">{selected?"✓":"＋"}</span></button>}
        {!asset.id.startsWith("upload:")&&asset.status!=="active"&&<button type="button" className={styles.textButton} disabled={!!refreshingId||uploading} onClick={()=>void refreshAsset(asset)}>{refreshingId===asset.id?t.loading:t.refreshOne}</button>}
        {onSelect&&disabled&&<p className={styles.disabledReason}>{disabledReason}</p>}
        {asset.storageReady&&!asset.providerReady&&!imageOnly&&!wanReferences&&<p className={styles.disabledReason}>{t.storageOnly}</p>}
        <div className={`${styles.assetActions} ${styles.cardActions}`}>
          {asset.uploadId&&asset.status!=="processing"&&asset.status!=="registering"&&<button type="button" className={styles.deleteAsset} disabled={!canDelete} onClick={()=>askDelete({scope:"upload",id:asset.uploadId!,name:asset.name})}>{t.deleteOriginal}</button>}
          {!asset.id.startsWith("upload:")&&<button type="button" className={styles.deleteAsset} disabled={!canDelete} onClick={()=>askDelete({scope:"provider",id:asset.id,name:asset.name})}>{t.deleteProvider}</button>}
        </div>
        </div>
      </article>;
    })}</div>}
    {(material.length>0||page<totalPages&&!catalogError)&&<div className={styles.footer}><p className={styles.note} role="status">{interpolate(t.count,{count:material.length})}</p>{page<totalPages&&!catalogError&&<button type="button" className={styles.small} disabled={loading} onClick={()=>void loadCatalog(page+1)}>{loading?t.loading:t.more}</button>}</div>}
    {deleteTarget&&<BusinessDialog title={deleteTarget.pending?t.deleteUpload:deleteTarget.scope==="upload"?t.deleteOriginal:t.deleteProvider} className={styles.deleteDialog} busy={deleting} onClose={()=>setDeleteTarget(null)}>
      <p className={styles.deleteName}>{deleteTarget.name}</p>
      <p>{deleteTarget.pending?t.deleteUploadHelp:deleteTarget.scope==="upload"?t.deleteOriginalHelp:t.deleteProviderHelp}</p>
      {deleteError&&<p className={styles.error} role="alert">{businessAssetsError(t,deleteError)}</p>}
      <div className={styles.assetActions}>
        <button type="button" className={styles.small} autoFocus disabled={deleting} onClick={()=>setDeleteTarget(null)}>{t.cancelDelete}</button>
        <button type="button" className={styles.deleteAsset} disabled={deleting} onClick={()=>void confirmDelete()}>{deleting?t.deleting:t.confirmDelete}</button>
      </div>
    </BusinessDialog>}
  </section>;
}
