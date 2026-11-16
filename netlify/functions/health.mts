// Read-only operational status. Does not expose configuration values, credentials or jobs.
export default async (request: Request) => {
  if (request.method !== 'GET') return new Response('Method not allowed', {status:405});
  const enabled = (name: string, affirmative: string) => Netlify.env.get(name) === affirmative;
  const stopped = !enabled('JOBS_EMERGENCY_STOP','false');
  const collectionEnabled = enabled('ENABLE_COLLECTION','true') && !stopped;
  const publishingEnabled = enabled('ENABLE_WP_SYNC','true') &&
    enabled('WP_JOB_SCHEMA_VERIFIED','true') && !stopped;
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
