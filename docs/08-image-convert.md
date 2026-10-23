# Image Convert

`src/app/(tools)/convert/image/page.tsx`. Two modes, both entirely in the browser: images are never uploaded.

## PNG / JPG / WebP to SVG

Input: any image the browser can decode (PNG, JPG, WebP, GIF, BMP), chosen or dropped. The file is read as a data URL.

### Method 1: Trace to vectors

Real vector paths that scale cleanly, which suits logos, icons and flat illustrations. Photos produce large,
blotchy SVGs.

1. The image is drawn onto a canvas, scaled down so the longer side is at most **Max size** (default 800 px).
   Tracing time grows with pixel count, so this keeps it fast.
2. `ImageTracer.imagedataToSVG` from `imagetracerjs` traces the pixels. The UI sliders map to its options:

| Slider | Option | Effect |
| --- | --- | --- |
| Colors (2-64) | `numberofcolors` | Size of the colour palette. Fewer colours give simpler shapes. |
| Detail (1-10) | `ltres`, `qtres` = `1.1 - detail x 0.1`; `pathomit` = `12 - detail` | Higher detail allows smaller errors and keeps smaller specks |
| Smoothing (0-5) | `blurradius` | Blurs before tracing, which removes noise and JPEG artefacts |

Fixed options: `colorquantcycles: 3`, `roundcoords: 1` (one decimal place), `viewbox: true` (the SVG scales to
any size), `desc: false`.

Transparency is preserved: each colour layer carries its alpha as `opacity`. If the result has a solid background,
the source image had one (check its alpha channel).

The tracer runs on the main thread. The page waits 30 ms before starting so the "Converting..." state can paint.

### Method 2: Embed pixels

Wraps the original image, unchanged, inside an `<svg><image href="data:..."/></svg>`. Use it when something requires
an `.svg` file but the image must stay pixel-exact. It doesn't make the image scalable.

### Output

The preview shows the SVG through a data URL. You can copy the SVG code or download `<name>.svg`. The size shown
is the SVG's byte size.

## SVG to PNG

Input: an `.svg` file, or SVG code pasted into the text box.

1. The SVG is parsed with `DOMParser`. The intrinsic size comes from `width`/`height`, else the `viewBox`, else
   512 x 512. Missing `width`, `height` or `xmlns` attributes are added so every browser renders it at that size.
2. The SVG is loaded into an `Image` through a Blob URL, then drawn on a canvas at size x **Scale** (1x, 2x, 3x,
   4x or 8x).
3. **Background:** transparent (default), white or black, filled before drawing.
4. `canvas.toBlob("image/png")` produces the file. The preview shows its pixel size and byte size.

Limit: 64 million pixels per image (about 8000 x 8000). Larger canvases fail in some browsers, so the page refuses
them with a message.

External resources referenced inside the SVG (web fonts, linked images) may not render, because browsers block
external loads for SVGs drawn into a canvas. Inline them in the SVG for exact output.

## Shared helpers in the page

| Helper | Purpose |
| --- | --- |
| `FilePick` | Click-or-drop file input |
| `Slider` | Labelled range input with its value |
| `Preview` | Card with a checkerboard background (shows transparency) and action buttons |
| `downloadBlob` | Saves a Blob through a temporary object URL |
