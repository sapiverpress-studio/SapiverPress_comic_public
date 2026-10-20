# Sapiver Prints → Pinterest automatic organic Pins

This publisher is separate from the Comic puzzle series, Sapiver Forge Daily Brief, and existing AI-social schedules.

## Source and ownership
- Public-only live catalogue: https://raw.githubusercontent.com/sapiverpress-studio/SapiverForge/main/data/etsy-public-catalog.json
- Source: the correct live Etsy shop `SapiverPrints`, active published listings with Etsy images.
- No Etsy credentials or PrintShrimp order data are transferred to Comic or Pinterest.
- Pinterest board: **Sapiver Prints**, deliberately distinct from **Sapiver Forge** and the old puzzle/Comic board.
- It creates standard organic image Pins; they link to each individual Etsy listing, rather than the home page.
- Pinterest title is the short design name before an em dash/en dash/pipe when available. The description uses the approved public Etsy text.

## Posting and volume
- Workflow: `.github/workflows/sapiverprints-pinterest.yml`
- Automatic schedule: 09:43, 13:43 and 17:43 **UTC** (UK clock changes during BST).
- **Maximum one new Pin per run**, or nominally three per day. Not all due to GitHub schedule delays, API availability, or other policies.
- Initial backlog: existing public listings will be posted gradually under the same one-per-run limit.
- On newly added Etsy listings, the next successful SapiverForge public-feed refresh (four-hour schedule), followed by a Comic run, makes the Pin eligible. There is no direct instant Etsy webhook or live publishing claim.
- Repeated products will not be repinned: receipt IDs are committed under `social/sapiver-prints/pinterest-receipts.json`. Before posting, Comic also checks existing Pins in the target board for identical canonical Etsy listing links, recovering from missing GitHub receipts.
- If more than 2,000 board Pins exist and a full duplicate scan cannot be completed, stop instead of blindly posting.

## Authentication and safety
- Comic uses its existing Pinterest OAuth refresh credentials; Github rotates the replacement refresh token into `PINTEREST_REFRESH_TOKEN` after each use, with no plaintext logging.
- The two existing workflows that use the same rotating token now share a repository concurrency group with this publisher to prevent overlapping token rotations.
- The public feed is rejected if expired (5.5 hours), from an unexpected shop, duplicate, or containing non-Etsy image/link URLs.
- Pinterest failure stops publication and produces no false success receipt.
- If posting succeeds but saving a local receipt fails, the following run checks the remote board before creating a Pin.
- The Etsy shop, PrintShrimp fulfilment, Netlify deploy process, and original Comic/Sapiver Forge publication outputs are not changed.
- This is ordinary organic Pin publishing, **not** Pinterest shopping catalogues, product tagging, paid advertisements, or Etsy fulfilment automation.

## Operation
- Run `node --test test/sapiverprints-pinterest.test.mjs` before releasing.
- Check `Actions → Auto-post Sapiver Prints Etsy products to Pinterest` for publication/rotation result.
- Verify the created Pin is on the dedicated Sapiver Prints board, matches the artwork and links to the correct Etsy listing.
- Do not force reruns without reviewing the receipt and remote Pinterest board.
- To stop automation without modifying working Comic news workflows: disable just the `Auto-post Sapiver Prints Etsy products to Pinterest` scheduled GitHub Action.

