# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Release automation reads this file: when a branch is merged into `main`, CI
creates a GitHub release for the topmost `## [x.y.z]` section if that tag does
not exist yet. Add new entries under `[Unreleased]` while developing and move
them into a version section when cutting a release.

## [Unreleased]

### Fixed

- UI freeze on every decoded message once contacts accumulated (noticeable
  from ~100-200 contacts on busy bands). Four cumulative fixes: streamed
  partials batch into one state update per 250 ms; message parsing is cached
  and table rows are memoized (was O(history) per new message); the decoded
  messages table and contacts list are windowed via a new dependency-free
  `VirtualList` (constant DOM size regardless of history — was 38k+ nodes);
  contacts merge continuously into an authoritative ref but publish to the
  heavy consumers (panel sort/stats, map markers, auto-reply) at most every
  800 ms. Validated to 1200 contacts at 100 msgs/window synthetic load.

### Changed

- `MAX_CONTACTS` raised from 500 to 1200 (virtualized lists keep render cost
  independent of contact count; LRU eviction unchanged).
- Dev-only `window.__ftInjectWindow` hook (tree-shaken from production) lets
  performance tests inject synthetic decode windows through the real
  streaming pipeline.

### Known issues

- The FT8 decode CPU budget is a soft limit: ft8mon only checks its deadline
  between candidates, so fixed per-pass costs (FFTs, coarse search,
  subtraction) can overrun the configured budget by roughly a second per
  pass, more on slow machines. Inherent to the strongest-first multi-pass
  design; documented in the README.

## [0.2.0] - 2026-07-02

### Added

- FT8 decoding engine switched to **ft8mon** (Robert Morris AB1HL, MIT) compiled
  to WebAssembly: full WSJT-X-style pipeline with LDPC belief propagation, OSD
  fallback, a-priori decoding, and multi-pass interference subtraction.
  Benchmark on ft8_lib's reference WAVs vs WSJT-X expected decodes: **310/353
  matched vs 257/353** for the previous engine. FT4 remains on ft8_lib, which
  also serves as automatic FT8 fallback.
- **Live message streaming**: decoded messages appear in the UI one by one as
  the decoder finds them during the window's decode pass; the contacts and
  auto-reply pipeline consumes them incrementally as well.
- **WASM status strip** in the FT8/4 panel: active engine, live decode progress
  bar (elapsed vs CPU budget; turns green when the window reaches the rolling
  average message count, amber when past budget), live decoded-message counter,
  and per-window decode time in the message list separators.
- **Runtime decoder tuning** (Tune button, applied live, persisted in
  localStorage): OSD depth, CPU budget (with data-driven suggested value marked
  on the slider — max observed last-message arrival over recent windows),
  subtraction passes, LDPC iterations, OSD threshold, decode band limits.
- **⟳ WASM reload**: respawns the decode worker and reloads both WASM modules
  without a page refresh.
- WASM telemetry in the bottom debug bar: engine(s), live heap usage
  (malloc'd bytes / reserved linear memory via `mallinfo`), last decode time,
  worker generation counter.
- Reproducible WASM build system: Docker/Emscripten Makefile that
  cross-compiles FFTW 3.3.10 (cached), plus `make test-modules` +
  `lib/wasm_build/testbuild/test_decode.mjs` regression benchmark comparing
  both engines against ft8_lib's reference WAV corpus.

### Changed

- ft8_lib wrapper candidate cap raised from 140 to 300 (matches the old
  TypeScript decoder's default).
- Vendored patched ft8mon at `lib/ft8mon` (Emscripten compatibility patches
  under `#ifdef __EMSCRIPTEN__`; see README).

### Removed

- `@e04/ft8ts` TypeScript FT8/FT4 decode path (superseded by the WASM engines
  in the previous iteration; ft8mon now replaces its decode quality as well).

## [0.1.0] - 2026-06-28

Baseline before the ft8mon engine work: browser-based decoding of RTTY, CW
(incl. dual-channel A/B), 15 SSTV modes, FT8/FT4 (ft8_lib WASM) with QSO
contact tracking / world map / ADIF export / auto-CQ + auto-reply transmit,
MFSK4–128 with FEC, WebGL spectrograms, radio CAT control (Kenwood TS-480
protocol, uSDX), PWA offline support.

[Unreleased]: https://github.com/acesso/Signal-Decoder/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/acesso/Signal-Decoder/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/acesso/Signal-Decoder/releases/tag/v0.1.0
