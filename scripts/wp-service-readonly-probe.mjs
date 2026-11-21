import {pathToFileURL} from 'node:url';
export async function probe(env,send){
  if(env.CONTEXT!=='production'||env.JOBS_EMERGENCY_STOP!=='true'||env.ENABLE_COLLECTION!=='false'||env.ENABLE_WP_SYNC!=='false'||env.WP_DRAFT_ONLY!=='true')return {status:'skipped'};
  if(env.WP_SITE_URL!=='https://mahotels.net'||!env.WP_USERNAME||!env.WP_APP_PASSWORD)return {status:'missing-configuration'};
  const headers={Authorization:'Basic '+Buffer.from(env.WP_USERNAME+':'+env.WP_APP_PASSWORD,'utf8').toString('base64'),Accept:'application/json'};
  async function get(path,method='GET',body){const opts={method,headers:{...headers,...(body?{'Content-Type':'application/json'}:{})},signal:AbortSignal.timeout(12000),redirect:'error',...(body?{body:JSON.stringify(body)}:{})};let response=await send(new URL(path,env.WP_SITE_URL),opts);let data;try{data=await response.json()}catch{data=null};return {http:response.status,data};}
  try{
    const me=await get('/wp-json/wp/v2/users/me?context=edit');
    const caps=(me.data && typeof me.data.capabilities==='object')?me.data.capabilities:{};
    const slug=await get('/wp-json/mahotels-jobs/v1/service-drafts/slug-exists','POST',{slug:'ma-jobs-'+'f'.repeat(32)});
    const source=await get('/wp-json/mahotels-jobs/v1/source-exists','POST',{source:'marriott',original_id:'26144054',source_url:'https://careers.marriott.com/spa-receptionist-saudi-only/job/P1-7614173-0'});
    const invalidRead=await get('/wp-json/mahotels-jobs/v1/service-drafts/999999999');
    return {status:'completed',user:{http:me.http,username_match:me.data?.username===env.WP_USERNAME,service_cap:caps.mah_jobs_service===true,edit_posts:caps.edit_posts===true,publish_posts:caps.publish_posts===true},slug_check:{http:slug.http,valid:typeof slug.data?.exists==='boolean',exists:typeof slug.data?.exists==='boolean'?slug.data.exists:null},source_check:{http:source.http,valid:typeof source.data?.exists==='boolean',exists:typeof source.data?.exists==='boolean'?source.data.exists:null},foreign_draft_read:{http:invalidRead.http}};
  }catch{return {status:'request-failed'};}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log('MAHOTELS_WP_READONLY_DIAGNOSTIC',JSON.stringify(await probe(process.env,fetch)));
