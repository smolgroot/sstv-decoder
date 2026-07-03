# Signal-Decoder — standing instructions

## Dev servers — ports and discipline

The user keeps their own `next dev` running **all the time on port 3000**. **Port 3002 is Claude's** — use it for any test/verification instance.

- To stop a server, find the exact listener PID (`ss -tlnp | grep 3002`) and kill only that PID. Never `pkill -f "next dev"` (kills the user's server too) and never `lsof -ti :PORT | xargs kill` (lsof also lists client-connection PIDs — this has killed the user's browser).
- Never run `npm run build` while any dev server is running — build and dev share `.next/` and the dev server's cache gets corrupted (MODULE_NOT_FOUND webpack errors until restart). Use `npx tsc --noEmit` + the dev server's own HMR compile as the gate instead, or stop servers first.
- The app registers a PWA service worker; browsers can serve stale chunks after changes. If the UI looks partially updated, unregister the service worker + clear Cache Storage + hard reload before debugging.

## FT8/FT4 WASM decoders — rebuild after native changes

FT8 decodes via ft8mon (vendored, patched, at `lib/ft8mon`), FT4 via ft8_lib (submodule at `lib/ft8_lib`); wrappers live in `lib/wasm_build/`. **Any change to `lib/ft8mon/`, `lib/ft8_lib`, or `lib/wasm_build/*.c*` is not complete until the WASM is rebuilt and the artifacts under `public/wasm/` are committed** — the TS side loads those binaries, not the sources.

Rebuild (from project root; Docker required, FFTW build is cached after the first run):

```bash
docker run --rm -v "$(pwd):/src" -w /src/lib/wasm_build -u "$(id -u):$(id -g)" emscripten/emsdk make
```

Regression benchmark against ft8_lib's reference WAVs (expected ballpark: ft8mon ≈310/353 matched, ft8_lib ≈257/353):

```bash
docker run --rm -v "$(pwd):/src" -w /src/lib/wasm_build -u "$(id -u):$(id -g)" emscripten/emsdk make test-modules
node lib/wasm_build/testbuild/test_decode.mjs 2
```

Gotchas already learned the hard way (don't re-litigate): ft8mon needs `STACK_SIZE=8388608` (ldpc_decode overflows the 64KB default); no pthreads/SharedArrayBuffer (GitHub Pages can't serve COOP/COEP) — ft8mon's `entry()` runs `go()` synchronously under `#ifdef __EMSCRIPTEN__`; keep all ft8mon patches inside `#ifdef __EMSCRIPTEN__` guards. A running decode worker holds the old WASM — use the ⟳ WASM button or reload the page after rebuilding.

## Performance testing — testbed, golden profiles, and discipline

`npm run test:perf` (scripts/perf-testbed.ts) is the canonical heavy-load testbed: headless **Firefox** (playwright-core; never Chrome — user rule), synthetic decode windows through the dev-only `__ftInjectWindow` hook, main-thread blocking measured via heartbeat gaps (Firefox has no Long Tasks API). `--cat` additionally connects the mock uSDX (src/lib/cat/mockSerial.ts) and reports poll-cadence stretching. Requires a dev server running a **development** build (the hook is tree-shaken from production) — start it with `npm run dev:test` (port 3002). Port 3000 is the developer's own always-running server; no test or tool may ever bind or assume it.

Golden regression profiles and the numbers any UI/pipeline change must hold (see README "UI performance testbed" for the table): target 50/12s→1200 contacts ≤~150 ms worst freeze; stress 100/8s→1200 contacts, DOM stays ~4k; medium 18/2.5s→near-zero blocking.

Hard-won rules for running tests:

