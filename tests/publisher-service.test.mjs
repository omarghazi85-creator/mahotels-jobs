import test from 'node:test';import assert from 'node:assert/strict';
import {handlePublish} from '../netlify/functions/publish.mts';
const oldNetlify=globalThis.Netlify, oldFetch=globalThis.fetch;
const key='a'.repeat(64),token='z'.repeat(64),slug='ma-jobs-'+key.slice(0,32);
const job={key,source:'marriott',originalId:'26144054',title:'Spa Receptionist',company:'Marriott',city:'Riyadh',country:'Saudi Arabia',sourceUrl:'https://careers.marriott.com/job/test',applyUrl:'https://example.com/apply?id=12&utm_source=site',arabic_title:'موظف استقبال',arabic_description:'استقبال الضيوف',state:'ready'};
function fixture() {
  const maps=new Map();let serial=0;
  function store(name){if(maps.has(name))return maps.get(name);const rows=new Map();const x={rows,
    async *list(){yield {blobs:[...rows.keys()].map(key=>({key}))}},
    async get(k){return rows.get(k)?.data??null},async getWithMetadata(k){const v=rows.get(k);return v?{data:v.data,etag:v.etag}:null},
    async setJSON(k,data,opts={}){const v=rows.get(k);if((opts.onlyIfNew&&v)||(opts.onlyIfMatch&&opts.onlyIfMatch!==v?.etag))return {modified:false};const etag=String(++serial);rows.set(k,{data,etag});return {modified:true,etag}}
  };maps.set(name,x);return x;}
  store('mahotels-jobs-v1').rows.set(key,{data:job,etag:'seed'});
  const vars={JOBS_EMERGENCY_STOP:'false',ENABLE_WP_SYNC:'true',WP_DRAFT_ONLY:'true',WP_JOB_SCHEMA_VERIFIED:'true',WP_LEGACY_AUDIT_VERIFIED:'true',INTERNAL_DISPATCH_TOKEN:token,WP_SITE_URL:'https://mahotels.net',WP_USERNAME:'fixture_service',WP_APP_PASSWORD:'test-only'};
  let postCount=0, fields={},draft;
  const fetcher=async(url,opts={})=>{const p=new URL(url).pathname;const method=opts.method??'GET';assert.ok(opts.headers.Authorization.startsWith('Basic '));
    if(p.endsWith('/slug-exists')||p.endsWith('/source-exists'))return Response.json({exists:false});
    if(p.endsWith('/service-drafts')&&method==='POST'){postCount++;draft=JSON.parse(opts.body);return Response.json({id:33,status:'draft',slug:draft.slug},{status:201})}
    if(p.endsWith('/draft-fields/33')&&method==='POST'){const b=JSON.parse(opts.body);fields={source_id:'Marriott:'+b.original_id,source_url:b.source_url,company:b.company,city:b.city,role:b.role,posted_on:b.posted_on??'',expires_on:b.expires_on??'',verified_on:'',ar_ready:'0'};return Response.json({id:33,status:'draft',fields})}
    if(p.endsWith('/draft-fields/33'))return Response.json({id:33,status:'draft',fields});
    if(p.endsWith('/service-drafts/33'))return Response.json({id:33,status:'draft',slug:draft.slug,title:draft.title,content:draft.content,country_ids:[draft.country_id]});
    throw Error('Unexpected route '+p);
  };
  return {store,vars,fetcher,maps,getPostCount:()=>postCount};
}
const req=()=>new Request('https://example.com/publish',{method:'POST',headers:{'x-mahotels-dispatch-token':token}});
test('service draft flow verifies metadata and cannot exceed one first test',async()=>{const f=fixture();globalThis.Netlify={env:{get:k=>f.vars[k]}};globalThis.fetch=f.fetcher;try{const r=await handlePublish(req(),f.store);assert.equal(r.status,200);assert.equal((await r.json()).id,33);assert.equal(f.getPostCount(),1);assert.equal((await f.store('mahotels-jobs-v1').get(key)).state,'sent');assert.equal((await f.store('mahotels-jobs-one-draft-claim-v1').get('first-ever-test-draft')).state,'verified');assert.equal(f.store('mahotels-jobs-daily-writes-v1').rows.size,1);}finally{globalThis.Netlify=oldNetlify;globalThis.fetch=oldFetch}});
test('ambiguous metadata failure retains created ID and is never retried',async()=>{const f=fixture();globalThis.Netlify={env:{get:k=>f.vars[k]}};globalThis.fetch=async(url,opts)=>new URL(url).pathname.endsWith('/draft-fields/33')?(()=>{throw Error('simulated timeout')})():f.fetcher(url,opts);try{const r=await handlePublish(req(),f.store);assert.equal(r.status,503);const item=await f.store('mahotels-jobs-v1').get(key);assert.equal(item.state,'metadata_pending');assert.equal(item.wordpress_id,33);await handlePublish(req(),f.store);assert.equal(f.getPostCount(),1);}finally{globalThis.Netlify=oldNetlify;globalThis.fetch=oldFetch}});
