import {validateApplyUrl} from './sources.mts';
import type {SavedJob} from './wordpress.mts';

/** No inferred expiry, source-check date, or Arabic-ready flag. */
export function draftFields(job: SavedJob) {
  const source_url = validateApplyUrl(job.sourceUrl);
  const company = (job.hotel?.trim() || job.company?.trim() || '');
  const city = job.city?.trim() || '';
  const role = job.arabic_title?.trim() || '';
  if (!source_url || !company || !city || !role ||
      !['accor','radisson','marriott','rotana'].includes(job.source) ||
      !/^[A-Za-z0-9._-]{1,160}$/.test(job.originalId)) throw Error('Missing draft metadata');
  const date = (value?: string): string | undefined => {
    if (!value) return;
    const part = value.slice(0,10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(part) || !Number.isFinite(Date.parse(part)) ||
        new Date(part).toISOString().slice(0,10) !== part) throw Error('Invalid source date');
    return part;
  };
  const posted_on = date(job.postedAt), expires_on = date(job.expiresAt);
  return {source:job.source, original_id:job.originalId, source_url, company, city, role,
    ...(posted_on ? {posted_on}:{}), ...(expires_on ? {expires_on}:{})};
}

export function verifiedDraftFields(payload: ReturnType<typeof draftFields>, result: unknown, id: number): boolean {
  if (!result || typeof result !== 'object') return false;
  const r = result as {id?:unknown;status?:unknown;fields?:Record<string,unknown>};
  const providers: Record<string,string> = {accor:'AccorHotel',radisson:'RHG',marriott:'Marriott',rotana:'Rotana'};
  if (r.id !== id || r.status !== 'draft' || !r.fields || r.fields.ar_ready !== '0' ||
      r.fields.verified_on !== '' || r.fields.source_id !== providers[payload.source]+':'+payload.original_id) return false;
  for (const key of ['source_url','company','city','role','posted_on','expires_on'] as const) {
    if ((r.fields[key] ?? '') !== (payload[key] ?? '')) return false;
  }
  return true;
}
