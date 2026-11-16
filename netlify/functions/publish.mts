import { getStore } from '@netlify/blobs';
import { applicationLink, duplicateLinks, jobSlug, renderDraft, type SavedJob } from '../../src/wordpress.mts';
const env = (name: string) => Netlify.env.get(name) ?? '';

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
async function auditAll(endpoint: URL, headers: Record<string,string>) {
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
export default async (request: Request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  // All gates default to stopped. Even a published function cannot write until explicitly armed.
  if (env('JOBS_EMERGENCY_STOP') !== 'false' || env('ENABLE_WP_SYNC') !== 'true' ||
    env('WP_DRAFT_ONLY') !== 'true' || env('WP_JOB_SCHEMA_VERIFIED') !== 'true') {
    console.log('MAHotels WP sync stopped');
    return new Response('Disabled', { status: 503 });
  }
  const token = env('INTERNAL_DISPATCH_TOKEN');
  if (!token || token.length < 32 || request.headers.get('x-mahotels-dispatch-token') !== token) {
    return new Response('Forbidden', { status: 403 });
  }
  const site = env('WP_SITE_URL'), restBase = env('WP_JOB_REST_BASE');
  const username = env('WP_USERNAME'), appPassword = env('WP_APP_PASSWORD');
  if (site !== 'https://mahotels.net' || !/^[a-z0-9_-]+$/i.test(restBase) ||
    !username || !appPassword) return new Response('Missing WordPress configuration', {status:503});
  const endpoint = new URL('/wp-json/wp/v2/' + restBase, site);
  const headers = { Authorization:'Basic ' + btoa(username + ':' + appPassword), Accept:'application/json' };
  // The custom post type slug is not necessarily its REST base. Verify live WP registration.
  try {
    const typeResponse = await fetchJSON(new URL('/wp-json/wp/v2/types/ma_hotel_job?context=edit',site), headers);
    const type = await typeResponse.json() as {rest_base?: string; taxonomies?: string[]};
    if (type.rest_base !== restBase || !type.taxonomies?.includes('ma_job_country')) {
      throw Error('WordPress REST base or country taxonomy does not match');
    }
    const optionsResponse = await fetchJSON(endpoint, headers, {method:'OPTIONS'});
    const options = await optionsResponse.json() as {schema?:{properties?:Record<string,unknown>}};
    if (!options.schema?.properties?.ma_job_country) {
      throw Error('Country taxonomy is not writable through job REST schema');
    }
  } catch (error) {
    console.error('WordPress schema preflight failed closed', String(error));
    return new Response('WordPress schema unverified', {status:503});
  }
  let existing: Set<string>;
  try {
    const audit = await auditAll(endpoint, headers);
    existing = audit.known;
    console.log('WordPress audited posts:',audit.checked);
  } catch (error) {
    console.error('WordPress audit failed closed',String(error));
    return new Response('Audit blocked', { status:503 });
  }
  const store = getStore('mahotels-jobs-v1');
  // One manual test draft per invocation. No retries of ambiguous writes.
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
      try { draft = renderDraft(job); } catch { continue; }
      const slug = jobSlug(job);
      try {
        const bySlug = await inspectBySlug(endpoint, slug, headers);
        if (bySlug.length || existing.has(apply) || (job.sourceUrl && existing.has(new URL(job.sourceUrl).toString().replace(/\/$/, '')))) {
          console.log('Duplicate job suppressed',job.source,job.originalId);
          // Preserve ready state until manually reconciled with the existing post.
          continue;
        }
        // Atomically reserve the ONE test draft allowed across every invocation and deploy.
        // Never silently release this lock after an ambiguous WordPress write.
        const testClaims = getStore('mahotels-jobs-one-draft-claim-v1');
        const testClaim = await testClaims.setJSON('first-ever-test-draft', {
          key, slug, reserved_at:new Date().toISOString(), state:'reserved'
        }, {onlyIfNew:true});
        if (!testClaim.modified) {
          console.log('One-draft test budget already reserved; no more WP writes');
          return new Response('One test draft already attempted', {status:409});
        }
        // Mark as in-flight with a conditional write, protecting against parallel executions.
        // A network timeout after WP creation leaves this state for manual reconciliation.
        const result = await store.setJSON(key, {...job,state:'attempting'}, {onlyIfMatch:entry.etag});
        if (!result.modified) continue;
        let created: Post;
        try {
          const res = await fetchJSON(endpoint, headers, {method:'POST',
            headers:{'Content-Type':'application/json'}, body:JSON.stringify(draft)});
          created = await res.json() as Post;
        } catch (error) {
          console.error('Ambiguous WordPress create; no automatic retry',key,String(error));
          return new Response('Ambiguous create; reconciliation required',{status:503});
        }
        if (!Number.isInteger(created.id) || created.status !== 'draft') {
          console.error('Unexpected WordPress create response',key);
          return new Response('Draft status unverified',{status:503});
        }
        // Read back: ensure taxonomy and application link are retained by the plugin.
        const read = await fetchJSON(new URL(endpoint.href.replace(/\/$/,'') + '/' + created.id + '?context=edit'),headers);
        const verified = await read.json() as Post;
        const terms = verified.ma_job_country;
        if (verified.id !== created.id || verified.status !== 'draft' ||
          !Array.isArray(terms) || !terms.includes(draft.ma_job_country[0]) ||
          !duplicateLinks(verified).has(apply)) {
          console.error('Draft review needed: taxonomy/apply link mismatch',created.id);
          return new Response('Draft created; review required',{status:503});
        }
        await store.setJSON(key, {...job,state:'sent',wordpress_id:created.id});
        console.log('Verified test draft',created.id,job.source);
        return new Response(JSON.stringify({drafts_created:1,id:created.id}),{
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
};
