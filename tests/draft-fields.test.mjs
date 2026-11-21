import test from 'node:test';
import assert from 'node:assert/strict';
import {draftFields, verifiedDraftFields} from '../src/draft-fields.mts';

const job={source:'marriott',originalId:'P1-7571916-0',
  sourceUrl:'https://careers.marriott.com/job/P1-7571916-0?ref=A%2BB&x=2',
  company:'Marriott',hotel:'Rabat Marriott Hotel',city:'الرباط',arabic_title:'موظف استقبال'};
test('maps only existing source data and preserves URL parameters',()=>{
  const data=draftFields({...job,postedAt:'2026-10-04T00:00:00.000Z'});
  assert.deepEqual(data,{source:'marriott',original_id:'P1-7571916-0',source_url:job.sourceUrl,
    company:job.hotel,city:job.city,role:job.arabic_title,posted_on:'2026-10-04'});
  assert.equal('expires_on' in data,false);
  assert.equal('verified_on' in data,false);
  assert.equal('ar_ready' in data,false);
});
test('malformed dates and missing identity fail instead of being invented',()=>{
  assert.throws(()=>draftFields({...job,expiresAt:'2026-02-30'}),/Invalid source date/);
  assert.throws(()=>draftFields({...job,originalId:'bad id'}),/Missing draft metadata/);
  assert.throws(()=>draftFields({...job,city:''}),/Missing draft metadata/);
});
test('readback requires a draft, every metadata value, and unverified Arabic status',()=>{
  const data=draftFields({...job,postedAt:'2026-10-04'});
  const fields={source_id:'Marriott:P1-7571916-0',source_url:data.source_url,
    company:data.company,city:data.city,role:data.role,posted_on:'2026-10-04',
    expires_on:'',verified_on:'',ar_ready:'0'};
  assert.equal(verifiedDraftFields(data,{id:7,status:'draft',fields},7),true);
  for(const bad of [
    {id:7,status:'publish',fields}, {id:8,status:'draft',fields},
    {id:7,status:'draft',fields:{...fields,ar_ready:'1'}},
    {id:7,status:'draft',fields:{...fields,verified_on:'2026-11-21'}},
    {id:7,status:'draft',fields:{...fields,source_url:'https://example.org'}},
    {id:7,status:'draft',fields:{...fields,posted_on:''}},
  ]) assert.equal(verifiedDraftFields(data,bad,7),false);
});
