import test from 'node:test';
import assert from 'node:assert/strict';

const savedFetch = globalThis.fetch;
const savedNetlify = globalThis.Netlify;
const forbiddenFetch = async () => { throw Error('No external network requests are allowed in security gate tests'); };
globalThis.fetch = forbiddenFetch;
const vars = new Map();
globalThis.Netlify = {env:{get:(name)=>vars.get(name)}};

const {default: publish} = await import('../netlify/functions/publish.mts');
const {default: collect} = await import('../netlify/functions/collect.mts');
const {default: health} = await import('../netlify/functions/health.mts');

test('WordPress write endpoint is fail-closed with no configuration', async () => {
  vars.clear();
  const result = await publish(new Request('https://example.org/.netlify/functions/publish',{method:'POST'}));
  assert.equal(result.status,503);
  assert.equal(await result.text(),'Disabled');
});
test('WordPress endpoint rejects unauthorized requests after flags enabled', async () => {
  vars.clear();
  vars.set('JOBS_EMERGENCY_STOP','false');
  vars.set('ENABLE_WP_SYNC','true');
  vars.set('WP_DRAFT_ONLY','true');
  vars.set('WP_JOB_SCHEMA_VERIFIED','true');
  vars.set('INTERNAL_DISPATCH_TOKEN','x'.repeat(64));
  const result = await publish(new Request('https://example.org/.netlify/functions/publish',{method:'POST'}));
  assert.equal(result.status,403);
});
test('WordPress endpoint refuses GET even before configuration lookup', async () => {
  vars.clear();
  const response = await publish(new Request('https://example.org/.netlify/functions/publish'));
  assert.equal(response.status,405);
});
test('background collector rejects unauthorized calls without any upstream request', async () => {
  vars.clear();
  const response = await collect(new Request('https://example.org/.netlify/functions/collect',{method:'POST'}));
  assert.equal(response,undefined);
});
test('read-only health never reveals secrets or internal tokens', async () => {
  vars.clear();
  vars.set('INTERNAL_DISPATCH_TOKEN','VERY_SECRET_PLACEHOLDER');
  vars.set('GROQ_API_KEY','SECRET_API_KEY');
  const response = await health(new Request('https://example.org/.netlify/functions/health'));
  assert.equal(response.status,200);
  const payload = await response.text();
  assert.equal(JSON.parse(payload).status,'safe-stop');
  assert.ok(!payload.includes('SECRET'));
  assert.equal(response.headers.get('Cache-Control'),'no-store');
});
test('collector requires Groq secret before claiming daily quota or fetching sources', async () => {
  vars.clear();
  const credential = 'x'.repeat(64);
  vars.set('JOBS_EMERGENCY_STOP','false');
  vars.set('ENABLE_COLLECTION','true');
  vars.set('INTERNAL_DISPATCH_TOKEN',credential);
  const response = await collect(new Request('https://example.org/.netlify/functions/collect',{
    method:'POST',headers:{'x-mahotels-dispatch-token':credential}
  }));
  assert.equal(response,undefined);
  // No external calls: the test replaces fetch with a throwing function.
});
test.after(()=>{
  globalThis.fetch=savedFetch;
  if (savedNetlify === undefined) delete globalThis.Netlify;
  else globalThis.Netlify=savedNetlify;
});
