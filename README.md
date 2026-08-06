# Booklet Creator

A free, in-browser tool for designing a folded booklet and exporting a
duplex-ready, correctly imposed PDF. Everything — editing, rendering, and PDF
generation — runs client-side. No backend, no accounts, and no image or
project data ever leaves your browser.

## Local development

```bash
npm install
npm run dev
```

Opens the app at `http://localhost:5173` with hot module reload.

Other scripts:

```bash
npm run build   # production build (tsc -b && vite build) into dist/
npm run preview # serve the production build locally, to sanity-check it
npm test        # run the unit test suite (Vitest)
npm run lint    # ESLint + Prettier check
npm run spike:pdf  # regenerate the pdf-lib placement spike PDF (scripts/output/)
```

Deployment is static: `netlify.toml` builds with `npm run build` and
publishes `dist/`. There are no functions and no environment variables.

## Duplex flip-mode test-sheet workflow

Every duplex printer flips the sheet about a different axis when printing the
second side, and there's no reliable way to detect this from the browser.
Getting it wrong produces a booklet that folds into the wrong page order —
correct pages, wrong sequence — which is only obvious after printing and
folding a full job.

Before committing a long print run:

1. Open the **Duplex Test Sheet** action (right panel → Export). This
   generates a single two-sided PDF: one sheet, front and back, with each
   slot labelled with its intended page number and side (front/back).
2. Print it double-sided using your printer's normal duplex setting.
3. Fold the sheet once down the center.
4. Read the folded booklet from the front cover. If it reads **1, 2, 3, 4**
   in order, your printer matches the app's default duplex flip mode
   (vertical-axis / short-edge) — you're done.
5. If the pages come out **1, 2, 4, 3** or otherwise out of order, switch
   **Duplex flip** to the other setting (right panel → Project Settings →
   Duplex flip), print the test sheet again, and re-check.

Once the test sheet folds correctly, that flip mode is correct for your
printer for any booklet size — you don't need to repeat this for every
project, only when printing on a different printer.

## Known limitations

- **No creep (shingling) compensation.** Real saddle-stitched booklets over
  roughly 40 pages (10+ sheets) need inner pages nudged slightly toward the
  spine to stay aligned after folding and trimming. This app doesn't do that
  adjustment; a warning appears in the right panel once a project exceeds
  that page count. Content close to the inner margin on thick booklets may
  sit slightly closer to the fold than designed.
- **Images only.** No text tool, shapes, or drawing — this is a page-layout
  tool for photos and printed art, not a general design tool.
- **No vector import.** SVG and PDF source files aren't supported as
  importable images; only raster PNG/JPEG/WebP.
- **RGB output only.** No CMYK color conversion or ICC color management —
  colors are whatever your printer driver does with the RGB values in the
  PDF.
- **2-up saddle-stitch only.** No perfect binding, no other imposition
  layouts, no signature splitting for very thick books.
- **Bleed and crop marks need actual bleed room.** Crop marks are drawn just
  outside the trim edge; with bleed set to 0, they'd fall outside the sheet
  and won't be visible. Set a non-zero bleed if you want crop marks in the
  export.
- **IndexedDB storage isn't guaranteed.** Available quota varies by browser
  and can be cleared by the user or the OS. Imported images are downscaled on
  import and deduplicated by content hash to keep usage low, and a persistent
  warning appears if storage becomes unavailable or full — but for anything
  you don't want to risk losing, use **Save Project** to write a `.booklet`
  file to disk.
