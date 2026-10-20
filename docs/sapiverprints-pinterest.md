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
