// Read-only diagnostics of public recruitment endpoints; never print descriptions or tokens.
const endpoints = {
  accor: 'https://api.smartrecruiters.com/v1/companies/AccorHotel/postings?limit=100',
  radisson: 'https://api.smartrecruiters.com/v1/companies/RHG/postings?limit=100',
  rotana: 'https://www.workable.com/api/accounts/rotana-hotels?details=true',
  marriott: 'https://careers.marriott.com/jobs?location=Saudi%20Arabia'
};
for (const [source, url] of Object.entries(endpoints)) {
  try {
    const res = await fetch(url, {signal:AbortSignal.timeout(12000)});
    console.log(JSON.stringify({source, status:res.status, contentType:res.headers.get('content-type')}));
    if (!res.ok) continue;
    if (source === 'marriott') {
      const html = await res.text();
      const jobLinks = [...html.matchAll(/href=["']([^"']+\/job\/[A-Za-z0-9-]+)[^"']*["']/gi)].slice(0,3).map(m=>m[1].slice(0,140));
      console.log(JSON.stringify({source, htmlLength:html.length, jobLinks, jobPostingMarkup:/application\/ld\+json/i.test(html)}));
      continue;
    }
    const data = await res.json();
    const rows = Array.isArray(data?.content) ? data.content : Array.isArray(data?.jobs) ? data.jobs : Array.isArray(data?.openings) ? data.openings : [];
    const first = rows.find(x=>x && typeof x === 'object') ?? {};
    const location = first.location ?? {};
    const sample = {
      id: first.id ?? first.shortcode ?? null,
      country:location.country ?? location.country_code ?? null,
      city:location.city ?? null,
      referenceType:typeof(first.ref),
      sourceUrlType:typeof(first.url),
      detailType:typeof(first.description)
    };
    const countries = [...new Set(rows.map(x => x?.location?.country ?? x?.location?.country_code ?? '').filter(Boolean))].slice(0,25);
    console.log(JSON.stringify({source, rootKeys:Object.keys(data ?? {}).slice(0,20),
      rowCount: rows.length, firstKeys:Object.keys(first).slice(0,35),
      locationKeys:Object.keys(location), countries, sample}));
  } catch (e) {console.error(JSON.stringify({source, error:String(e)}));}
}

try {
  const example = 'https://careers.marriott.com/saudi-arabia-voyage-program-march-2027-revenue-management/job/P1-7341523-0';
  const r = await fetch(example, {signal:AbortSignal.timeout(12000)});
  const html = r.ok ? await r.text() : '';
  const scripts = html.match(/<script[^>]*>/gi) ?? [];
  const ldScripts = scripts.filter(m=>m.includes('ld+json'));
  const { parseMarriottJob } = await import('../src/marriott.mts');
  const parsed = parseMarriottJob(html, example);
  console.log(JSON.stringify({source:'marriott-single',status:r.status,htmlLength:html.length,
    scriptCount:scripts.length,jsonLdCount:ldScripts.length,
    jobPostingMarkup:/JobPosting/.test(html),countryFound:/Saudi Arabia/.test(html),
    parsed:Boolean(parsed),reasonsToInspect: parsed ? [] : ['JSON-LD structure, posting identifiers, location and application URL']}));
} catch (error) {console.error(JSON.stringify({source:'marriott-single',error:String(error)}));}
