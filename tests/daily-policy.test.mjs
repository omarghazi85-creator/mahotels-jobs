import test from 'node:test';
import assert from 'node:assert/strict';
import {reserveDailyWrite, dispatchDrafts} from '../src/daily-policy.mts';

function atomicClaims() {
  const claims = new Map();
  return {claims, async setJSON(key, value, options) {
    assert.equal(options.onlyIfNew, true);
    if (claims.has(key)) return {modified:false};
    claims.set(key, value);
    return {modified:true};
  }};
}

test('concurrent attempts consume at most two durable slots per UTC day', async () => {
  const store=atomicClaims();
  const outcomes=await Promise.all(Array.from({length:12},(_,i)=>reserveDailyWrite(store,'2026-11-21',50,'job'+i,'slug'+i)));
  assert.equal(outcomes.filter(Boolean).length,2);
  assert.equal(store.claims.size,2);
  assert.equal(await reserveDailyWrite(store,'2026-11-21',2,'other','other'),false);
  assert.equal(await reserveDailyWrite(store,'2026-11-22',2,'tomorrow','tomorrow'),true);
});
test('daily dispatcher stops after an ambiguous write and never retries it', async () => {
  let calls=0;
  const completed=await dispatchDrafts(2,()=>false,async()=>{calls++; throw Error('timeout after remote write');});
  assert.equal(completed,0); assert.equal(calls,1);
});
test('daily dispatcher obeys emergency stop and one-or-two limit', async () => {
  let calls=0, stopped=false;
  const completed=await dispatchDrafts(10,()=>stopped,async()=>{calls++; stopped=true; return {ok:true,draftsCreated:1};});
  assert.equal(completed,1); assert.equal(calls,1);
  assert.equal(await dispatchDrafts(2,()=>true,async()=>{throw Error('must not call');}),0);
});
test('daily dispatcher stops when no eligible job or remote error occurs', async () => {
  for (const result of [{ok:true,draftsCreated:0},{ok:false}]) {
    let calls=0;
    assert.equal(await dispatchDrafts(2,()=>false,async()=>{calls++;return result}),0);
    assert.equal(calls,1);
  }
});
