import {pathToFileURL} from 'node:url';

export async function groqBuildProbe(env, send) {
  if (env.CONTEXT !== 'production' ||
      env.JOBS_EMERGENCY_STOP !== 'true' || env.ENABLE_COLLECTION !== 'false' ||
      env.ENABLE_WP_SYNC !== 'false') return {status:'skipped'};
  if (!env.GROQ_API_KEY) return {status:'missing-key'};
  const input = {title:'Front Desk Agent',description:'Welcome guests and assist with check-in.',requirements:''};
  try {
    const response = await send('https://api.groq.com/openai/v1/chat/completions', {
      method:'POST',headers:{Authorization:'Bearer '+env.GROQ_API_KEY,'Content-Type':'application/json'},
      signal:AbortSignal.timeout(25000),
      body:JSON.stringify({model:'openai/gpt-oss-120b',temperature:0.1,max_completion_tokens:1000,
        response_format:{type:'json_schema',json_schema:{name:'hotel_job_arabic',strict:true,
          schema:{type:'object',additionalProperties:false,properties:{title:{type:'string'},description:{type:'string'},requirements:{type:'string'}},required:['title','description','requirements']}}},
        messages:[{role:'system',content:'Translate this hotel job into accurate formal Arabic. Preserve every factual condition and distinguish preferred from required. Do not invent salaries, nationality, credentials, dates, hotel name, experience, or other requirements. Return JSON according to the schema.'},{role:'user',content:JSON.stringify(input)}]})
    });
    if (!response.ok) return {status:'provider-error',http:response.status};
    const data = await response.json();
    const result = JSON.parse(data.choices?.[0]?.message?.content ?? 'null');
    if (!result || typeof result.title!=='string' || !result.title.trim() ||
        typeof result.description!=='string' || !result.description.trim() || typeof result.requirements!=='string') return {status:'invalid-translation'};
    // Bound and report only the three expected fields, not provider headers or body.
    if ([result.title,result.description,result.requirements].some(x=>x.length>500)) return {status:'invalid-translation'};
    return {status:'ok',sample:'synthetic',title:result.title,description:result.description,requirements:result.requirements};
  } catch { return {status:'request-failed'}; }
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const result=await groqBuildProbe(process.env,fetch);
  console.log('MAHOTELS_GROQ_DIAGNOSTIC',JSON.stringify(result));
}
