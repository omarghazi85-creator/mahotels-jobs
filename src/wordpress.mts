import { normalizeApplyUrl } from './sources.mts';

export type SavedJob = {
  key: string; source: string; originalId: string; title: string;
  company: string; hotel?: string; country: string; city: string; sourceUrl: string;
  applyUrl?: string; apply_url?: string; postedAt?: string; expiresAt?: string;
  arabic_title: string; arabic_description: string; arabic_requirements?: string;
  state: string; wordpress_id?: number
};
export const COUNTRY_TERMS: Record<string, number> = Object.freeze({
  'Saudi Arabia': 7473, 'United Arab Emirates': 7474, Bahrain: 7475,
  Oman: 7476, Jordan: 7477, Egypt: 7478, Lebanon: 7479, Morocco: 7480
});
export function escapeHTML(value: string): string {
  return value.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}
export function jobSlug(job: SavedJob): string {
  if (!/^[a-f0-9]{64}$/.test(job.key)) throw Error('Invalid canonical job key');
  return 'ma-jobs-' + job.key.slice(0, 32);
}
export function applicationLink(job: SavedJob): string | undefined {
  return normalizeApplyUrl(job.applyUrl ?? job.apply_url);
}
export function duplicateLinks(post: {content?: {raw?: string; rendered?: string}; meta?: Record<string,unknown>}): Set<string> {
  const links = new Set<string>();
  const html = post.content?.raw ?? post.content?.rendered;
  if (typeof html !== 'string') throw Error('Audit content missing, refuse to write');
  for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    const link = normalizeApplyUrl(m[1].replace(/&amp;/g, '&'));
    if (link) links.add(link);
  }
  if (post.meta) for (const [key,value] of Object.entries(post.meta)) {
    if (/url|link|apply|source|job/i.test(key) && typeof value === 'string') {
      const link = normalizeApplyUrl(value);
      if (link) links.add(link);
    }
  }
  return links;
}
export function renderDraft(job: SavedJob) {
  const apply = applicationLink(job);
  const term = COUNTRY_TERMS[job.country];
  if (!apply || !term || !job.sourceUrl || !job.originalId ||
    !job.arabic_title?.trim() || !job.arabic_description?.trim()) {
    throw Error('Missing verified WordPress draft fields');
  }
  const paragraph = (value:string) => '<p>' + escapeHTML(value).replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>') + '</p>';
  const requirements = job.arabic_requirements?.trim()
    ? '<h2>المتطلبات</h2>' + paragraph(job.arabic_requirements) : '';
  const sourceLink = normalizeApplyUrl(job.sourceUrl);
  if (!sourceLink) throw Error('Invalid original source URL');
  const sourceDetails = '<p><strong>المصدر:</strong> ' + escapeHTML(job.source) +
    '<br><strong>معرّف الإعلان:</strong> ' + escapeHTML(job.originalId) + '</p>';
  const hotel = job.hotel?.trim() ? '<br><strong>الفندق:</strong> ' + escapeHTML(job.hotel) : '';
  const posted = job.postedAt && /^20\\d{2}-\\d{2}-\\d{2}/.test(job.postedAt)
    ? '<p><strong>تاريخ الإعلان:</strong> ' + escapeHTML(job.postedAt.slice(0, 10)) + '</p>' : '';
  const expiry = job.expiresAt && /^20\\d{2}-\\d{2}-\\d{2}/.test(job.expiresAt)
    ? '<p><strong>تاريخ انتهاء التقديم:</strong> ' + escapeHTML(job.expiresAt.slice(0, 10)) + '</p>' : '';
  const content = '<p><strong>الشركة:</strong> ' + escapeHTML(job.company) + hotel +
    '<br><strong>المدينة:</strong> ' + escapeHTML(job.city) + '</p>' +
    '<h2>الوصف الوظيفي</h2>' + paragraph(job.arabic_description) +
    requirements + posted + expiry + sourceDetails +
    '<p><a href="' + escapeHTML(apply) +
    '" rel="nofollow noopener noreferrer" target="_blank">التقديم من المصدر الأصلي</a></p>' +
    '<p><a href="' + escapeHTML(sourceLink) +
    '" rel="nofollow noopener noreferrer">الإعلان الأصلي</a></p>';
  return {title:job.arabic_title,content,slug:jobSlug(job),status:'draft' as const,
    ma_job_country:[term]};
}
