// Read-only operational status. Does not expose configuration values, credentials or jobs.
export default async (request: Request) => {
  if (request.method !== 'GET') return new Response('Method not allowed', {status:405});
  const enabled = (name: string, affirmative: string) => Netlify.env.get(name) === affirmative;
  const stopped = !enabled('JOBS_EMERGENCY_STOP','false');
  // An enabled flag alone is not readiness: missing credentials must not look operational.
  const tokenReady = (Netlify.env.get('INTERNAL_DISPATCH_TOKEN') ?? '').length >= 32;
  const groqReady = Boolean((Netlify.env.get('GROQ_API_KEY') ?? '').trim());
  const collectionEnabled = !stopped && enabled('ENABLE_COLLECTION','true') &&
    tokenReady && groqReady;
  const publishingEnabled = !stopped && enabled('ENABLE_WP_SYNC','true') &&
    enabled('WP_DRAFT_ONLY','true') && enabled('WP_JOB_SCHEMA_VERIFIED','true') &&
    Netlify.env.get('WP_SITE_URL') === 'https://mahotels.net' &&
    Boolean(Netlify.env.get('WP_JOB_REST_BASE')) && tokenReady &&
    Boolean(Netlify.env.get('WP_USERNAME')) && Boolean(Netlify.env.get('WP_APP_PASSWORD'));
  const body = {
    service: 'mahotels-jobs',
    status: stopped ? 'safe-stop' : 'configured',
    collection: collectionEnabled ? 'enabled' : 'disabled',
    wordpress_sync: publishingEnabled ? 'enabled' : 'disabled',
    checked_at: new Date().toISOString()
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type':'application/json; charset=utf-8',
      'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff'
    }
  });
};
