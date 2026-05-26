# Sapiver Press Daily Comic Engine V3

Automated weekday story engine for Sapiver Press comics.

## Weekday rotation

- Monday: Mike
- Tuesday: Isla
- Wednesday: Phil
- Thursday: Gemma & Dan
- Friday: Andy & Kat

## GitHub Actions secrets

Required:

- OPENAI_API_KEY
- COMIC_GITHUB_TOKEN

Optional:

- OPENAI_MODEL

## Outputs

- daily/YYYY-MM-DD.json
- image-manifests/YYYY-MM-DD.json
- latest.json
- characters/<character>.json

## Rules

- Story generation only creates text and render instructions.
- Real puzzle screens are captured separately.
- Puzzle screens are composited into the image.
- No fake puzzle grids.
- No giant titles, headers, footers, or branding overlays.
- Sapiver Press branding only appears on merchandise and monitor/browser URL.
