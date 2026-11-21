import test from 'node:test';
import assert from 'node:assert/strict';
import {legacyDuplicate} from '../src/legacy-dedup.mts';

const originalFetch=globalThis.fetch;
const sample={source:'marriott',originalId:'P1-7571916-0',
  sourceUrl:'https://careers.marriott.com/example/job/P1-7571916-0?ref=orig&sig=a%2Bb',
  applyUrl:'https://apply.example.org/job?job=12&signature=A%2BB&utm_source=test'};
const site='https://mahotels.net';

test('checks source and apply URLs without changing signed parameters', async()=>{
  const calls=[];
  globalThis.fetch=async(url,init)=>{
    calls.push({url:String(url),body:JSON.parse(init.body),redirect:init.redirect,auth:init.headers.Authorization});
    return Response.json({exists:false});
  };
  try {
    assert.equal(await legacyDuplicate(site,{Authorization:'Basic fixture'},sample),false);
    assert.equal(calls.length,2);
    assert.deepEqual(calls.map(c=>c.body.source_url),[sample.sourceUrl,sample.applyUrl]);
    assert.ok(calls.every(c=>c.redirect==='error' && c.auth==='Basic fixture'));
    assert.ok(calls.every(c=>c.body.original_id===sample.originalId && c.body.source==='marriott'));
  } finally {globalThis.fetch=originalFetch}
});
test('an identity or URL match suppresses the job and stops further requests',async()=>{
  let calls=0;
  globalThis.fetch=async()=>{calls++;return Response.json({exists:true})};
  try {assert.equal(await legacyDuplicate(site,{},sample),true);assert.equal(calls,1)}
  finally {globalThis.fetch=originalFetch}
});
test('unauthorized, missing, malformed or unreachable lookup fails closed',async()=>{
  const cases=[
    async()=>new Response('Forbidden',{status:403}),
    async()=>new Response('Not found',{status:404}),
    async()=>new Response('Unavailable',{status:503}),
    async()=>new Response('<html>login</html>',{status:200}),
    async()=>Response.json({exists:'false'}),
    async()=>{throw Error('network timeout')},
  ];
  try {for(const stub of cases){globalThis.fetch=stub;await assert.rejects(legacyDuplicate(site,{},sample))}}
  finally {globalThis.fetch=originalFetch}
});
test('unknown provider, malformed identity and non-HTTPS URL fail before network',async()=>{
  globalThis.fetch=async()=>{throw Error('unexpected fetch')};
  try {
    await assert.rejects(legacyDuplicate(site,{}, {...sample,source:'unknown'}),/identity/);
    await assert.rejects(legacyDuplicate(site,{}, {...sample,originalId:'bad value'}),/identity/);
    await assert.rejects(legacyDuplicate(site,{}, {...sample,sourceUrl:'http://example.org/a'}),/URLs/);
    await assert.rejects(legacyDuplicate('https://other.example',{},sample),/identity/);
  } finally {globalThis.fetch=originalFetch}
});
