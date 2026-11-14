# GitHub identity hero

The original native agent types **tawdheef.com**, clears the slot, then types **توظيف.كوم**. Both finished wordmarks sit 24 px beside the agent. There is no added text sheen in the default export.

Frames are sampled by the same `paintTimeline` SVG/CSS renderer used in the native studio: Coding during typing/clearing, Speaking while holding, including the native moving body highlight. No replacement motion is drawn by hand.

- 800 × 176 pixels, 24 fps, continuous loop.
- Light and dark GIFs, plus still PNGs.
- Original outlined wordmarks with joined Arabic lettering and square dots.
- README picture elements provide theme and reduced-motion still fallbacks.

## Rebuild

```sh
python scripts/branding/export-github-hero.py --open
```

Open the displayed local export page, choose **Build native hero**, then download its four results into this folder. Keep **Hero text shimmer** off for the default version. The page uses the local native studio timeline renderer, native SVG states and its licensed GIF encoder. No Python image libraries, provider sessions or tracking records are needed.

See `sources.json`, the brand font licences under `../fonts/`, and the GIF encoder licence under `../studio/vendor/`.
