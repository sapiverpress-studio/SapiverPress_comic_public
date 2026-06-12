# FTPE Daily Social Workflow

This workflow prepares daily Sapiver Press advertising assets for the First-Time Sudoku Publisher Edition / FTPE.

Workflow:

`.github/workflows/ftpe-daily-social.yml`

Manual run options:

- `date_override`: optional `YYYY-MM-DD`
- `platform`: `all`, `pinterest`, `facebook`, or `tiktok`
- `post_mode`: `dry_run` or `live`

Default scheduled run:

- Daily at `08:15 UTC`
- Uses Europe/London date for output folder naming
- Builds deterministic outputs under `social/ftpe/YYYY-MM-DD/`
- Mirrors latest output under `social/ftpe/latest/`

Current safety setting:

- `post_mode` defaults to `dry_run`
- The workflow prepares platform-ready image/copy records but does not publish live posts until platform-specific secrets and target accounts are confirmed.

Asset rule:

Use real FTPE assets only. Do not invent fake Sudoku books, fake KDP screenshots, fake covers, fake product mockups, or fake income screenshots.

Expected asset input:

Add either:

`assets/ftpe/social_master/FTPE_social_master_assets.zip`

or:

`assets/ftpe/social_master/FTPE_social_master_assets.zip.b64`

The ZIP should contain the supplied master PNGs and a `manifest.json`.

Current intended master PNGs:

- `01_why_this_edition_is_different.png`
- `02_first_time_sudoku_publisher_edition.png`
- `03_whats_included.png`
- `04_how_your_download_works.png`
- `05_guided_support_first_time_publishers.png`

Main CTA:

https://sapiverpress.etsy.com

Optional upgrade CTA:

https://sapiverpress.etsy.com?coupon=FTPE2COMMERCIAL

Commercial 900 upgrade rule:

The upgrade link may be used in guide/help/promo campaign material only. It must not appear inside produced books, interiors, covers, or mock book pages.
