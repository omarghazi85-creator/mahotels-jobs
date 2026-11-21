const e=process.env;
const safe=e.CONTEXT==='production'&&e.JOBS_EMERGENCY_STOP==='true'&&e.ENABLE_COLLECTION==='false'&&e.ENABLE_WP_SYNC==='false'&&e.WP_DRAFT_ONLY==='true'&&e.WP_JOB_SCHEMA_VERIFIED==='false'&&e.WP_USERNAME&&e.WP_APP_PASSWORD;
if (!safe) { console.log('WP_HTTP_PROBE skipped'); process.exit(0); }
try {
 const auth=Buffer.from(e.WP_USERNAME+':'+e.WP_APP_PASSWORD).toString('base64');
 const r=await fetch('https://mahotels.net/wp-json/wp/v2/users/me?context=edit',{headers:{Authorization:'Basic '+auth,Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(10000)});
 const ct=(r.headers.get('content-type')||'').toLowerCase();
 const server=(r.headers.get('server')||'').toLowerCase();
 let code='unavailable';
 if(ct.includes('application/json')){let j=await r.json();const allowed=['rest_not_logged_in','rest_forbidden','rest_cannot_view','rest_cookie_invalid_nonce','application_passwords_disabled','incorrect_password','invalid_username','rest_no_route'];code=allowed.includes(j.code)?j.code:'other';}
 console.log('WP_HTTP_PROBE '+JSON.stringify({http:r.status,content_type:ct.includes('application/json')?'json':ct.includes('text/html')?'html':'other',server:server.includes('cloudflare')?'cloudflare':server.includes('litespeed')?'litespeed':server.includes('nginx')?'nginx':server.includes('apache')?'apache':'other-or-missing',cloudflare_header:r.headers.has('cf-ray'),code}));
} catch {console.log('WP_HTTP_PROBE request-failed');}
