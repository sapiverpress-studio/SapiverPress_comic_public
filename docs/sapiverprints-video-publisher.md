# Sapiver Prints — owner-uploaded video promotion (staged)

## Scope
This is an isolated manual publisher for 10-second vertical MP4 videos, not part of the daily Comic, Sapiver Forge, Etsy listing, or PrintShrimp ordering pipelines.

- The existing password-protected poster studio supplies the upload UI using its **existing** owner session, not another password.
- A temporary private video is stored in a separate Netlify Blob store on the existing uploader site. An owner press of **Deploy** dispatches the dedicated Comic workflow; it does not start a Netlify build.
- A short-lived encrypted ticket in workflow inputs authorises Comic to fetch **that exact upload only**. Never print the token, include it in source control, persist it to an artifact or reuse it in unrelated workflows.
- Comic uses its existing YouTube OAuth client/refresh token and existing Pinterest client/rotating refresh token. The dedicated target board is **Sapiver Prints**, not the puzzle/Comic board. The workflow shares the rotating Pinterest token concurrency group with the existing catalog Pins workflow.
- YouTube Shorts description and Pinterest Pin description include https://sapiverprints.etsy.com. The Pinterest Pin link points to that Etsy shop.
- After each confirmed platform submission, Comic sends a receipt (platform ID only) to the protected poster backend. The backend deletes the MP4 after **both** receipts, retaining safe IDs and timestamps only.
- On failure the file is retained and the status moves to needs_attention. Do not blindly rerun; a successful upload can exist even if receipt delivery failed. Failed upload cleanup can be reviewed without repeating posts.

## Required checks before release
1. Node syntax tests on the isolated branch.
2. Validate the existing uploader site's POSTER_GITHUB_ACTIONS_TOKEN (or COMIC_GITHUB_TOKEN) has Actions write access to **this** repository. Credentials are scoped per repo, not inherited just because another repo uses YouTube.
3. Merge/release this Comic workflow **before** the paired Poster_gen site update.
4. Perform one owner-approved 10-second test upload. Confirm the correct YouTube channel, public visibility, correct Pinterest board and Etsy link, saved video IDs, and physical Netlify Blob deletion.
5. Check neither existing daily social publisher nor the 52/month product cap was changed.

## Live status
**Staged only as of 2026-10-19. No video has been published through this workflow.** No new OAuth connection or service subscription has been requested. No deployment is implied by this document.

## CI checkpoint, 2026-10-19
- Verified: video syntax/Pinterest test workflow 39254486345 SUCCESS; existing Pinterest test 39254486328 SUCCESS on draft PR #39.
- Paired uploader draft PR #49 passed CI 39254699127. Neither PR merged or deployed; no live MP4 published. Cross-repo trigger rights and platform APIs are not validated by these unit checks.
