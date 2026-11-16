import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const payload=JSON.parse(readFileSync(new URL('../public/jobs-snapshot.json',import.meta.url),'utf8'));
test('public Arabic landing page has real, non-destructive buttons and proper semantics',()=>{
 assert.match(html,/lang="ar" dir="rtl"/);
 assert.match(html,/id="check"/);
 assert.match(html,/\.netlify\/functions\/health/);
 assert.match(html,/id="job-query"/);
 assert.match(html,/id="job-grid"/);
 assert.match(html,/https:\/\/mahotels\.net\//);
});
test('curated job snapshots are only verified published MAHotels links and not drafts',()=>{
 assert.ok(Array.isArray(payload.jobs));
 assert.ok(payload.jobs.length>=4);
 assert.equal(new Set(payload.jobs.map(x=>x.id)).size,payload.jobs.length);
 for(const job of payload.jobs){
  assert.equal(typeof job.title,'string');
  assert.ok(job.title.length>5);
  assert.match(job.url,/^https:\/\/mahotels\.net\/hotel-job\//);
  assert.match(job.date,/^20\d{2}-\d{2}-\d{2}$/);
  assert.ok(!/<script|<iframe|<img/i.test(job.summary));
 }
});
