import { getStore } from '@netlify/blobs';
import { sourceExists, writeAndVerifyFields, bridgePayload, slugExists, createServiceDraft, readServiceDraft } from '../../src/lite-bridge.mts';
import { reserveDailyWrite } from '../../src/daily-policy.mts';
import { applicationLink, duplicateLinks, jobSlug, renderDraft, type SavedJob } from '../../src/wordpress.mts';
const env = (name: string) => Netlify.env.get(name) ?? '';
const digest = async (value:string) => Array.from(new Uint8Array(
  await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
)).map(x => x.toString(16).padStart(2,'0')).join('');

type Post = {
  id: number; slug?: string; status?: string;
  content?: { raw?: string; rendered?: string };
  meta?: Record<string,unknown>;
  ma_job_country?: number[];
};
async function fetchJSON(url: URL, headers: Record<string,string>, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, headers: { ...headers, ...init.headers },
    signal: AbortSignal.timeout(18000) });
  if (!res.ok) throw Error('WordPress HTTP ' + res.status + ' for ' + url.pathname);
  return res;
}
async function inspectBySlug(endpoint: URL, slug: string, headers: Record<string,string>): Promise<Post[]> {
  const url = new URL(endpoint);
  url.searchParams.set('slug', slug);
  url.searchParams.set('context', 'edit');
  url.searchParams.set('status', 'any');
  const res = await fetchJSON(url, headers);
  const posts: unknown = await res.json();
  if (!Array.isArray(posts)) throw Error('Invalid WP slug lookup');
  return posts as Post[];
}
export async function auditAll(endpoint: URL, headers: Record<string,string>) {
  const known = new Set<string>();
  let expectedPages: number | undefined;
  let checked = 0;
  for (let page = 1; page <= 20; page++) {
    const url = new URL(endpoint);
    url.searchParams.set('per_page','100');
    url.searchParams.set('page', String(page));
    url.searchParams.set('context','edit');
    url.searchParams.set('status','any');
    const res = await fetchJSON(url, headers);
    if (page === 1) {
      expectedPages = Number(res.headers.get('x-wp-totalpages'));
      if (!Number.isInteger(expectedPages) || expectedPages < 1 || expectedPages > 20) {
        throw Error('WP pagination is incomplete or too large');
      }
    }
    const rows: unknown = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) throw Error('Unexpected empty WP audit page');
    for (const row of rows as Post[]) {
      if (!Number.isInteger(row.id)) throw Error('WP item without id');
      for (const url of duplicateLinks(row)) known.add(url);
      checked++;
    }
    if (page === expectedPages) return {known,checked};
  }
  throw Error('WP audit did not finish');
}
export async function handlePublish(request:Request, storeFactory:typeof getStore = getStore) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  // All gates default to stopped. Even a published function cannot write until explicitly armed.
  if (env('JOBS_EMERGENCY_STOP') !== 'false' || env('ENABLE_WP_SYNC') !== 'true' ||
    env('WP_DRAFT_ONLY') !== 'true' || env('WP_JOB_SCHEMA_VERIFIED') !== 'true' ||
    env('WP_LEGACY_AUDIT_VERIFIED') !== 'true') {
    console.log('MAHotels WP sync stopped');
    return new Response('Disabled', { status: 503 });
  }
  const token = env('INTERNAL_DISPATCH_TOKEN');
  if (!token || token.length < 32 || request.headers.get('x-mahotels-dispatch-token') !== token) {
    return new Response('Forbidden', { status: 403 });
  }
  const site = env('WP_SITE_URL');
  const username = env('WP_USERNAME'), appPassword = env('WP_APP_PASSWORD');
  if (site !== 'https://mahotels.net' || !username || !appPassword)
    return new Response('Missing WordPress configuration', {status:503});
  // A dedicated service user has no broad WordPress editor or publish rights.
  const headers = { Authorization:'Basic ' + Buffer.from(username + ':' + appPassword, 'utf8').toString('base64'), Accept:'application/json' };
  const store = storeFactory('mahotels-jobs-v1');
  const testClaims = storeFactory('mahotels-jobs-one-draft-claim-v1');
  // Daily mode is explicitly enabled only after a verified test draft. A missing
  // or incomplete verification record can never authorize automatic writes.
  const dailyMode = env('ENABLE_DAILY_DRAFTS') === 'true';
  if (dailyMode) {
    const verified = await testClaims.get('first-ever-test-draft', {type:'json', consistency:'strong'}) as {state?:string}|null;
    if (verified?.state !== 'verified' || env('WP_TEST_DRAFT_APPROVED') !== 'true' ||
        env('WP_LEGACY_IMPORTER_DISABLED') !== 'true')
      return new Response('Review or legacy importer verification required', {status:503});
  }
  // At most one draft per invocation. Never retry ambiguous writes.
  for await (const page of store.list({paginate:true})) {
    for (const {key} of page.blobs) {
      const entry = await store.getWithMetadata(key, {type:'json', consistency:'strong'});
      if (!entry?.data) continue;
      const job = entry.data as SavedJob;
      if (job.state !== 'ready' || key !== job.key ||
        (job.expiresAt && Date.parse(job.expiresAt) <= Date.now())) continue;
      const apply = applicationLink(job);
      if (!apply) continue;
      let draft: ReturnType<typeof renderDraft>;
      try { draft = renderDraft(job); bridgePayload(job); } catch { continue; }
      const slug = jobSlug(job);
      try {
        if (await slugExists(site, headers, slug) || await sourceExists(site, headers, job)) {
          console.log('Duplicate job suppressed',job.source,job.originalId);
          // Preserve ready state until manually reconciled with the existing post.
          continue;
        }
        if (!dailyMode) {
          // Preserve the one-attempt test lock across all deploys.
          const testClaim = await testClaims.setJSON('first-ever-test-draft', {
            key, slug, reserved_at:new Date().toISOString(), state:'reserved'
          }, {onlyIfNew:true});
          if (!testClaim.modified) return new Response('One test draft already attempted', {status:409});
        }
        // Daily cap includes the test attempt; reservations never expire or retry
        // after ambiguous writes. A concurrent invocation can only claim a free slot.
        const claims = storeFactory('mahotels-jobs-daily-writes-v1');
        const date = new Date().toISOString().slice(0,10);
        const max = Math.min(2, Math.max(1, Number(env('MAX_JOBS_PER_DAY') || 2) || 2));
        if (!await reserveDailyWrite(claims, date, max, key, slug))
          return new Response('Daily draft budget exhausted', {status:409});
        // Reserve the canonical application URL across source providers and
        // concurrent requests; never release on an uncertain remote outcome.
        const identities = storeFactory('mahotels-jobs-identity-claims-v1');
        const identity = await identities.setJSON(await digest(apply), {
          key, slug, state:'reserved', reserved_at:new Date().toISOString()
        }, {onlyIfNew:true});
        if (!identity.modified) continue;
        // Mark as in-flight with a conditional write, protecting against parallel executions.
        // A network timeout after WP creation leaves this state for manual reconciliation.
        const result = await store.setJSON(key, {...job,state:'attempting'}, {onlyIfMatch:entry.etag});
        if (!result.modified) continue;
        let createdId:number;
        try { createdId = await createServiceDraft(site, headers, draft); }
        catch { console.error('Ambiguous WordPress create; no automatic retry');
          return new Response('Ambiguous create; reconciliation required',{status:503}); }
        // Persist ID before metadata; never repeat an uncertain create.
        if (!result.etag) return new Response('Draft ID needs reconciliation', {status:503});
        const pending = await store.setJSON(key, {...job,state:'metadata_pending',wordpress_id:createdId}, {onlyIfMatch:result.etag});
        if (!pending.modified || !pending.etag) return new Response('Draft ID needs reconciliation', {status:503});
        // Bridge required legacy-compatible metadata; a failed/ambiguous POST
        // leaves the record attempting and requires manual reconciliation.
        try { await writeAndVerifyFields(site, headers, createdId, job); }
        catch { console.error('Draft metadata needs manual reconciliation',createdId);
          return new Response('Draft metadata unverified; review required',{status:503}); }
        // Read only the service user's own draft through the scoped endpoint.
        const verified = await readServiceDraft(site, headers, createdId);
        if (verified.slug !== slug || verified.title !== draft.title ||
            !verified.country_ids.includes(draft.ma_job_country[0]) ||
            !duplicateLinks({content:{raw:verified.content}}).has(apply)) {
          console.error('Draft review needed: title, taxonomy or apply link mismatch',createdId);
          return new Response('Draft created; review required',{status:503});
        }
        const sent = await store.setJSON(key, {...job,state:'sent',wordpress_id:createdId}, {onlyIfMatch:pending.etag});
        if (!sent.modified) return new Response('Draft state requires reconciliation', {status:503});
        if (!dailyMode) {
          const record = await testClaims.getWithMetadata('first-ever-test-draft', {type:'json', consistency:'strong'});
          if (!record?.data || !record.etag) throw Error('Test claim unavailable for verification');
          const mark = await testClaims.setJSON('first-ever-test-draft', {
            ...(record.data as object), state:'verified', wordpress_id:createdId
          }, {onlyIfMatch:record.etag});
          if (!mark.modified) throw Error('Test verification marker was not saved');
        }
        console.log('Verified test draft',createdId,job.source);
        return new Response(JSON.stringify({drafts_created:1,id:createdId}),{
          headers:{'Content-Type':'application/json'}});
      } catch (error) {
        console.error('WordPress sync stopped safely',String(error));
        return new Response('Sync interrupted for review', {status:503});
      }
    }
  }
  console.log('No eligible nonduplicate draft found');
  return new Response(JSON.stringify({drafts_created:0}),{
    headers:{'Content-Type':'application/json'}});
}
export default (request:Request) => handlePublish(request);
