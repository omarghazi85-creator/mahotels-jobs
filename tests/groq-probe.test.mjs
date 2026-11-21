import test from 'node:test';
import assert from 'node:assert/strict';
import {runGroqProbe} from '../src/groq-probe.mts';
const secret='p'.repeat(64), groq='sensitive-groq-test-key';
const config={GROQ_PROBE_ENABLED:'true',JOBS_EMERGENCY_STOP:'true',ENABLE_COLLECTION:'false',ENABLE_WP_SYNC:'false',GROQ_PROBE_TOKEN:secret,GROQ_API_KEY:groq};
const env=k=>config[k]??'';
const store=()=>{let used=false; return {set:async()=>used?{modified:false}:(used=true,{modified:true})}};
const request=(token=secret)=>{const f=new FormData(); f.set('authorization',new File([token],'auth.txt')); return new Request('https://example.com',{method:'POST',body:f});};
test('safe stop and authentication gates refuse to call external service',async()=>{
 let calls=0; const send=async()=>{calls++;throw Error('must not run')};
 assert.equal((await runGroqProbe(request('wrong'),env,store(),send)).status,403);
 assert.equal((await runGroqProbe(request(),k=>k==='ENABLE_COLLECTION'?'true':env(k),store(),send)).status,503);
 assert.equal((await runGroqProbe(new Request('https://example.com'),env,store(),send)).status,405);
 assert.equal(calls,0);
});
test('valid request makes one translation request and does not disclose secret',async()=>{
 let calls=0; const blobs=store();
 const send=async(_url,opts)=>{calls++; assert.equal(opts.headers.Authorization,'Bearer '+groq); return Response.json({choices:[{message:{content:JSON.stringify({title:'موظف استقبال',description:'يرحب بالضيوف ويساعد في تسجيل الوصول.',requirements:'',extra:'ignored'})}}]})};
 const first=await runGroqProbe(request(),env,blobs,send), data=await first.text();
 assert.equal(first.status,200); assert.match(data,/موظف استقبال/); assert.ok(!data.includes(groq)); assert.ok(!data.includes(secret)); assert.ok(!data.includes('ignored'));
 const second=await runGroqProbe(request(),env,blobs,send); assert.equal(second.status,409);assert.equal(calls,1);
});
test('provider failure is sanitized, consumes one attempt and returns no credentials',async()=>{
 let calls=0; const blobs=store(); const send=async()=>{calls++; throw Error(groq)};
 const first=await runGroqProbe(request(),env,blobs,send); assert.equal(first.status,502); assert.ok(!(await first.text()).includes(groq));
 assert.equal((await runGroqProbe(request(),env,blobs,send)).status,409); assert.equal(calls,1);
});
