import { getStore } from '@netlify/blobs';
import { collectMarriott } from '../../src/marriott.mjs';
import type { Config } from '@netlify/functions';
import { collectAccor, collectRadisson, collectRotana, normalizeApplyUrl, type Vacancy } from '../../src/sources.mjs';

const env = (name: string) => Netlify.env.get(name) ?? '';
const safeLimit = () => Math.min(2, Math.max(1, Number(env('MAX_JOBS_PER_DAY') || 2) || 2));
type Translation = { title: string; description: string; requirements: string };
const responseSchema = {
  type: 'json_schema', json_schema: {
    name: 'hotel_job_arabic', strict: true,
    schema: {
      type: 'object', additionalProperties: false,
      properties: { title: { type: 'string' }, description: { type: 'string' }, requirements: { type: 'string' } },
      required: ['title', 'description', 'requirements']
    }
  }
};
async function translate(job: Vacancy): Promise<Translation> {
  const token = env('GROQ_API_KEY');
  if (!token) throw Error('Missing GROQ_API_KEY');
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(25000),
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b', temperature: 0.1, response_format: responseSchema,
      messages: [
        { role: 'system', content: 'Translate this hotel job into accurate formal Arabic. Preserve every factual condition and distinguish preferred from required. Do not invent salaries, nationality, credentials, dates, hotel name, experience, or other requirements. Return JSON according to the schema.' },
        { role: 'user', content: JSON.stringify({ title: job.title, description: job.description, requirements: job.requirements ?? '' }) }
      ]
    })
  });
  if (!r.ok) throw Error('Groq request failed: HTTP ' + r.status);
  const data = await r.json() as { choices?: Array<{ message?: { content?: string } }> };
  const result = JSON.parse(data.choices?.[0]?.message?.content ?? 'null') as Partial<Translation> | null;
  if (!result || typeof result.title !== 'string' || typeof result.description !== 'string' || typeof result.requirements !== 'string' || !result.title.trim() || !result.description.trim())
    throw Error('Invalid translation structure');
  return { title: result.title.trim(), description: result.description.trim(), requirements: result.requirements.trim() };
}
const digest = async (value: string) => Array.from(
  new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
).map(x => x.toString(16).padStart(2, '0')).join('');

export default async (request: Request) => {
  const token = env('INTERNAL_DISPATCH_TOKEN');
  const provided = request.headers.get('x-mahotels-dispatch-token') ?? '';
  if (!token || token.length < 32 || !provided || provided !== token) {
    console.error('Unauthorized collection invocation');
    return;
  }
  if (env('JOBS_EMERGENCY_STOP') !== 'false' || env('ENABLE_COLLECTION') !== 'true') {
    console.log('MAHotels collection disabled'); return;
  }
  const limit = safeLimit();
  // Claim the UTC day atomically before doing paid or external work. Fail closed if interrupted.
  // This intentionally sacrifices automatic retries to avoid duplicate daily batches.
  const date = new Date().toISOString().slice(0, 10);
  const claims = getStore('mahotels-jobs-daily-claims-v1');
  const claim = await claims.set('daily-' + date, date, { onlyIfNew: true });
  if (!claim.modified) { console.log('Daily batch already claimed', date); return; }
  const store = getStore('mahotels-jobs-v1');
  let collected = 0;
  let translated = 0;
  const collectors = [collectAccor, collectRadisson, collectRotana, collectMarriott] as const;
  // Rotate official sources by UTC date so a daily cap of two does not favor Accor forever.
  const offset = Math.floor(Date.parse(date + 'T00:00:00.000Z') / 86400000) % collectors.length;
  const dailyOrder = [...collectors.slice(offset), ...collectors.slice(0, offset)];
  for (const collect of dailyOrder) {
    if (collected >= limit) break;
    let jobs: Vacancy[];
    try { jobs = await collect(5); }
    catch (error) { console.error('Source failure', String(error)); continue; }
    for (const job of jobs) {
      if (collected >= limit) break;
      if (!normalizeApplyUrl(job.applyUrl)) continue;
      if (job.expiresAt && Date.parse(job.expiresAt) < Date.now()) continue;
      const key = await digest(job.source + '|' + job.originalId);
      if (await store.get(key)) continue;
      try {
        const arabic = await translate(job);
        const result = await store.setJSON(key, {
          ...job, key, state: 'ready', apply_url: job.applyUrl,
          arabic_title: arabic.title, arabic_description: arabic.description,
          arabic_requirements: arabic.requirements
        }, { onlyIfNew: true });
        if (result.modified) { collected++; translated++; }
      } catch (error) {
        console.error('Translation or state save failed', job.source, job.originalId, String(error));
      }
    }
  }
  console.log(JSON.stringify({ collected, translated, limit, publish_enabled: false }));
};
// Long-running collection runs separately from the short scheduled dispatcher.
export const config: Config = { background: true };
