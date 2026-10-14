# Product illustrations (AI Agents gallery)

Drop the eight approved blue-and-gold illustrations here, then set each product's
`"image"` in `../catalog.json`, for example `"image": "./marketplace/art/ag-research.webp"`.
A product with an empty `"image"` keeps its painted placeholder preview.

| Product | File |
|---|---|
| Deep Research Agent | `ag-research.webp` |
| Inbox Pilot | `ag-inbox.webp` |
| Meeting Scribe | `ag-scribe.webp` |
| Launch Planner | `ag-launch.webp` |
| Support Concierge | `ag-support.webp` |
| Study Companion | `ag-study.webp` |
| Market Scout | `ag-scout.webp` |
| Itinerary Muse | `ag-travel.webp` |

**Format:** 1200 × 800 px (3:2), WebP or JPEG, about 250 KB or less each, no text in the image.
Keep the subject inside the middle ~85% width and ~85% height: cards crop to 4:3 and the
crystal panel crops to 18:11, both centred.

**Performance:** images are drawn into the existing 1536 × 1024 card texture, so GPU memory
and draw calls do not change. Each image is downscaled to at most 800 px wide on load.
