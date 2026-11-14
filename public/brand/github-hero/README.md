# GitHub identity hero

The native Tawdheef agent types **tawdheef.com**, shimmers, clears the same slot,
then types **توظيف.كوم**. This is decorative branding, not live application activity.

- 800 × 176 pixels, 20 frames per second, 7.45 seconds, continuous loop.
- Light and dark GIFs; still PNGs for reduced motion and manual reuse.
- Original outlined wordmarks, original native mascot body and single code eye.
- README `picture` elements select the appropriate theme and still fallback.

Build-only Python dependencies: Pillow, fontTools and aggdraw. They are not app dependencies.

```sh
python -m pip install --target outputs/github-hero-render-deps Pillow fonttools aggdraw
python scripts/branding/export-github-hero.py
```

Typography uses the existing outlined brand masters. See the font licences in
`../fonts/`, and `sources.json` for the render source. No provider session,
tracking records or generated stock imagery is used.
