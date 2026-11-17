# MAHotels Jobs — replacement collector

A separately deployed Netlify job-collection service for **https://mahotels.net/**.

## Preservation rule

The existing **MA Hotels Jobs** WordPress plugin (version 0.7.0 at last verified
read-only inspection) **must remain installed, active, and unchanged**. It owns
the live job listing post type `ma_hotel_job` and country taxonomy
`ma_job_country`. The new Netlify code is a replacement for the expensive
collection/translation workload, **not a replacement for the site's currently
working job display, links, or published records**.

Never copy plugin option values, API keys, WordPress application passwords, or
private tokens into this public repository, Actions logs, or issue/PR comments.

## Deployment

- Existing Netlify project: `mahotels-jobs`
- Netlify site ID: `62afe289-1813-4a34-8605-4f2d045cdd4b`
- Staging/review branch: `fix/safe-netlify-jobs-20261116`
- Publish directory: `public`
- Build command: `npm run build`
- Functions: `netlify/functions`
- Runtime: Node.js 22
- Keep the emergency stop on while validating the deployment

The current Netlify environment has `JOBS_EMERGENCY_STOP=true`,
`ENABLE_COLLECTION=false`, `ENABLE_WP_SYNC=false`,
`WP_JOB_SCHEMA_VERIFIED=false`, `WP_DRAFT_ONLY=true`, and
`MAX_JOBS_PER_DAY=2` already set and independently read back.

### Existing credentials in the old WordPress plugin

The operator reports that Groq and WordPress-related keys are already
configured inside the old plugin. This must be treated as a **possible source
of existing credentials, not evidence of their names, readability,
compatibility, or permissions**. Jetpack's plugin listing API confirms plugin
status but **does not expose WordPress option secrets or plugin configuration**.

Read the plugin's existing configuration using an authorized secure
administrative capability, if available. Reuse only the **appropriate** keys,
and copy them **directly into Netlify secret environment variables** without
logging, exporting to a file, or displaying their values. An existing Groq key
may be reusable; a WordPress account/application password and Netlify-only
internal dispatch token are separate credential types and must not be
presumed to exist in the plugin. If Netlify secret creation is denied, **stop**
rather than storing a secret as a regular environment variable.

The new system must not call the old plugin's private options from a public
endpoint or install an unauthenticated endpoint to reveal them.

### Activation gates

1. Publish and inspect the safe-stop deployment first.
2. Check the `/.netlify/functions/health` endpoint. It must report
   `safe-stop` while the emergency stop is on.
3. Install the required secrets securely, test an authenticated Groq
   translation against one official vacancy, and review its factual fidelity.
4. Validate the authenticated WordPress REST type, country taxonomy and
   authorization (public REST gave HTTP 403 in prior read-only CI probe).
5. Audit legacy records and test **one** new draft only. Verify the slug,
   country term, canonical-source duplicate check, original **unmodified**
   application URL and resulting plugin display.
6. Confirm that any old collector's scheduling cannot race with the new
   collector, without deactivating or modifying the old display plugin.
7. Turn on the schedule only after those checks and retain the maximum of
   **two translation attempts per UTC day**.

No merge to `main`, secret exposure, automatic posting, or unexpected
WordPress/plugin changes are authorized by this checklist.

## Commands

```sh
npm install --ignore-scripts --no-audit --no-fund
npm run build
npm test
npm run check:function-bundles
node --experimental-strip-types tests/live-smoke.mjs
```

The live smoke is **read-only**, doesn't call Groq, and doesn't publish to
WordPress. The CI workflow runs these checks automatically on the work branch.

## Scope of source adapters

Accor and Radisson: SmartRecruiters; Rotana: Workable; Marriott: official
career pages. No invented vacancies, expiry dates, salary or requirements.
Countries are restricted to the existing WordPress country terms.
