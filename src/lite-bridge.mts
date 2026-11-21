import { validateApplyUrl } from './sources.mts';
import type {SavedJob} from './wordpress.mts';

type Fetch = typeof fetch;
const providers = new Set(['accor','radisson','marriott','rotana']);
const allowed:Record<string,string[]> = {
  accor:['api.smartrecruiters.com','jobs.smartrecruiters.com'],
  radisson:['api.smartrecruiters.com','jobs.smartrecruiters.com'],
  marriott:['careers.marriott.com'],
  rotana:['careers.rotana.com','apply.workable.com','rotana-hotels.workable.com','www.workable.com']
};
function dateOnly(value?:string) {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value.slice(0,10)+'T00:00:00.000Z').toISOString().slice(0,10)!==value.slice(0,10)) throw Error('Invalid source date');
  return value.slice(0,10);
}
export function bridgePayload(job:SavedJob) {
  const source=job.source, url=validateApplyUrl(job.sourceUrl);
  if (!providers.has(source) || !/^[A-Za-z0-9._-]{1,160}$/.test(job.originalId) || !url ||
      !allowed[source].includes(new URL(url).hostname.toLowerCase()) ||
      !job.company?.trim() || !job.city?.trim() || !job.arabic_title?.trim()) throw Error('Invalid bridge fields');
  const posted_on=dateOnly(job.postedAt), expires_on=dateOnly(job.expiresAt);
  return {source,original_id:job.originalId,source_url:url,company:job.company.trim(),city:job.city.trim(),
    role:job.arabic_title.trim(),...(posted_on?{posted_on}:{}),...(expires_on?{expires_on}:{})};
}
async function requestJson(fetcher:Fetch,url:URL,headers:Record<string,string>,init:RequestInit={}) {
  const response=await fetcher(url,{...init,headers:{...headers,...init.headers},signal:AbortSignal.timeout(18000)});
  if (!response.ok) throw Error('Lite bridge HTTP '+response.status);
  const body:unknown=await response.json();
  if (!body || typeof body!=='object' || Array.isArray(body)) throw Error('Invalid Lite bridge response');
  return body as Record<string,unknown>;
}
/** Fail closed if legacy identity lookup is unavailable or returns an ambiguous shape. */
export async function sourceExists(site:string,headers:Record<string,string>,job:SavedJob,fetcher:Fetch=fetch) {
  const p=bridgePayload(job);
  // The legacy importer may store the source page or the original application
  // URL. Query both exact values; provider identity is checked by each request.
  const apply=validateApplyUrl(job.applyUrl ?? job.apply_url);
  if (!apply) throw Error('Missing application URL');
  for (const source_url of new Set([p.source_url,apply])) {
    const result=await requestJson(fetcher,new URL('/wp-json/mahotels-jobs/v1/source-exists',site),headers,
      {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:p.source,original_id:p.original_id,source_url})});
    if (typeof result.exists!=='boolean') throw Error('Invalid source-exists response');
    if (result.exists) return true;
  }
  return false;
}
/** Never retry writes; independently read fields back before treating the draft as sent. */
export async function writeAndVerifyFields(site:string,headers:Record<string,string>,id:number,job:SavedJob,fetcher:Fetch=fetch) {
  if (!Number.isSafeInteger(id) || id<1) throw Error('Invalid draft id');
  const payload=bridgePayload(job), url=new URL('/wp-json/mahotels-jobs/v1/draft-fields/'+id,site);
  await requestJson(fetcher,url,headers,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const result=await requestJson(fetcher,url,headers);
  if (result.id!==id || result.status!=='draft' || !result.fields || typeof result.fields!=='object' || Array.isArray(result.fields)) throw Error('Unverified draft fields');
  const fields=result.fields as Record<string,unknown>;
  const names:Record<string,string>={accor:'AccorHotel',radisson:'RHG',marriott:'Marriott',rotana:'Rotana'};
  const expected:Record<string,string>={source_id:names[payload.source]+':'+payload.original_id,source_url:payload.source_url,company:payload.company,city:payload.city,role:payload.role,ar_ready:'0',posted_on:payload.posted_on??'',expires_on:payload.expires_on??'',verified_on:''};
  for(const [key,value] of Object.entries(expected)) if(fields[key]!==value) throw Error('Unverified draft field: '+key);
}
export type ServiceDraft = {id:number;status:string;slug:string;title:string;content:string;country_ids:number[]};
/** Reveal only existence for every status, including orphaned/trash drafts. */
export async function slugExists(site:string,headers:Record<string,string>,slug:string,fetcher:Fetch=fetch) {
  if (!/^ma-jobs-[a-f0-9]{32}$/.test(slug)) throw Error('Invalid generated slug');
  const result=await requestJson(fetcher,new URL('/wp-json/mahotels-jobs/v1/service-drafts/slug-exists',site),headers,
    {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug})});
  if (typeof result.exists!=='boolean') throw Error('Invalid slug check response');
  return result.exists;
}
/** A timeout or invalid response is ambiguous: the caller must not retry create. */
export async function createServiceDraft(site:string,headers:Record<string,string>,draft:{title:string;content:string;slug:string;ma_job_country:number[]},fetcher:Fetch=fetch) {
  if (draft.ma_job_country.length!==1 || !Number.isSafeInteger(draft.ma_job_country[0])) throw Error('Invalid country');
  const result=await requestJson(fetcher,new URL('/wp-json/mahotels-jobs/v1/service-drafts',site),headers,
    {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:draft.title,content:draft.content,slug:draft.slug,country_id:draft.ma_job_country[0]})});
  if (!Number.isSafeInteger(result.id) || Number(result.id)<1 || result.status!=='draft' || result.slug!==draft.slug) throw Error('Draft creation unverified');
  return Number(result.id);
}
export async function readServiceDraft(site:string,headers:Record<string,string>,id:number,fetcher:Fetch=fetch):Promise<ServiceDraft> {
  if (!Number.isSafeInteger(id)||id<1) throw Error('Invalid draft id');
  const result=await requestJson(fetcher,new URL('/wp-json/mahotels-jobs/v1/service-drafts/'+id,site),headers);
  if (result.id!==id || result.status!=='draft' || typeof result.slug!=='string' || typeof result.title!=='string' || typeof result.content!=='string' || !Array.isArray(result.country_ids) || !result.country_ids.every(Number.isSafeInteger)) throw Error('Invalid service draft response');
  return result as ServiceDraft;
}
