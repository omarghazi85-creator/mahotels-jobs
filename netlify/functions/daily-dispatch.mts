import type { Config } from '@netlify/functions';

// Runs once a day (02:00 UTC = 05:00 Riyadh). It only dispatches.
// No external recruitment, Groq, or WordPress work happens in this 30s function.
const env = (key: string) => Netlify.env.get(key) ?? '';
export default async () => {
  if (env('JOBS_EMERGENCY_STOP') !== 'false' || env('ENABLE_COLLECTION') !== 'true') {
    console.log('MAHotels jobs schedule disabled');
    return;
  }
  const token = env('INTERNAL_DISPATCH_TOKEN');
  const site = env('URL');
  if (!token || token.length < 32 || !/^https:\/\/[-a-z0-9.]+$/i.test(site)) {
    console.error('Scheduler is missing verified internal dispatch configuration');
    return;
  }
  const target = new URL('/.netlify/functions/collect', site);
  // Netlify background functions return 202. Never wait for the long job here.
  const response = await fetch(target, {
    method: 'POST',
    headers: { 'x-mahotels-dispatch-token': token },
    signal: AbortSignal.timeout(10000)
  });
  if (response.status !== 202) {
    console.error('Background dispatch rejected', response.status);
    return;
  }
  console.log('Background collection queued', response.status);
};
export const config: Config = { schedule: '0 2 * * *' };
