# MAHotels Jobs — replacement collector

A separately deployed Netlify job-collection service for **https://mahotels.net/**.

## Preservation rule

The existing **MA Hotels Jobs** WordPress plugin (version 0.7.0 at last verified
read-only inspection) **must remain installed, active, and unchanged during
migration/testing**. After acceptance the user explicitly intends to retire and
remove it, replacing all plugin duties with a lightweight WordPress display/
REST bridge and the external Netlify collector. The old plugin owns
the live job listing post type `ma_hotel_job` and country taxonomy
`ma_job_country`. The new Netlify service replaces the expensive collection/translation work;
**MAHotels Jobs Lite** replaces the old plugin's display and REST registration
while preserving existing job posts, term IDs, page shortcode and job permalinks.

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

### Installable lightweight replacement plugin

Source: `wordpress/mahotels-jobs-lite/mahotels-jobs-lite.php`.

For coexistence QA, the Lite plugin registers the admin-only shortcode
`[ma_hotels_jobs_lite_preview]`. It is **empty for visitors** and lets an
administrator inspect the new job cards on a draft preview page without
replacing the existing `[ma_hotels_jobs]` page. Do not publicly publish the
preview page. This is an inspection tool, not an automation or writer.
The GitHub Actions workflow validates PHP syntax and publishes an **installable
ZIP artifact** named `mah-jobs-lite-installable-zip`.

The existing `/hotel-jobs` page (WordPress page ID 44129) uses
`[ma_hotels_jobs]`. The lightweight replacement retains this exact shortcode
and the existing `ma_hotel_job` post type, `ma_job_country` taxonomy,
`/hotel-job/...` detail URLs, original indexed country routes
`/hotel-jobs/country/<country-slug>`, and WordPress REST API registration. It adds
no WordPress cron, external API calls, translations or expensive post import.

**Do not uninstall the old plugin yet.** Install/verify the new plugin in a
safe staging environment; compare the shortcode page, country filters,
job details, application links, and posts against the current production
view. **Expiry control is a separate acceptance check:** the old plugin advertises
expiry control; Jetpack has not exposed the plugin's private expiry metadata,
so do not assume the lightweight renderer already reproduces that behavior.
Identify and test the original expiry rules before removing the old plugin. When the new Netlify collector and the lightweight WordPress plugin
both pass end-to-end tests: take a backup, switch plugin control in a small
reversible window, confirm all old posts and URLs remain visible, and only
then deactivate the old plugin and verify that no links, job posts or terms
are missing. **Before uninstalling the old plugin**, inspect its uninstall
hooks or `uninstall.php` for data-deletion behavior, take a restorable backup,
and confirm that removing it will not delete existing jobs, taxonomies,
options needed for rollback, or shared content. Only uninstall after this
separate data-retention safety check.

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
   collector. After validation switch the **display plugin** to MAHotels Jobs
   Lite and retire the legacy plugin without deleting its job data.
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