## 2026-10-20 — All active Etsy listings get an individual Pin (RELEASE PENDING)
- Owner request: Pin every ACTIVE SapiverPrints listing, preferably immediately after Etsy publication, not one per day. Continue using Etsy's public primary photo, short listing description, and direct canonical listing URL. Preserve existing Sapiver Prints board and historical Pin IDs.
- Read-only initial audit: 32 active Etsy listings (feed generated 2026-10-19T21:03:42Z); 26 Pinterest listing receipts. Six pending: Neo-Deco Jazz (Midnight Keys, Golden Voice, Blue Groove, Amber Strings) and Capybara Christmas (Christmas Bath, Festive Slumber).
- Comic workflow now permits max 20 new Pins per run instead of one; maintains 30-second pacing, increases timeout to 20 minutes. Existing script validates Etsy public feed, scans target board for matching canonical listing links, and persists listing ID / Pin ID receipts. Script cap remains 25.
- Trigger: workflow_dispatch after SapiverForge detects new ACTIVE Etsy IDs; hourly safety fallback at minute 15 UTC. Paired SapiverForge workflow polls Etsy at :07/:37 UTC and dispatches Comic only after successful catalogue commit using preexisting CROSS_REPO_GITHUB_TOKEN. This is near-real-time (approximately 30 minutes plus GitHub/API latency), NOT guaranteed instantaneous or an Etsy webhook.
- No new password, Pinterest OAuth, Netlify deploy, Etsy write, PrintShrimp order, video workflow or daily social changes.
- Status: staged on isolated branch. Unit tests and live Pin receipts pending. Release Comic first, Forge second, and independently verify initial six-Pin backlog before claiming 32/32.

## 2026-10-20 05:25 BST — All 32 active Etsy listing Pins posted and recorded (VERIFIED)
- PR #43 merged to Comic main as 93be96de2f117513c6d38122cdb35e1b58706fb1 with [skip netlify]. GitHub PR check run 39368892212 SUCCESS: all 10 Pinterest tests passed.
- The new Comic workflow automatically started live push-triggered run 39369252389, completed SUCCESS at 2026-10-20T04:25:32Z. Publisher log reported six real Pin creation receipts for the previously missing active Etsy listings and final result created=6, pending=0, found=0, boardId 1038924276479981121.
- Newly posted real IDs: Midnight Keys Etsy 4598484808 -> Pin 1038924207812656880; Golden Voice Etsy 4598484568 -> Pin 1038924207812656888; Blue Groove Etsy 4598484374 -> Pin 1038924207812656893; Amber Strings Etsy 4598461481 -> Pin 1038924207812656909; Christmas Bath Etsy 4597459356 -> Pin 1038924207812656920; Festive Slumber Etsy 4597458802 -> Pin 1038924207812656925.
- Cross-checked public SapiverForge feed (32 active listing IDs) against main-branch social/sapiver-prints/pinterest-receipts.json after run: 32 matching listing IDs, zero missing. Receipt verification is not a manual visual check of every Pinterest Pin image.
- Future listings: SapiverForge PR #137 merged as c1ed51892d54090244a01d82a15413cc637d810c. Live check run 39369033723 SUCCESS: refreshed 32-item verified public feed at 2026-10-20T04:21:39Z, no new listings in that run. Thirty-minute checking and on-new-listing cross-repo dispatch are IMPLEMENTED but the first NEW-listing-to-Comic dispatch has NOT yet been end-to-end exercised. Comic hourly fallback provides redundancy; GitHub scheduling may delay execution.
- No changes to existing Pinterest video publisher, Etsy listings, PrintShrimp orders or poster Netlify uploader. No Netlify deployment was requested by these repository changes.
- This documentation-only commit uses [skip netlify] and does not modify any executable workflow.

## 2026-10-20 — Selectively remove old Sapiver Forge Pins (AUDIT STAGED, NO DELETIONS YET)
- Owner requested deleting INDIVIDUAL Sapiver Forge-related Pins on existing Pinterest account without deleting boards or Sapiver Prints images/videos.
- Confirmed old 'Applied AI Gate System' social distribution GitHub workflow remains disabled (if:false). Approved Daily Brief social bridge only runs with explicit workflow_dispatch SEND; no automatic schedule in that workflow. Existing Sapiver Prints hourly image Pin and dedicated video publisher must remain unchanged.
- Prepared scripts/cleanup-sapiver-forge-pins.mjs with read-only Pinterest GET /boards and /pins inventory, precise brand identification by exact 'Sapiver Forge' board or explicit 'Sapiver Forge'/'Clearforge' title/description, strong Sapiver Prints Etsy/shop, board, branding, and historic 32 Pin receipt protection. Requires removal ownership, excludes unmarked pins. Exact candidate IDs are snapshotted with SHA256 before any delete.
- New .github/workflows/forge-pin-selective-cleanup.yml first runs AUDIT ONLY after tested merge, using existing Pinterest OAuth and shared rotation lock. It saves public pin IDs/board names and safe title/link metadata to social/sapiver-forge/pin-cleanup-audit.json, with no Pin deletion. Secret rotation persists safely. A separate reviewed workflow edit + exact audit hash will be required to permit deletion, after verifying live target IDs.
- Expected: preserve current Sapiver Prints photos, verified individual product destinations, video Pins and unrelated boards. No Netlify deploy, Etsy listing mutation, PrintShrimp action, daily social trigger or Work-credit use.
- Pending: GitHub PR tests, first live Pinterest inventory, SHA-locked individual Pin DELETE, post-deletion verification and cleanup workflow disablement. Do not report deletion until Pinterest API confirms.

