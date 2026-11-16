import { normalizeApplyUrl, normalizeCountry, type Vacancy } from './sources.mts';

type JsonLd = Record<string, unknown>;
const str = (x: unknown) => typeof x === 'string' ? x.trim() : '';
const plain = (x: unknown) => str(x).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
function extractJsonLd(html: string): JsonLd[] {
  const items: JsonLd[] = [];
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data: unknown = JSON.parse(match[1]);
      const nodes = Array.isArray(data) ? data : [data];
      for (const node of nodes) {
        const list = typeof node === 'object' && node !== null && Array.isArray((node as JsonLd)['@graph'])
          ? (node as JsonLd)['@graph'] as unknown[] : [node];
        for (const item of list) if (item && typeof item === 'object') items.push(item as JsonLd);
      }
    } catch { /* Ignore unparseable markup, never invent vacancy details */ }
  }
  return items.filter(v => str(v['@type']) === 'JobPosting' ||
    (Array.isArray(v['@type']) && (v['@type'] as unknown[]).includes('JobPosting')));
}
export function parseMarriottJob(html: string, url: string): Vacancy | undefined {
  const entry = extractJsonLd(html)[0];
  if (!entry) return;
  const location = Array.isArray(entry.jobLocation) ? entry.jobLocation[0] : entry.jobLocation;
  const loc = (location && typeof location === 'object') ? location as JsonLd : {};
  const address = (loc.address && typeof loc.address === 'object') ? loc.address as JsonLd : {};
  const org = (entry.hiringOrganization && typeof entry.hiringOrganization === 'object')
    ? entry.hiringOrganization as JsonLd : {};
  const title = str(entry.title);
  const description = plain(entry.description);
  const country = normalizeCountry(address.addressCountry);
  const city = str(address.addressLocality);
  const idItem = entry.identifier;
  const id = typeof idItem === 'object' && idItem !== null ? str((idItem as JsonLd).value) : str(idItem);
  const applyLabelIndex = html.indexOf('Apply Now');
  const precedingHtml = applyLabelIndex < 0 ? '' : html.slice(Math.max(0, applyLabelIndex - 1500), applyLabelIndex);
  const hrefs = [...precedingHtml.matchAll(/href=["']([^"']+)["']/gi)];
  const applyUrl = normalizeApplyUrl(hrefs.at(-1)?.[1]);
  const sourceUrl = normalizeApplyUrl(url);
  if (!id || !title || !description || !country || !city || !applyUrl || !sourceUrl) return;
  if (new URL(sourceUrl).hostname !== 'careers.marriott.com') return;
  const posting = str(entry.datePosted);
  const expiry = str(entry.validThrough);
  const postedAt = /^20\d{2}-\d{2}-\d{2}/.test(posting) && Number.isFinite(Date.parse(posting)) ? new Date(posting).toISOString() : undefined;
  const expiresAt = /^20\d{2}-\d{2}-\d{2}/.test(expiry) && Number.isFinite(Date.parse(expiry)) ? new Date(expiry).toISOString() : undefined;
  const requirements = plain(entry.qualifications);
  return {source:'marriott', originalId:id, title, company:str(org.name) || 'Marriott International',
    city, country, sourceUrl, applyUrl, description,
    ...(requirements ? { requirements } : {}), ...(postedAt ? { postedAt } : {}),
    ...(expiresAt ? { expiresAt } : {})};
}
export async function collectMarriott(limit = 2): Promise<Vacancy[]> {
  const listing = new URL('https://careers.marriott.com/jobs');
  // Filter the official search page; do not rely on external jobs aggregators.
  listing.searchParams.set('filter[country][0]', 'Saudi Arabia');
  const res = await fetch(listing, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error('Marriott listing status ' + res.status);
  const html = await res.text();
  const links = [...html.matchAll(/href=["']([^"']+\/job\/[A-Za-z0-9-]+)[^"']*["']/gi)]
    .map(m => { try { return new URL(m[1], listing).toString(); } catch { return ''; } })
    .filter(u => u.startsWith('https://careers.marriott.com/'));
  const jobs: Vacancy[] = [];
  for (const url of [...new Set(links)].slice(0, 20)) {
    if (jobs.length >= limit) break;
    try {
      const r = await fetch(url, {signal: AbortSignal.timeout(12000)});
      if (!r.ok) continue;
      const job = parseMarriottJob(await r.text(), url);
      if (job && (!job.expiresAt || Date.parse(job.expiresAt) > Date.now())) jobs.push(job);
    } catch (err) { console.warn('Marriott job fetch skipped', String(err)); }
  }
  return jobs;
}
