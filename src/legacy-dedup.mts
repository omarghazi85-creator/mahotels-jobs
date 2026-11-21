import { validateApplyUrl } from './sources.mts';
import type { SavedJob } from './wordpress.mts';

/** A missing, unauthorized or malformed lookup is never treated as a clean result. */
export async function legacyDuplicate(site: string, headers: Record<string,string>, job: SavedJob): Promise<boolean> {
  if (site !== 'https://mahotels.net' || !['accor','radisson','marriott','rotana'].includes(job.source) ||
      !/^[A-Za-z0-9._-]{1,160}$/.test(job.originalId)) throw Error('Unverified source identity');
  const source = validateApplyUrl(job.sourceUrl);
  const apply = validateApplyUrl(job.applyUrl ?? job.apply_url);
  if (!source || !apply) throw Error('Unverified source URLs');
  const endpoint = new URL('/wp-json/mahotels-jobs/v1/source-exists', site);
  for (const url of [...new Set([source, apply])]) {
    const response = await fetch(endpoint, {
      method:'POST', redirect:'error', signal:AbortSignal.timeout(18000),
      headers:{...headers, 'Content-Type':'application/json', Accept:'application/json'},
      body:JSON.stringify({source_url:url,source:job.source,original_id:job.originalId}),
    });
    if (!response.ok) throw Error('Legacy duplicate lookup failed: HTTP ' + response.status);
    const result: unknown = await response.json();
    if (!result || typeof result !== 'object' || typeof (result as {exists?:unknown}).exists !== 'boolean')
      throw Error('Invalid legacy duplicate lookup response');
    if ((result as {exists:boolean}).exists) return true;
  }
  return false;
}
