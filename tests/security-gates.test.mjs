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

test('WP duplicate audit scans every page and canonicalizes source application URLs', async () => {
  const {auditAll}=await import('../netlify/functions/publish.mts');
  const calls=[];
  globalThis.fetch=async (url) => {
    const u=new URL(url);
    const page=Number(u.searchParams.get('page'));
    calls.push(page);
    const pages={
      1:[{id:45106,content:{raw:'<a href="https://jobs.example.org/apply?id=55&amp;utm_source=site">التقديم</a>'}}],
      2:[{id:45059,content:{raw:'<p>draft</p>'},meta:{job_source_url:'https://careers.example.org/job/P1-1234'}}]
    };
    return new Response(JSON.stringify(pages[page]??[]),{
      status:200,headers:{'X-WP-TotalPages':'2','Content-Type':'application/json'}
    });
  };
  try {
    const result=await auditAll(new URL('https://mahotels.net/wp-json/wp/v2/ma_hotel_job'),{});
    assert.deepEqual(calls,[1,2]);
    assert.equal(result.checked,2);
    assert.ok(result.known.has('https://jobs.example.org/apply?id=55'));
    assert.ok(result.known.has('https://careers.example.org/job/P1-1234'));
  } finally {globalThis.fetch=forbiddenFetch}
});
test('WP duplicate audit stops rather than proceeding with incomplete or malformed pages', async () => {
  const {auditAll}=await import('../netlify/functions/publish.mts');
  const endpoint=new URL('https://mahotels.net/wp-json/wp/v2/ma_hotel_job');
  globalThis.fetch=async()=>new Response('[{"id":7}]',{status:200,headers:{'X-WP-TotalPages':'1'}});
  try {await assert.rejects(auditAll(endpoint,{}),/Audit content missing/)}
  finally {globalThis.fetch=forbiddenFetch}
});

test('collector refuses GET even with an authorized dispatch token', async () => {
  vars.clear();
  const credential='m'.repeat(64);
  vars.set('JOBS_EMERGENCY_STOP','false');
  vars.set('ENABLE_COLLECTION','true');
  vars.set('GROQ_API_KEY','fake-for-test-only');
  vars.set('INTERNAL_DISPATCH_TOKEN',credential);
  const response=await collect(new Request('https://example.org/.netlify/functions/collect',{
    headers:{'x-mahotels-dispatch-token':credential}
  }));
  assert.equal(response,undefined);
  // The mocked fetch would throw if any upstream work was attempted.
});

test('health refuses false-ready status when switches enabled but credentials missing', async () => {
  vars.clear();
  vars.set('JOBS_EMERGENCY_STOP','false');
  vars.set('ENABLE_COLLECTION','true');
  vars.set('ENABLE_WP_SYNC','true');
  vars.set('WP_DRAFT_ONLY','true');
  vars.set('WP_JOB_SCHEMA_VERIFIED','true');
  vars.set('WP_SITE_URL','https://mahotels.net');
  vars.set('WP_JOB_REST_BASE','ma_hotel_job');
  const response=await health(new Request('https://example.org/.netlify/functions/health'));
  const payload=await response.json();
  assert.equal(payload.collection,'disabled');
  assert.equal(payload.wordpress_sync,'disabled');
  assert.ok(!JSON.stringify(payload).includes('INTERNAL_DISPATCH_TOKEN'));
});
test('health reports controls as enabled only with all required credentials present', async () => {
  vars.clear();
  for (const [key,value] of Object.entries({
    JOBS_EMERGENCY_STOP:'false', ENABLE_COLLECTION:'true', ENABLE_WP_SYNC:'true',
    WP_DRAFT_ONLY:'true',WP_JOB_SCHEMA_VERIFIED:'true',WP_SITE_URL:'https://mahotels.net',
    WP_JOB_REST_BASE:'ma_hotel_job',GROQ_API_KEY:'fake-test-key',
    INTERNAL_DISPATCH_TOKEN:'x'.repeat(64), WP_USERNAME:'test-user',WP_APP_PASSWORD:'test-only-app-password'
  })) vars.set(key,value);
  const response=await health(new Request('https://example.org/.netlify/functions/health'));
  const payload=await response.json();
  assert.equal(payload.collection,'enabled');
  assert.equal(payload.wordpress_sync,'enabled');
  assert.ok(!JSON.stringify(payload).includes('test-only-app-password'));
  vars.clear();
});
test.after(()=>{
  globalThis.fetch=savedFetch;
  if (savedNetlify === undefined) delete globalThis.Netlify;
  else globalThis.Netlify=savedNetlify;
});
