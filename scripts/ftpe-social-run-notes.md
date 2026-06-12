# FTPE social run notes

The daily workflow has been created, but live posting remains intentionally dry-run until platform secrets and target accounts are explicitly confirmed.

Prepared workflow:

- `.github/workflows/ftpe-daily-social.yml`
- `scripts/build-ftpe-daily-social.mjs`
- `scripts/post-ftpe-social.mjs`
- `config/ftpe-social-campaign.json`

Output folders:

- `social/ftpe/YYYY-MM-DD/`
- `social/ftpe/latest/`

Asset requirement:

- Add `assets/ftpe/social_master/FTPE_social_master_assets.zip` or `.zip.b64`.

The workflow will decode/use that master asset pack and rotate campaign entries daily.
