import {pathToFileURL} from 'node:url';
import {parseMarriottJob} from '../src/marriott.mts';
export async function run(env,send) {
  if (env.CONTEXT!=='production' || env.JOBS_EMERGENCY_STOP!=='true' || env.ENABLE_COLLECTION!=='false' || env.ENABLE_WP_SYNC!=='false') return {status:'skipped'};
  if (!env.GROQ_API_KEY) return {status:'missing-key'};
  const url='https://careers.marriott.com/spa-receptionist-saudi-only/job/P1-7614173-0';
  try {
    const source=await send(url,{signal:AbortSignal.timeout(12000)});
    if (!source.ok) return {status:'source-http',http:source.status};
    const html=await source.text(); const job=parseMarriottJob(html,url);
    if (!job) return {status:'source-unparseable'};
    if (job.expiresAt && Date.parse(job.expiresAt)<=Date.now()) return {status:'source-expired'};
    if (job.description.length>10000 || (job.requirements?.length??0)>4000) return {status:'source-too-long'};
    const r=await send('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',headers:{Authorization:'Bearer '+env.GROQ_API_KEY,'Content-Type':'application/json'},signal:AbortSignal.timeout(25000),
      body:JSON.stringify({model:'openai/gpt-oss-120b',temperature:0.1,max_completion_tokens:4000,
       response_format:{type:'json_schema',json_schema:{name:'hotel_job_arabic',strict:true,schema:{type:'object',additionalProperties:false,properties:{title:{type:'string'},description:{type:'string'},requirements:{type:'string'}},required:['title','description','requirements']}}},
       messages:[{role:'system',content:'Translate this hotel job into accurate formal Arabic. Preserve every factual condition and distinguish preferred from required. Do not invent salaries, nationality, credentials, dates, hotel name, experience, or other requirements. Return JSON according to the schema.'},{role:'user',content:JSON.stringify({title:job.title,description:job.description,requirements:job.requirements??''})}]})});
    if (!r.ok) return {status:'groq-http',http:r.status};
    const data=await r.json(); let tr=JSON.parse(data.choices?.[0]?.message?.content??'null');
    if (!tr || typeof tr.title!=='string' || !tr.title.trim() || typeof tr.description!=='string' || !tr.description.trim() || typeof tr.requirements!=='string' || [tr.title,tr.description,tr.requirements].some(x=>x.length>15000)) return {status:'invalid-translation'};
    return {status:'ok',job:{title:job.title,company:job.company,city:job.city,country:job.country,sourceUrl:job.sourceUrl,applyUrl:job.applyUrl,originalDescription:job.description,originalRequirements:job.requirements??'',postedAt:job.postedAt??null,expiresAt:job.expiresAt??null},translation:{title:tr.title,description:tr.description,requirements:tr.requirements}};
  } catch {return {status:'request-failed'};}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) console.log('MAHOTELS_REAL_JOB_DIAGNOSTIC',JSON.stringify(await run(process.env,fetch)));
