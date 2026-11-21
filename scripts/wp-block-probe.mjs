const e=process.env;
if (!(e.CONTEXT==='production'&&e.JOBS_EMERGENCY_STOP==='true'&&e.ENABLE_COLLECTION==='false'&&e.ENABLE_WP_SYNC==='false'&&e.WP_DRAFT_ONLY==='true'&&e.WP_JOB_SCHEMA_VERIFIED==='false'&&e.WP_USERNAME&&e.WP_APP_PASSWORD)){console.log('WP_BLOCK_CHECK skipped');process.exit(0)}
try {
 const auth=Buffer.from(e.WP_USERNAME+':'+e.WP_APP_PASSWORD).toString('base64');
 const r=await fetch('https://mahotels.net/wp-json/wp/v2/users/me?context=edit',{headers:{Authorization:'Basic '+auth,Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(10000)});
 const ct=(r.headers.get('content-type')||'').toLowerCase();const b=(await r.text()).slice(0,100000).toLowerCase();
 const markers={cf_mitigated_challenge:r.headers.get('cf-mitigated')==='challenge',cloudflare_ray_body:b.includes('cloudflare ray id'),cloudflare_block_message:b.includes('sorry, you have been blocked'),cloudflare_security_service:b.includes('security service to protect itself from online attacks'),cloudflare_error_1020:b.includes('error 1020'),cloudflare_challenge:b.includes('just a moment')||b.includes('checking your browser'),wordfence:b.includes('wordfence'),litespeed:b.includes('litespeed'),wp_rest_json:ct.includes('application/json')};
 console.log('WP_BLOCK_CHECK '+JSON.stringify({http:r.status,content_type:ct.includes('text/html')?'html':ct.includes('application/json')?'json':'other',markers}));
} catch {console.log('WP_BLOCK_CHECK request-failed')}
