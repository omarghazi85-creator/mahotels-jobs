import test from 'node:test';
import assert from 'node:assert/strict';
import {groqBuildProbe} from '../scripts/groq-build-probe.mjs';
const base={CONTEXT:'production',JOBS_EMERGENCY_STOP:'true',ENABLE_COLLECTION:'false',ENABLE_WP_SYNC:'false',GROQ_API_KEY:'test-only-secret'};
test('only production in safe stop calls the provider',async()=>{
  let calls=0;const send=async()=>{calls++;throw Error('must not call')};
  for(const change of [{CONTEXT:'deploy-preview'},{JOBS_EMERGENCY_STOP:'false'},{ENABLE_COLLECTION:'true'},{ENABLE_WP_SYNC:'true'}]) assert.equal((await groqBuildProbe({...base,...change},send)).status,'skipped');
  assert.equal(calls,0);
});
test('one request uses correct key without displaying credentials',async()=>{
  let calls=0;const result=await groqBuildProbe(base,async(url,options)=>{calls++;assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');assert.equal(options.headers.Authorization,'Bearer test-only-secret');return Response.json({choices:[{message:{content:JSON.stringify({title:'موظف استقبال',description:'يرحب بالضيوف ويساعد في تسجيل الوصول',requirements:''})}}]})});
  assert.equal(result.status,'ok'); assert.equal(calls,1); assert.ok(!JSON.stringify(result).includes('test-only-secret'));
});
test('provider and network errors are sanitized without leaking secrets',async()=>{
  const first=await groqBuildProbe(base,async()=>new Response('private details',{status:401}));assert.deepEqual(first,{status:'provider-error',http:401});
  const second=await groqBuildProbe(base,async()=>{throw Error('test-only-secret')});assert.deepEqual(second,{status:'request-failed'});
});
