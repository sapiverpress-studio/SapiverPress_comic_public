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
**Released via PRs #39/#40. Second live attempt failed at YouTube status read-back; an upload may already exist. Pinterest and temporary-media deletion remain unverified.** No new OAuth connection or service subscription has been requested.

## 2026-10-19 — YouTube upload-only permission regression
- VERIFIED: job 118156008412 / run 39281324315 provisions ffprobe, then fails with Google HTTP 403 before Pinterest. Runs/jobs metadata returned stale queued state; completed job logs are the evidence.
- VERIFIED: read-only diagnostic run 39282383974 returns only youtube.upload scope and reproduces videos.list HTTP 403 / insufficientPermissions. No media posted or Pinterest token rotation performed by diagnostic.
- FIX: scripts/sapiverprints-youtube.mjs validates the ID and returned public privacy plus uploaded/processed status from videos.insert. No new OAuth grant or videos.list permission required. Accepted upload does not guarantee completed processing or eventual playback. Private, unlisted, missing and rejected status fail closed.
- Log accepted video ID before validation/receipt errors for recovery. HTTP failures expose path and machine-readable reasons only. Mask the scoped media ticket before the step using it.
- TESTED locally: 9 YouTube regression cases and all 8 existing Pinterest cases pass; publisher syntax passes. PR CI/release pending.
- Old failed attempt did not retain its video ID before read-back failed. Check existing Neo-Deco upload before reposting. Its uploader state needs_attention and expiring ticket prevent blind retry.
- No uploader, Netlify, schedule, Etsy, supplier or monthly-cap changes. Remove temporary diagnostic workflow from final changes.

## CI checkpoint, 2026-10-19
- Verified: video syntax/Pinterest test workflow 39254486345 SUCCESS; existing Pinterest test 39254486328 SUCCESS on draft PR #39.
- Paired uploader draft PR #49 passed CI 39254699127. Neither PR merged or deployed; no live MP4 published. Cross-repo trigger rights and platform APIs are not validated by these unit checks.

## 2026-10-19 16:27 BST — Real video publication failure and tooling fix
- Confirmed production Comic workflow_dispatch run [39277137372](https://github.com/sapiverpress-studio/SapiverPress_comic_public/actions/runs/39277137372) started at 15:21:16Z (16:21 BST), ended failed at 15:22:47Z. GitHub job log: `spawn ffprobe ENOENT`. The video had been downloaded and passed checksum checks, but the workflow could not inspect its media streams. **No YouTube or Pinterest publishing step was reached in this run.**
- This also confirms that at least one dispatch from the protected uploader succeeded using current token configuration. A screenshot showing dispatch HTTP 404 could reflect a separate attempt; avoid assuming the whole permission setup is invalid or rotating tokens unnecessarily.
- On `fix/sapiverprints-video-ffprobe-20261019`, added `scripts/ensure-video-probe.sh` and runs it before video publication. It installs distribution `ffmpeg` only when `ffprobe` is missing, failing before social calls if unavailable. PR CI now checks and provisions `ffprobe` on the actual GitHub Ubuntu runner.
- Staged fix only; no scheduled workflows changed, no real social posts or website deployments triggered by this change. CI status to be recorded after checks. A fresh owner-approved upload will be needed because the original 45-minute media ticket and fail-closed state should not be blindly retried.

### Release verification
- PR #41 merged as 1111b20a76d84948f5bc3c61e2a09c4de2eff3f3; corrected helper read back on main.
- GitHub job 118159907461 completed all 17 tests with zero failures (logs at 16:06:49 UTC). This supersedes the pending CI/release note above.
- End-to-end publication and private source deletion remain unverified. Existing failed upload needs its YouTube URL checked before recovery; do not submit another copy blindly.
