/**
 * Public, read-only recruitment connectors. No credentials or WordPress writes.
 * A source is deliberately rejected rather than filled with guessed metadata.
 */
export type Vacancy = {
  source: 'accor' | 'radisson' | 'rotana' | 'marriott';
  originalId: string;
  title: string;
  company: string;
  hotel?: string;
  city: string;
  country: string;
  sourceUrl: string;
  applyUrl: string;
  description: string;
  requirements?: string;
  postedAt?: string;
  expiresAt?: string;
};

const TIMEOUT_MS = 12000;
const allowed = (s: unknown): s is string => typeof s === 'string' && /^https:\/\//i.test(s);
const text = (x: unknown) => typeof x === 'string' ? x.trim() : '';
const date = (x: unknown) => {
  if (typeof x !== 'string' || !/^20\d{2}-\d{2}-\d{2}/.test(x)) return undefined;
  const t = Date.parse(x);
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
};
const clean = (html: unknown) => text(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
async function load(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error('Upstream ' + response.status);
  return response.json();
}
const countries = new Map([
  ['sa', 'Saudi Arabia'], ['ae', 'United Arab Emirates'], ['bh', 'Bahrain'],
  ['om', 'Oman'], ['eg', 'Egypt'], ['jo', 'Jordan'], ['lb', 'Lebanon'], ['ma', 'Morocco']
]);
export function normalizeCountry(value: unknown): string | undefined {
  const s = text(value).toLowerCase().trim();
  if (!s) return;
  if (countries.has(s)) return countries.get(s);
  for (const v of countries.values()) if (v.toLowerCase() === s) return v;
  return;
}
// Preserve provider query strings, signatures and parameter ordering for actual candidates.
export function validateApplyUrl(value: unknown): string | undefined {
  if (!allowed(value)) return;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return;
    return value;
  } catch { return; }
}
// For duplicate matching ONLY. Never substitute this canonical form for an application link.
export function normalizeApplyUrl(value: unknown): string | undefined {
  const raw = validateApplyUrl(value);
  if (!raw) return;
  const url = new URL(raw);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_.+|oga)$/i.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.toString().replace(/\/$/, '');
}
async function smartRecruiters(companyId: 'AccorHotel' | 'RHG', source: 'accor' | 'radisson', limit: number): Promise<Vacancy[]> {
  const data = await load('https://api.smartrecruiters.com/v1/companies/' + companyId + '/postings?limit=100');
  if (!data || typeof data !== 'object') throw Error('Invalid SmartRecruiters response');
  const rows = (data as { content?: unknown }).content;
  if (!Array.isArray(rows)) throw Error('Missing SmartRecruiters content');
  const vacancies: Vacancy[] = [];
  for (const row of rows) {
    if (vacancies.length >= limit) break;
    if (!row || typeof row !== 'object') continue;
    const x = row as Record<string, any>;
    const loc = x.location ?? {};
    const country = normalizeCountry(loc.country);
    const id = String(x.id ?? '').trim();
    const title = text(x.name);
    const city = text(loc.city);
    const sourceUrl = text(x.ref ?? x.releaseUrl);
    if (!id || !title || !city || !country || !allowed(sourceUrl)) continue;
    // Fetch full job details: list payload often lacks descriptions.
    try {
      const detail = await load('https://api.smartrecruiters.com/v1/companies/' + companyId + '/postings/' + encodeURIComponent(id)) as Record<string, any>;
      const sections = detail.jobAd?.sections ?? {};
      const description = clean(sections.jobDescription?.text ?? sections.companyDescription?.text);
      const requirements = clean(sections.qualifications?.text);
      const applyUrl = validateApplyUrl(detail.applyUrl ?? detail.ref ?? sourceUrl);
      if (!description || !applyUrl) continue;
      vacancies.push({
        source, originalId: id, title, company: companyId, city, country,
        sourceUrl, applyUrl, description, ...(requirements ? { requirements } : {}),
        ...(date(x.releasedDate ?? detail.releasedDate) ? { postedAt: date(x.releasedDate ?? detail.releasedDate) } : {})
      });
    } catch (e) { console.warn('Skipped invalid vacancy', source, id, String(e)); }
  }
  return vacancies;
}
export const collectAccor = (limit = 10) => smartRecruiters('AccorHotel', 'accor', limit);
export const collectRadisson = (limit = 10) => smartRecruiters('RHG', 'radisson', limit);
/**
 * Workable account endpoint structures can change. We require explicit verified
 * identifiers, location and application URLs rather than synthesizing them.
 */
export async function collectRotana(limit = 10): Promise<Vacancy[]> {
  const data = await load('https://www.workable.com/api/accounts/rotana-hotels?details=true');
  const body = data as Record<string, any>;
  const rows = Array.isArray(body?.jobs) ? body.jobs : Array.isArray(body?.openings) ? body.openings : [];
  const result: Vacancy[] = [];
  for (const raw of rows) {
    if (result.length >= limit) break;
    const id = text(raw?.shortcode ?? raw?.id?.toString());
    const title = text(raw?.title);
    const city = text(raw?.city ?? raw?.location?.city);
    const country = normalizeCountry(raw?.country ?? raw?.location?.country_code ?? raw?.location?.country);
    const applyUrl = validateApplyUrl(raw?.application_url ?? raw?.url);
    const sourceUrl = text(raw?.url);
    const description = clean(raw?.description);
    if (!id || !title || !city || !country || !applyUrl || !allowed(sourceUrl) || !description) continue;
    result.push({source:'rotana', originalId:id, title, company:'Rotana Hotels', city, country, sourceUrl, applyUrl, description,
      ...(date(raw.published_on) ? { postedAt: date(raw.published_on) } : {}),
      ...(date(raw.expires_at) ? { expiresAt: date(raw.expires_at) } : {})});
  }
  return result;
}
