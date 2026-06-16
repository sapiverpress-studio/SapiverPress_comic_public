# FTPE social set ZIP intake

This folder is the runtime intake location for FTPE advertising set ZIPs.

The repo does **not** need to store the binary ZIPs directly. The daily workflow now reads `config/ftpe-social-drive-zips.json` and downloads the selected ZIP files from the Sapiver Press Google Drive source folder during the run.

Source-of-truth Drive folder:

`https://drive.google.com/drive/folders/1KoatgsUcaWd9zfer_xTjWgyAzz_shvns`

Current expected runtime ZIP files:

- `FTPE_Batch_01_individual_PNGs.zip`
- `FTPE_Batch_02_GitHub_GoogleDrive_campaign_PNGs.zip`
- `FTPE_Batch_03_official_logo_PNGs.zip`
- `FTPE_Batch_04_trust_quality_angles_PNGs.zip`
- `FTPE_SET_05_beginner_journey_FLAT_PNGS_v2.zip`
- `FTPE_SET_06_objection_handling_FLAT_PNGS_v2.zip`
- `FTPE_SET_07_FIXED_CROPS_PNGS-1.zip`
- `FTPE_SET_08_PREMIUM_DELIVERY_WORKFLOW_PNGS.zip`
- `FTPE_SET_09_FIRST_UPLOAD_CONFIDENCE_10_PNGS_WITH_POST_COPY.zip`
- `FTPE_SET_11_SAFE_FIRST_UPLOAD_10_PNGS_WITH_POST_COPY.zip`
- `FTPE_SET_12_ETSY_TO_KDP_ROUTE_10_PNGS_WITH_TEXT.zip`
- `FTPE_SET_15_UK_PUBLISHING_PITFALLS_FLAT_PNGS.zip`

The master image bundle `FTPE_Etsy_Master_Images.zip` downloads into `assets/ftpe/social_master/`.

Known gaps at the time this was wired:

- No visible Drive ZIP for set 10.
- No visible Drive ZIP for set 13.
- No visible Drive ZIP for set 14.

Rules:

- Use real Sapiver Press/FTPE assets only.
- No fake KDP screenshots.
- No fake income screenshots.
- No invented book pages/covers/mockups.
- No guaranteed KDP approval, sales, income, or passive income claims.
- No Amazon/KDP affiliation implication.
- Commercial 900 upgrade content is promo/guide material only.
