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