## 2026-10-20 15:11 BST — First real Pinterest inventory correction (AUDIT ONLY)
- VERIFIED: audit workflow 39436128116 SUCCESS; Pinterest API returned 746 owned/saved Pins across 13 boards, with one explicitly named 'Sapiver forge', one 'Clearforge', and the protected 'Sapiver Prints'. Old audit saved 35 protected, 0 deletion candidates and 711 others because an invalid condition treated Pinterest is_removable=false as 'no delete permission'.
- CORRECTION: Pinterest documentation defines is_removable as the ad-only Pin option, not ordinary ability to delete a Pin. The 0 candidate outcome was a filter error, **not** evidence there were no Forge Pins. No DELETE call made.
- This branch drops that invalid filter, explicitly includes the legacy 'Clearforge' board along with Sapiver Forge, keeps strict Sapiver Prints board/branding/direct Etsy destination/32 receipt safeguards, records is_owner and ad-only flags for auditing, and limits GitHub checkout to relevant files. It requires a fresh read-only inventory and signed reviewed manifest before deleting a single Pin.
- Next: CI, merge and rerun read-only inventory. Then review candidate count and exact board IDs and execute individually audited Pin DELETE; boards must never be deleted.

## 2026-10-20 15:16 BST — Owner-authorised individual Forge Pin deletion (STAGED; not yet executed)
- Live read-only Pinterest audit run 39437580195 SUCCESS: 746 Pins enumerated; 110 exact candidates: 109 individually identified owned Pins on board 1038924276479917183 ('Sapiver forge') and 1 owned Pin on board 1038924276479929523 ('Clearforge'). SHA256 of canonical candidate ID+board ID list: 6e807d28be47126b07b2c71ffd8af15122b4a9ee150285e26ee945e533bfbae3. All 110 candidates had is_owner=true.
- 35 Sapiver Prints Pins protected by board, branding/shop links and the existing 32 verified product Pin receipt IDs. 601 other account Pins explicitly excluded. No boards are deletion targets.
- This isolated workflow release locks deletion mode to that exact audit SHA and recomputes the live candidate classification and board mapping immediately before each individual DELETE. Changed/missing/protected Pins are excluded; any unexpected API error stops the batch. The existing workflow persists result IDs and safe rotating refresh token under the shared Pinterest token lock.
- Owner explicitly authorised deleting individual Sapiver Forge Pins, delegated execution. No new permission request. Release only after green GitHub PR tests. Confirm actual 204 DELETE receipts, verify protected Prints Pins and document success/partial outcome. Disable one-off automatic DELETE mode after execution.
- No Netlify builds, Etsy/shop listing changes, supplier orders, video upload changes or direct board deletion.

## 2026-10-20 16:00 BST — Additional older Forge Pins, second read-only inventory
- User reiterated delete remaining Forge-related Pins. Original deletion report confirms 110/110 individual DELETE successes, zero misses, then full API scan 636 Pins remaining: 0 exact Forge/Clearforge candidates, 35 Sapiver Prints protected, 601 others.
- Some OTHER boards include 'a.i news feed' and 'Social'. Their content was not classified from titles in the preserved old audit (only six unrelated samples), so cannot conclude all historically Forge-related pins have been deleted. Do not delete whole boards or 601 miscellaneous Pins without positive identification.
- Added read-only unrelatedBoardReview counts and title/link samples, plus aiNewsSample for these older boards. The existing audit workflow remains strictly PINTEREST_CLEANUP_MODE=audit, with no DELETE step. Run existing tests and re-audit. Preserve exact 32 product receipts, protected promo videos and unrelated publishing/sudoku content.
- Next: inspect actual sampled Pin titles, links and ownership. If individually Forge-related identify immutable Pin IDs before any selective second cleanup, otherwise report no supported further targets. No Netlify/Work credits.

