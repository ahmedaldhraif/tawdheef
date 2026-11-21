# GitHub identity hero

The original native agent types **tawdheef.com**, clears the slot, then types **توظيف.كوم**. Every shaped prefix stays beside the agent, including Arabic. Finished wordmarks have a 24 px visible gap. Text is always solid, with no shimmer option.

Frames are sampled by the same `paintTimeline` SVG/CSS renderer used in the native studio: Coding during typing/clearing, Speaking while holding, including the native moving body highlight. The website's 160 ms additive pose correction blends the two states. Coding continues through clearing, the empty interval and the next word, including the loop seam. No replacement motion is drawn by hand.

- 800 × 176 pixels, 24 fps, continuous loop.
- Light and dark GIFs, plus still PNGs.
- Original outlined wordmarks with joined Arabic lettering and square dots.
- README picture elements provide theme and reduced-motion still fallbacks.

## Rebuild

```sh
python scripts/branding/build-github-prefixes.py
python scripts/branding/export-github-hero.py --open --save
```

Open the displayed local export page, choose **Build native hero**, then **Save to repository**. With `--save`, the loopback exporter accepts only the four named GIF/PNG files, from its own page origin, with bounded sizes and valid file signatures. It cannot write arbitrary paths. Without that flag it is a read-only preview server. Text shimmer is deliberately unavailable. Every prefix is shaped with the canonical brand fonts and square dots; Arabic is never revealed by cropping a full word. The page uses the local native studio timeline renderer, native SVG states and its licensed GIF encoder. No Python image libraries, provider sessions or tracking records are needed.

See `sources.json`, the brand font licences under `../fonts/`, and the GIF encoder licence under `../studio/vendor/`.