- **Never edit app source while a test runs against the dev server** — HMR reloads the page mid-run, resets its state, and silently invalidates the data. Land all changes, typecheck, restart the dev server, then measure.
- **Clean up between takes** or the machine starves: kill only OUR processes — match `ms-playwright` paths or the harness script name and filter to the actual `node`/browser PIDs. Never `pkill -f firefox` patterns that catch the user's `/usr/lib64/firefox`, never `lsof -ti :PORT | xargs kill` (kills client connections, has killed the user's browser).
- playwright `page.evaluate` under tsx: pass browser-side code as **strings** (esbuild injects a `__name` helper into serialized functions that doesn't exist in the page); a string pageFunction with an arg is evaluated as an expression and silently no-ops — bake payloads in with `JSON.stringify`.
- All test tooling is TypeScript. No Python in the codebase (user rule).
- Manual live-signal testing (WebSDR → virtual sink → app mic) is documented in the README appendix; prefer a real display over xvfb for decode-quality comparisons (no GPU/vsync skews the decoder's CPU budget).

## Node version — always match `.nvmrc`

This repo pins its Node version in `.nvmrc` (currently `v26.3.0`). Before running any `node`/`npm`/`npx` command in this repo, run `nvm use` (or `source ~/.nvm/nvm.sh && nvm use` if `nvm` isn't already loaded in the shell) so the command runs under the pinned version, not whatever Node happens to be active. Don't assume the ambient shell's Node matches — check with `node --version` if unsure. If the pinned version isn't installed via nvm, install it (`nvm install`) rather than falling back to a different version.

## Firmware changes MUST be compiled, flashed, and tested

This repo vendors the uSDX BLACK_BRICK radio firmware at:
`firmware/usdxBLACKBRICK/usdxBLACKBRICK.ino`

**Any edit to this file is not complete until it has been compiled, flashed to the physical radio, and validated.** Do not consider a firmware change "done" just because the source file was edited — treat compile+flash+test as part of the change itself, the same way a code edit isn't done until it typechecks.

### Before compiling/flashing, verify the setup

Do not attempt to flash blind. Before running avrdude, confirm:

1. **Programmer connected** — a USBasp-compatible programmer must be present:
   ```
   lsusb | grep -i "16c0:05dc"
   ```
   If not found, stop and ask the user to connect the USBasp programmer to the target ATmega328P before proceeding.

2. **CAT serial port present** (needed for post-flash CAT validation) — typically `/dev/ttyACM1` at 38400 baud. Check with:
   ```
   ls /dev/ttyACM* /dev/ttyUSB* 2>/dev/null
   ```

3. **ALWAYS ask the user for explicit confirmation before flashing — no exceptions.** Flashing overwrites the running firmware on physical hardware and is not easily reversible if something goes wrong mid-write. This applies every single time, even if: the compile step succeeded cleanly, a previous flash in the same session went fine, the change looks trivial, or the user has already approved flashing earlier in the conversation. Approval for one flash does not carry over to the next — ask again each time avrdude is about to run. Do not rationalize skipping this step under time pressure or because the fix seems obviously correct.

### Compile

```bash
cd firmware
arduino-cli compile --fqbn arduino:avr:uno --output-dir ./usdxBLACKBRICK/build ./usdxBLACKBRICK
```
(arduino-cli requires the sketch folder name to match the `.ino` file inside it and must be invoked from its parent directory — running it from inside `usdxBLACKBRICK/` itself fails with "no such file or directory".)

A clean compile is a prerequisite for flashing — do not flash if this errors or warns about overflow.

### Flash

```bash
cd firmware/usdxBLACKBRICK
avrdude -c usbasp -p m328p -B 4 -v \
  -U flash:w:./build/usdxBLACKBRICK.ino.hex:i \
  -U eeprom:w:./build/usdxBLACKBRICK.ino.eep:i
```

### Trigger relevant tests after flashing

- **CAT protocol unit tests** (pure logic, no hardware, run any time): `npm test -- src/lib/cat/__tests__/protocol.test.ts`. If the firmware change touches a CAT command's format, range, or semantics, update this test file to match — it must reflect actual firmware behavior, not the wire-format spec alone (e.g. a command can *accept* a value the running build never meaningfully distinguishes — check the firmware source, not just the inline comment on the command handler).
- **CAT hardware test bed against the physical radio** (run after every flash): `npm run test:cat-hardware -- [/dev/ttyACM1] [baud]`. This is a TypeScript script (`scripts/cat-hardware-test.ts`, run via `tsx`) that talks to the real serial port and validates the IF frame, the full batched multi-command poll, and a SET→GET→restore round-trip. Don't rely on the unit tests alone to sign off a firmware change — they validate the JS-side parsing, not that the flashed `.hex` actually behaves as documented. All test bed tooling in this repo is TypeScript — do not write ad hoc Python (or other language) scripts for hardware validation; extend `scripts/cat-hardware-test.ts` instead.
- **Full app test/build gate** if the change affects `src/hooks/useRadioCAT.ts` or `src/components/RadioCATPanel.tsx` too: `npm test`, `npx tsc --noEmit`, `npm run build`.