## 2026-10-20 — Owner-approved three-board Pinterest cleanup (STAGED — NO BOARD DELETIONS YET)
- Owner explicitly changed scope to DELETE all unwanted boards, not only individual Pins, and retain precisely three: Sapiver Prints (board ID 1038924276479981121), Sapiver Press Publishing (1038924276479876865), Social (1038924276479983705). Preserve all Pins on these boards, including the 32 verified Etsy product receipts and 3 additional Sapiver Prints video/marketing records.
- Fresh Pinterest owned-board/Pins inventory captured at 2026-10-20T15:13:37.487Z: 12 total boards (3 protected + nine unwanted). The three protected hold 35+587+25=647 Pins. Other nine hold ten owned/saved Pins. Previously 110 Forge/Clearforge Pins deleted, with verified 204 receipts. The last new inventory also marked 19 Forge-labelled Instagram reels on the Social board: these MUST remain by the owner's current protected-board instruction.
- Nine eligible board IDs/names (fixed, exact allowlist): a.i news feed 1038924276479911800 (2 Pins); AntiKing Sudoku 1038924276479841292 (1); Clearforge 1038924276479929523 (0); Facebook puzzles 1038924276479851513 (0); Isla_Comic 1038924276479879508 (0); Printable Sudoku Puzzles 1038924276479869758 (1); Projects to try 1038924276479851509 (2); Quick saves 1038924276479849275 (0); Sudoku Books by Sapiver Press 1038924276479840944 (4).
- Dedicated one-off script scripts/remove-nine-pinterest-boards.mjs uses existing safely rotating Pinterest API OAuth, re-lists complete boards before deletion, requires all protected IDs and names, stops if any unknown board appears, scans each candidate board for Sapiver Prints posts/links and receipt IDs, checks for permission denial, issues only exact DELETE /boards/{id} for known targets, and finally verifies exact three named boards. Uses the existing global Pinterest token rotation GitHub concurrency lock.
- Isolated PR workflow first runs tests only; on merge to main one live run executes and saves success/partial deletion receipts to social/sapiver-forge/board-cleanup-results.json. Must disarm one-off workflow after run. No Netlify deploy, no Etsy/PrintShrimp mutation, no video change. Board deletion removes their Pins; Pinterest offers a 7-day restoration window.
- PENDING: GitHub tests, branch merge, live nine-board deletion HTTP 204 confirmations, exact three-board follow-up audit, cleanup disabling. Do not claim done before results.

## 2026-10-20 16:41 BST — Nine unwanted Pinterest boards DELETED (VERIFIED, ONE-SHOT DISARMED)
- User explicitly requested keeping **only** Sapiver Prints, Sapiver Press Publishing and Social boards, deleting all others including their Pins. Per Pinterest Help, deleting a board also deletes the Pins saved to it, with seven-day board restoration window.
- Pull request #50 merged as bfaec1ab22b16d5be1ae698c5ddec137701c56ce, after green final PR verification run 39450592422. One-time live GitHub run 39450681064 completed **SUCCESS**, with both verification and apply jobs successful.
- Pinterest API returned HTTP 204 on every exact DELETE /boards/{id}, followed by final GET /boards showing ONLY these three protected boards with their original IDs:
  - Sapiver Prints: 1038924276479981121;
  - Sapiver Press Publishing: 1038924276479876865;
  - Social: 1038924276479983705.
