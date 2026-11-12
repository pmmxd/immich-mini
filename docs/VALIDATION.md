# Validation Record

Date: 2026-11-12

## Frontend integrity

- Source files: 792
- Source SHA256:
  `255fa0fbb0b437e9ae9a4553b3c2d90c2e98823363f6a458f28725445701406f`
- Production build files: 6,893
- Build SHA256:
  `020cb593d7b917075c1075212095ef3460f2af0a7a9a3d8fb0432fbdb35db52c`
- Source and build snapshots are verified by `scripts/frontend-baseline.mjs`.

## Local media metadata and navigation

- Map marker responses are cached in IndexedDB for 24 hours. Base map tiles
  remain browser HTTP cache; this is not an offline tile package.
- Rating, tags, location and edited capture time are stored in the app SQLite
  database and returned by the Asset API. Original EXIF/XMP files stay read-only.
- Folder paths split both `/` and `\`, preserving the native Windows hierarchy.
- Thumbnails expose one-click star ratings on hover for images and videos.
- Apple-style paired MOV files are linked to their still image and hidden from
  normal video lists. Android embedded Motion Photo data is extracted into the
  app cache and served through the existing HTTP Range endpoint.

## Browser route sweep

The following reused frontend routes loaded without HTTP 4xx/5xx responses
or uncaught exceptions:

- `/photos`
- `/favorites`
- `/archive`
- `/trash`
- `/albums`
- `/tags`
- `/people`
- `/map`
- `/search`
- `/recently-added`
- `/folders`
- `/user-settings`

The original timeline, filtered image/video/orientation views, asset viewer,
album detail, people list, person detail and settings pages were rendered in
headless Chrome.

## Media library scan

- Visible media indexed: 2,999
- Videos indexed: 144
- Dot-prefixed or Windows-hidden directory records remaining: 0
- Missing thumbnails after reconciliation: 0
- Cache cleanup retained 5,388 referenced files and recycled orphan caches
- Cache footprint after cleanup: approximately 136 MB
- Test suite: 2 files, 12 tests

## Batch tools

- Frame preview rendered at 1,000 px and used the same EXIF footer as full export.
- Frame preview supports 75%-300% zoom and a full-screen view.
- Portrait frame exports use a right-side information panel; landscape exports
  use a compact bottom panel. Nikon, Sony and missing-EXIF samples were rendered.
- Two selected photos produced two browser downloads from `/assets/:id/original?edited=false`.
- Photo and video downloads matched their source SHA256 and byte length.
- LocalDock `openWith` displayed the system application picker from the LocalDock origin.
- Default-app open launched Windows Photos for an indexed image.
- Photoshop and copicseal opened indexed images without modifying the originals.
- copicseal 0.4.1 has no image-path CLI handler; the dedicated bridge now places
  selected images on the Windows file-drop clipboard before focusing its template
  page and sending paste.
- LosslessCut opened two selected videos as separate arguments and remained running.
- External-tool bridge work runs in a hidden iframe and creates no visible helper window.
- Folder actions select one file in Explorer or open distinct parent folders for
  multi-selection.
- LocalDock export copied two originals to a temporary folder with matching byte
  counts and SHA256. A repeat export created ` (1)` filenames without overwriting.
- The source hashes were unchanged after export, and the LocalDock job finished
  with status `succeeded`.
- Internal frame export now chooses its destination through LocalDock before the
  render request; direct tests produced landscape, portrait and Nikon variants
  without failures.
- Camera filter suggestions return indexed makes/models/lenses and apply through `/search/metadata`.
- Asset details expose `1/160`, `ƒ/5`, `86 mm` and `ISO 100` for a real Nikon sample.
- A synthetic XMP fixture imported rating 4, a localized description and two
  hierarchical tags; a rescan preserved manually changed rating and description.
- Real files also exposed XMP tags and ratings: `地点/北京`, `人物/爸爸`,
  `人物/妈妈`, `旅行`, 4/5 stars and localized captions.
- Existing media were not rescanned automatically; until a rescan, the current
  production database still shows zero imported tags.

## Face pipeline

- OpenCV Zoo public selfie sample: 2,048 x 1,150
- Detected faces: 92
- Embedding size: 128 floats
- Initial clusters: 68-69 depending on cluster threshold/run
- Person thumbnails and person timelines rendered in the unchanged UI
- Detection and clustering thresholds are configurable through `.env`.
- The people page displays both person count and distinct photos with faces.

## Memory

| Scenario | Working Set | Private Memory |
|---|---:|---:|
| Backend idle after scanning 1,000 images | 85.0 MB | 91.2 MB |
| Face scan peak, Node | 116.0 MB | - |
| Face scan peak, Python | 260.0 MB | - |
| Face scan combined peak | 376.0 MB | - |
| Node after face worker exits | 77.6 MB | - |
| Current Node idle after batch-tool deployment | 82.9 MB | 91.5 MB |
| Native folder picker while open | 106 MB | - |
| Native save-file picker while open | 128 MB | - |
| Face worker observed peak during full queue | 790 MB | - |

Album source-preview measurement on headless Edge:

| Scenario | Working Set delta | Private Memory delta |
|---|---:|---:|
| Album page with original video first frame | +54.9 MB | +33.5 MB |
| 2560 x 1920 source image preview | +81.6 MB | +119.7 MB |

The Node backend did not retain an additional buffer while streaming these
originals; observed working set moved from 122.8 MB to 96.7 MB due to normal GC.

Album teardown was also measured by navigating back to Photos and forcing a JS
GC: Edge went from 640.7 MB while the source cover was loaded to 642.5 MB after
the cover DOM elements were removed. The media elements/resources are detached
and offscreen covers unload their sources, but Chromium retains allocator/cache
reservations, so process working set is not guaranteed to fall immediately.

The Python face worker exited after the configured 15-second measurement idle
window. Default idle timeout is 45 seconds.

The current idle process set is one Node process only. Native PowerShell dialogs,
FFmpeg and the Python face worker are one-shot processes and exit after use.
Program artifacts in `dist/`, `vendor/`, `runtime/` and `models/` total
approximately 646.8 MB; this excludes `data/`, media originals and the browser.

## Safety

- Original media is read-only.
- Asset deletion only sets the new project's SQLite trash state.
- Existing Immich, PostgreSQL, Docker data and user media were not modified.
- The face worker enforces configured library roots and a random bearer token
  on its loopback HTTP endpoint.
