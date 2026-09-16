# Gemini Watermark Remover

A browser-based interface for removing supported visible Gemini watermarks from images and videos.

## Features

- Image watermark removal
- Batch image processing
- Video watermark removal beta
- Browser-local processing workflow
- No account required
- Drag-and-drop uploads
- Image comparison preview
- ZIP download for batch image results
- MP4/WebM output when supported by the browser

## Run locally

Open `index.html` through a local static web server. For example:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## GitHub Pages

The project is static HTML/CSS/JavaScript and can be published with GitHub Pages. Keep `index.html` at the root of the publishing source.

## Privacy

The supported media-processing workflow is designed to run in the browser. No account is required. The browser may still make network requests to load the site, JavaScript libraries, models, fonts, or other required resources.

## Video limitations

Video processing is a beta browser workflow. Output codec/container availability depends on the browser and device. Modifying video pixels requires re-encoding, so the original video bytes cannot be preserved exactly.

## Scope

This project is intended for visible watermark cleanup on media that you own or are authorized to edit. It does not claim to remove invisible provenance signals such as SynthID.

## Disclaimer

Gemini Watermark Remover is an independent project and is not affiliated with, endorsed by, or sponsored by Google, Gemini, or Veo.

## License and third-party code

See `LICENSE` and `THIRD-PARTY-NOTICES.md` before redistributing or modifying the project.

### Feature comparison images

The comparison section uses two local image files placed in the repository root:

- `with-watermark.jpeg` — the before/example image
- `without-watermark.png` — the cleaned/after example image

Replace these two files with your own authorized example images. The HTML already references these exact filenames, so no code change is required.
