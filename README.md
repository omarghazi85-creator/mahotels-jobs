# MAHotels Jobs

Netlify-hosted hotel job ingestion service for MAHotels.net.

## Safety

Collection and WordPress sync are disabled by default. Never commit credentials. All WordPress submissions must be drafts, and old job records must be audited before syncing. This repository does not change the existing WordPress plugin.

## Required configuration

`GROQ_API_KEY`, `GROQ_MODEL`, `JOB_SOURCE_JSON`, `ENABLE_COLLECTION`, `ENABLE_WP_SYNC`, `WP_DRAFT_ONLY`, `WP_SITE_URL`, `WP_USERNAME`, `WP_APP_PASSWORD`, `WP_JOB_REST_BASE`.

**Not production ready:** verified employer source adapters and WordPress authentication are not configured. Do not enable scheduled functions until end-to-end tests pass.