- Saved durable per-board deletion receipts at social/sapiver-forge/board-cleanup-results.json. All nine individually identified board IDs deleted with zero missingBefore; ten saved Pins across the nine deleted boards removed as a consequence; six of those boards were empty. Verified at 2026-10-20T15:41:29.787Z.
- Nine deleted: a.i news feed (2), AntiKing Sudoku (1), Clearforge (0), Facebook puzzles (0), Isla_Comic (0), Printable Sudoku Puzzles (1), Projects to try (2), Quick saves (0), Sudoku Books by Sapiver Press (4).
- The old 110 Forge/Clearforge Pin deletions are documented separately. The account's 647 previously counted protected Pins on the three surviving boards were not deletion targets; 32 existing Sapiver Prints product receipts and video pins were explicitly safeguarded by the script.
- **DISARMED:** one-time .github/workflows/one-time-pinterest-board-cleanup.yml deleted from main in commit aff9ae73dcd1b0fd23f896dc305dba46a49ce499. Script and verification tests remain in repo as historical audit proof but cannot run automatically. Sapiver Prints hourly image pinning, video publisher, daily socials, Etsy, PrintShrimp and Netlify unaffected.
- A separate earlier normal Sapiver Prints listing-pin scheduled run 39445633977 failed on public Etsy feed freshness (not board deletion), and is not evidence of a missing product Pin. Check upstream SapiverForge feed updates if failures persist.

## 2026-10-20 — Repair approved-release dispatch and Etsy fallback, protect deleted boards (STAGED)
- Owner requested repair of publication and social distribution, not permission to publish new unapproved editions. Existing source Forge release 2026-10-19 failed at cross-repo dispatch (HTTP 403, Actions permission); code also passed edition_date/source_sha/candidate_id not declared in receiving workflow. Public Etsy refresh cancelled after eight minutes; latest Comic scheduled image pin run failed safely with stale feed.
- Comic daily-brief-social-bridge.yml now accepts workflow_dispatch with pinned edition_date, full 64-character candidate_id and 40-character source_sha or repository_dispatch event sapiver_forge_approved_release (Contents-scoped fallback). It validates SEND and all three fields before checkout, checks out Forge at exact source commit, requires full released-site/Netlify/manifest/episode and immutable candidate hash, and fails closed for conflicting/partial identity. Manual SEND-only latest-released option remains.
- Comic sapiverprints-pinterest.yml now accepts repository_dispatch event sapiver_prints_new_listing. It still calls the existing public-feed validated 20-per-run deduped publisher, not a direct unverified Pin action. It may also run hourly; token concurrency unchanged.
- Daily Brief social workflow sets FORGE_PINTEREST_DISABLED=true because the owner deleted old Forge/Clearforge Pinterest boards and explicitly wishes to keep only Prints/Press Publishing/Social. It does not redirect news Pins to the protected product board; Facebook, YouTube and Instagram remain part of approved social pipeline. No PINDELETE or board recreation.
- Companion Forge PR adds safe Actions-dispatch 403 -> Contents-dispatch fallback, increases Etsy feed refresh reliability and enforces retired Forge Pinterest skip. CI must pass before releases; the first authentic future event and token permission are still unverified, and no live social media posting is authorised during testing.

## 2026-10-20 — Pinned immutable Etsy feed on new-listing dispatch (STAGED)
- Companion Forge fixed catalogue refresh successfully and published 35 active listings at 2026-10-20T16:41:59.234Z, three new IDs from prior 32. Live Comic repository_dispatch run 39459746620 FAILED SAFELY before posting because the raw Github /main cached feed still said stale (previous 32 listing generation). This is a CDN eventual-consistency race, not a Pinterest credentials failure.
- Accept optional 40-hex feed_sha on workflow_dispatch or sapiver_prints_new_listing repository_dispatch, built exclusively by Forge from git rev-parse HEAD following successful verified catalogue commit/push. Construct ONLY fixed repository immutable URL https://raw.githubusercontent.com/sapiverpress-studio/SapiverForge/<commit>/data/etsy-public-catalog.json and enforce all existing dated public feed/schema checks. Other scheduled/manual runs retain existing main URL. Invalid SHA aborts before any Pinterest mutation.
- Tests simulate simultaneously stale cached main and current pinned SHA, assert new listing posts once and malformed SHA rejected. Keep protected Sapiver Prints board and 32 old receipts unchanged. No automatic replay of failed GitHub run until both paired commits tested and merged. Never replace a Pins receipt without live Pin success.
