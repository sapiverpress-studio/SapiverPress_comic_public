# Sapiver Press Daily Comic Engine V3

Weekday rotation:

- Monday: Mike
- Tuesday: Isla
- Wednesday: Phil
- Thursday: Gemma & Dan
- Friday: Andy & Kat

Required GitHub Actions secrets:

- OPENAI_API_KEY
- COMIC_GITHUB_TOKEN

Optional:

- OPENAI_MODEL

Outputs:

- daily/YYYY-MM-DD.json
- image-manifests/YYYY-MM-DD.json
- latest.json
- characters/<character>.json

This repo generates story text and compositor instructions only. Real puzzle screenshots are captured separately and composited into the final comic scenes.
