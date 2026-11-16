import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationLink, duplicateLinks, renderDraft, jobSlug } from '../src/wordpress.mts';

const sample = {
  key:'a'.repeat(64), originalId:'74400011223344', source:'accor', title:'Desk Agent',
  company:'Accor', country:'Saudi Arabia', city:'Riyadh',
  sourceUrl:'https://jobs.smartrecruiters.com/AccorHotel/74400011223344',
  applyUrl:'https://jobs.smartrecruiters.com/AccorHotel/74400011223344?oga=true',
  arabic_title:'موظف استقبال', arabic_description:'استقبال الضيوف', arabic_requirements:'إجادة الإنجليزية',
  state:'ready'
};
test('draft keeps application destination and registered country taxonomy', () => {
  const post = renderDraft(sample);
  assert.deepEqual(post.ma_job_country, [7473]);
  assert.equal(post.status, 'draft');
  assert.equal(post.slug, 'ma-jobs-' + 'a'.repeat(32));
  assert.match(post.content, /التقديم من المصدر الأصلي/);
  assert.ok(duplicateLinks({content:{raw:post.content}}).has(applicationLink(sample)));
});
test('safe HTML escaping and explicit omission of invented requirements', () => {
  const post = renderDraft({...sample,arabic_description:'<script>x</script>',arabic_requirements:''});
  assert.ok(post.content.includes('&lt;script&gt;'));
  assert.ok(!post.content.includes('<script>'));
  assert.ok(!post.content.includes('<h2>المتطلبات</h2>'));
});
test('malformed source or unknown country is rejected', () => {
  assert.throws(()=>renderDraft({...sample,country:'Nowhere'}));
  assert.throws(()=>renderDraft({...sample,applyUrl:'http://unsafe.example'}));
});
test('duplicate extraction normalizes tracking and fails closed on missing content', () => {
  const links = duplicateLinks({content:{rendered:'<a href="https://example.org/job?id=2&amp;utm_source=a">apply</a>'}});
  assert.ok(links.has('https://example.org/job?id=2'));
  assert.throws(()=>duplicateLinks({}));
  assert.equal(jobSlug(sample), 'ma-jobs-' + 'a'.repeat(32));
});

test('verified source posting/expiry dates are included, missing dates are not invented', () => {
  const dated = renderDraft({...sample, postedAt:'2026-11-12T00:00:00.000Z', expiresAt:'2026-12-01T00:00:00.000Z'});
  assert.match(dated.content, /2026-11-12/);
  assert.match(dated.content, /2026-12-01/);
  const undated = renderDraft({...sample, postedAt:undefined,expiresAt:undefined});
  assert.doesNotMatch(undated.content, /تاريخ الإعلان|تاريخ انتهاء التقديم/);
});
