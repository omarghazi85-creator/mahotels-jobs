import { timingSafeEqual } from 'node:crypto';
type Store = {set:(key:string,value:string,options:{onlyIfNew:true})=>Promise<{modified:boolean}>};
type Env = (name:string)=>string;
const textResponse = (body:unknown,status:number) => new Response(JSON.stringify(body), {status, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function sameSecret(a:string,b:string) {
  const x=Buffer.from(a),y=Buffer.from(b);
  return x.length===y.length && x.length>=32 && timingSafeEqual(x,y);
}
/** Temporary diagnostic: one synthetic translation, no WordPress or collector calls. */
export async function runGroqProbe(request:Request, env:Env, store:Store, fetcher:typeof fetch) {
  if (request.method!=='POST') return textResponse({error:'method'},405);
  if (env('GROQ_PROBE_ENABLED')!=='true' || env('JOBS_EMERGENCY_STOP')!=='true' ||
      env('ENABLE_COLLECTION')!=='false' || env('ENABLE_WP_SYNC')!=='false')
    return textResponse({error:'safe_stop_required'},503);
  if (Number(request.headers.get('content-length')||'0')>8192) return textResponse({error:'request_size'},413);
  let supplied='';
  try {
    const form=await request.formData();
    const file=form.get('authorization');
    if (!(file instanceof File) || file.size>256) return textResponse({error:'forbidden'},403);
    supplied=(await file.text()).trim();
  } catch {return textResponse({error:'forbidden'},403)}
  if (!sameSecret(supplied,env('GROQ_PROBE_TOKEN'))) return textResponse({error:'forbidden'},403);
  const key=env('GROQ_API_KEY');
  if (!key) return textResponse({error:'groq_not_configured'},503);
  const claim=await store.set('groq-diagnostic-20261121-v1','claimed',{onlyIfNew:true});
  if (!claim.modified) return textResponse({error:'already_attempted'},409);
  const input={title:'Front Desk Agent',description:'Welcome guests and assist with check-in.',requirements:''};
  try {
    const response=await fetcher('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
      signal:AbortSignal.timeout(25000),
      body:JSON.stringify({model:'openai/gpt-oss-120b',temperature:0.1,max_completion_tokens:1000,
        response_format:{type:'json_schema',json_schema:{name:'hotel_job_arabic',strict:true,
          schema:{type:'object',additionalProperties:false,properties:{title:{type:'string'},description:{type:'string'},requirements:{type:'string'}},required:['title','description','requirements']}}},
        messages:[{role:'system',content:'Translate this hotel job into accurate formal Arabic. Preserve every factual condition and distinguish preferred from required. Do not invent salaries, nationality, credentials, dates, hotel name, experience, or other requirements. Return JSON according to the schema.'},
          {role:'user',content:JSON.stringify(input)}]})
    });
    if (!response.ok) return textResponse({error:'groq_http',http_status:response.status},502);
    const data=await response.json() as {choices?:Array<{message?:{content?:string}}>};
    const result=JSON.parse(data.choices?.[0]?.message?.content ?? 'null') as Record<string,unknown>|null;
    if (!result || typeof result.title!=='string' || !result.title.trim() ||
        typeof result.description!=='string' || !result.description.trim() || typeof result.requirements!=='string')
      return textResponse({error:'invalid_translation'},502);
    return textResponse({status:'ok',sample:'synthetic',input,translation:{title:result.title,description:result.description,requirements:result.requirements}},200);
  } catch {return textResponse({error:'groq_request_failed'},502)}
}
