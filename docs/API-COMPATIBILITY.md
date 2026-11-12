# Immich API Compatibility

This inventory is derived from the current `@immich/sdk` fetch client and the
current web frontend call sites. Endpoint paths below are relative to `/api`.

## Phase 1 startup

| Method | Path | Response contract | Frontend evidence |
|---|---|---|---|
| GET | `/server/config` | `ServerConfigDto` | `server-config-manager.svelte.ts` |
| GET | `/server/features` | `ServerFeaturesDto` | `feature-flags-manager.svelte.ts` |
| GET | `/server/about` | `ServerAboutResponseDto` | `auth-manager.svelte.ts` |
| GET | `/users/me` | `UserAdminResponseDto` | `auth-manager.svelte.ts` |
| GET | `/users/me/preferences` | `UserPreferencesResponseDto` | `auth-manager.svelte.ts` |

The server provides a fixed local session by setting the
`immich_is_authenticated` cookie. The reused frontend has one local extension:
a media-library settings section. The login route remains unchanged.

## Phase 1 timeline

| Method | Path | Response contract | Frontend evidence |
|---|---|---|---|
| GET | `/timeline/buckets` | `TimeBucketsResponseDto[]` | `timeline-manager.svelte.ts` |
| GET | `/timeline/bucket` | `TimeBucketAssetResponseDto` | `load-support.svelte.ts` |
| GET | `/assets/:id` | `AssetResponseDto` | asset viewer route |
| GET | `/assets/:id/thumbnail` | image stream | thumbnail utilities |
| GET | `/assets/:id/original` | range-capable media stream | asset viewer utilities |
| GET | `/assets/:id/video/playback` | range-capable media stream | native video player default source |

Timeline buckets are grouped by local capture month. Bucket asset responses use
the parallel-array shape defined by the current SDK.

## Core media library

Implemented and exercised through the reused frontend:

- `GET /assets/statistics`
- `GET /search/explore`
- `GET /local/libraries` and `POST /local/libraries`
- `GET/PUT /local/libraries/settings` for monitoring and scheduled scans
- `POST /local/libraries/:id/scan` for a manual library scan
- `DELETE /local/libraries/:id` removes the library index without deleting originals
- Rescans reconcile missing files and skip dot-prefixed or Windows-hidden directories
- `GET/PUT /local/faces/settings` persists face thresholds and exposes queue counts
- `POST /local/faces/reprocess` rebuilds face clusters while preserving named people
- `GET /search/suggestions` returns indexed city, camera make, model and lens values
- `GET /assets/:id` reads detailed EXIF on demand for exposure, aperture, focal length and ISO
- library scans index XMP/IPTC tags, title/caption and rating alongside camera and
  GPS metadata; imported tags are additive and manual edits survive rescans
- `POST /local/assets/paths` returns local paths for LocalDock external-tool actions
- `POST /local/assets/frame` renders framed JPEGs into an already selected
  destination folder with camera and exposure metadata
- `GET /local/assets/:id/frame-preview` renders the live frame preview
- `GET/PUT /local/tools/settings` reads and saves image, video and frame-tool EXE paths
- `POST /local/tools/choose` opens the native EXE picker
- Original download uses the reused frontend and `GET /assets/:id/original`
- `POST /search/metadata`
- `PUT /assets` and `PUT /assets/:id`
- `DELETE /assets` (marks SQLite records as trashed; never deletes originals)
- `/timeline/buckets` and `/timeline/bucket` filters for album, tag, person,
  favorite, trash and visibility
- LocalDock batch export copies selected originals through the allow-listed
  `immich-export-media` command; existing files are never overwritten
- LocalDock also supplies the frame-export folder picker, Explorer locate action
  and copicseal clipboard handoff
- Albums: list, create, update, delete, add/remove assets, map markers
- Tags: list, create, upsert, update, delete, tag/untag assets
- People: list, get, update name/visibility/favorite/thumbnail, statistics
- GPS map markers
- Folder views: unique paths and asset listing
- Notifications, API key and session empty states required by the reused UI

## Face pipeline

- SQLite tables: `people`, `faces`, `face_jobs`
- ONNX models: OpenCV Zoo YuNet detector and SFace recognizer
- Python worker starts on demand, reads only configured library roots, writes
  crop files under `data/faces`, and exits after 45 idle seconds.
- Embeddings are normalized 128-dimensional vectors stored in SQLite.
- Cosine similarity threshold defaults to `0.45` and can be changed with
  `IMMICH_MINI_FACE_CLUSTER_THRESHOLD`.
- YuNet detection threshold defaults to `0.7` and can be changed with
  `IMMICH_MINI_FACE_DETECTION_THRESHOLD`.

## Deliberately disabled

- CLIP smart search
- OCR
- Existing Immich data migration
- Docker, PostgreSQL, Redis and WSL

Admin, sharing and multi-user behavior remains single-user compatibility only.

## Trash semantics

The reused `/trash` UI is backed by SQLite rows in `data/immich-mini.db`:

- `DELETE /assets` without `force` sets `assets.is_trashed = 1`.
- `POST /trash/restore` and `/trash/restore/assets` clear the flag.
- `POST /trash/empty` and `DELETE /assets` with `force` remove database rows and
  their album, tag and face relations only.
- These operations never delete the indexed original image or video file.

## Generated SDK evidence

- SDK version in the reference workspace: `3.3.1`
- Commit: `96b5f59553591fe9d48e1d5f5b881126e540ff31`
- SDK source: `packages/sdk/src/fetch-client.ts`
- Frontend source aggregate: `3d32ec805fdba83ae8baf22c4633bf0eff85f7e332a2a17cdf21d7dddf75c69a`
