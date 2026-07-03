<h1 align="center">
    📡 Signal Decoder
</h1>
<p align="center">
   <strong>Decode radio signals in your browser!</strong> Free, open-source web application for real-time decoding of RTTY (Radio Teletype / Baudot), CW (Morse code), SSTV (Slow Scan Television), FT8/FT4 digital signals, and MFSK modes from microphone input. Works offline as a PWA. Forked from <a href="https://github.com/smolgroot/sstv-decoder">smolgroot/sstv-decoder</a>.
</p>
<p align="center">
   <em>This is a fully vibe coded project — every line was written by an AI coding agent driven by human prompts.</em>
</p>
<br />

<p align="center">
    <a href="https://github.com/acesso/Signal-Decoder/stargazers">
        <img src="https://img.shields.io/github/stars/acesso/Signal-Decoder?style=social" alt="GitHub stars" />
    </a>
    <a href="https://github.com/acesso/Signal-Decoder/issues">
        <img src="https://img.shields.io/github/issues/acesso/Signal-Decoder" alt="GitHub Issues" />
    </a>
    <a href="https://github.com/acesso/Signal-Decoder/blob/main/LICENSE">
        <img src="https://img.shields.io/badge/license-0BSD-blue" alt="License: 0BSD" />
    </a>
    <img src="https://img.shields.io/badge/PWA-Offline%20Ready-success" alt="PWA Offline Ready" />
    <a href="https://acesso.github.io/Signal-Decoder">
        <img src="https://img.shields.io/badge/demo-live-brightgreen" alt="Live Demo" />
    </a>
</p>

<hr>

<p align="center">
   <a href="https://acesso.github.io/Signal-Decoder"><b>🚀 Try the Live Demo - No Installation Required!</b></a>
</p>

<p align="center">
   <em>Works on Desktop • Mobile • Tablet | Chrome • Firefox • Safari • Edge</em>
</p>

## Quick Start

1. **Visit** → [acesso.github.io/Signal-Decoder](https://acesso.github.io/Signal-Decoder)
2. **Allow** microphone access when prompted
3. **Play** an RTTY, CW, SSTV, FT8/FT4, or MFSK signal near your microphone
4. **Watch** the text, image, or contacts decode in real-time!

No installation, no downloads, no setup - just open and decode!

## Features

- **RTTY Decoding**: Real-time Baudot/ITA2 radioteletype decoding from audio input
- **CW Decoding**: Morse code decoder with automatic speed detection and dual-channel A/B mode
- **SSTV Decoding**: 15 modes — Robot36/72, Scottie S1/S2/DX, Martin M1/M2, PD50/90/120/160/180/240/290, Wraase SC2-180
- **FT8/FT4 Decoding**: UTC-synchronized window decoding with QSO contact tracking, world map, and ADIF export
- **MFSK Decoding**: All fldigi MFSK modes (MFSK4 through MFSK128) with K=7 R=1/2 FEC and IZ8BLY varicode
- **Mode Auto-Detection**: Automatically identifies the incoming signal type
- **Session Gallery**: Review and save decoded sessions
- **Real-time Audio Processing**: Captures microphone input using Web Audio API (auto-detects 44.1 kHz or 48 kHz)
- **Professional DSP Chain**:
  - FM demodulation with complex baseband conversion
  - Kaiser-windowed FIR lowpass filtering
  - Schmitt trigger sync detection
  - Bidirectional exponential moving average filtering
- **Live Display**: Progressive rendering with real-time spectrum visualization
- **Save Output**: Export decoded images as PNG or text sessions
- **Signal Analysis**: Real-time spectrum analyzer and signal strength indicator
- **Mobile-Responsive**: Optimized for both desktop and mobile devices

## Supported SSTV Modes

All 15 modes are fully implemented with VIS code auto-detection.

| Mode | Resolution | Sync | Line Time | Total Time | VIS |
|------|------------|------|-----------|------------|-----|
| **Robot36** | 320×240 | 9ms | ~150ms | ~36s | 8 |
| **Robot72** | 320×240 | 9ms | ~300ms | ~1m 12s | 12 |
| **Scottie S2** | 320×256 | 9ms | ~278ms | ~1m 11s | 56 |
| **Martin M2** | 320×256 | 5ms | ~226ms | ~58s | 40 |
| **PD50** | 320×256 | 20ms | ~406ms | ~1m 44s | 93 |
| **Scottie S1** | 320×256 | 9ms | ~428ms | ~1m 50s | 60 |
| **Martin M1** | 320×256 | 5ms | ~446ms | ~1m 54s | 44 |
| **PD120** | 640×496 | 20ms | ~508ms | ~2m 6s | 95 |
| **PD160** | 512×400 | 20ms | ~804ms | ~2m 41s | 98 |
| **PD180** | 640×496 | 20ms | ~752ms | ~3m 6s | 96 |
| **PD90** | 320×256 | 20ms | ~754ms | ~3m 13s | 99 |
| **Wraase SC2-180** | 320×256 | 5ms | ~734ms | ~3m 8s | 55 |
| **Scottie DX** | 320×256 | 9ms | ~1069ms | ~4m 34s | 76 |
| **PD240** | 640×496 | 20ms | ~1018ms | ~4m 13s | 97 |
| **PD290** | 800×616 | 20ms | ~954ms | ~4m 54s | 94 |

### Color Encoding Overview

| Family | Color Format | Notes |
|--------|-------------|-------|
| Robot36/72 | Interlaced YUV | Standard for QSOs and ISS-style events |
| Scottie S1/S2/DX, Martin M1/M2 | Sequential RGB/GBR | Clean colors, HF classic |
| Wraase SC2-180 | Sequential RGB | High fidelity RGB |
| PD50/90/120/160/180/240/290 | Dual-luma YUV | High resolution, ISS SSTV standard |

## RTTY Decoder

Real-time RTTY (Radio Teletype) decoding using Baudot/ITA2 encoding (5-bit characters).

### RTTY Parameters

| Parameter | Default | Range |
|-----------|---------|-------|
| **Center Frequency** | 500 Hz | configurable |
| **Carrier Shift** | 450 Hz | 170 / 450 / 850 Hz typical |
| **Baud Rate** | 50 baud | 45 / 50 / 75 / 100 / 110 |
| **Stop Bits** | 1.5 | 1 / 1.5 / 2 |
| **Parity** | None | none / even / odd |
| **Reverse Shift** | Off | for LSB/inverted signals |

### RTTY Signal Processing

- **Mark/Space detection**: Dual Goertzel correlators with IIR lowpass smoothing
- **Baud clock**: Edge-triggered (re-syncs on every mark→space or space→mark transition)
- **Character framing**: Start bit → 5 data bits → optional parity → stop bit(s)
- **Shift state**: Full LTRS/FIGS handling per ITA2 standard
- **Sessions**: Each decoded transmission is stored as a named session

## CW Decoder

Real-time CW (Morse code) decoder with a per-sample IIR pipeline, live Morse element visualisation, and dual-channel A/B decoding mode.

### CW Parameters

| Parameter | Default | Range | Notes |
| --------- | ------- | ----- | ----- |
| **Center Frequency** | 700 Hz | 100 – 1500 Hz | Quick-set input + spectrum drag |
| **Bandwidth** | 90 Hz | 30 – 500 Hz | Filter width; Q computed as `freq / bw` |
| **Speed** | 20 WPM | 3 – 70 WPM | Manual or adaptive (see below) |
| **Squelch** | Adjustable | 0 – 100 % | Compared directly to FFT tone-bin level |
| **A/B Mode** | Off | — | Two independent decoders on separate frequencies |

### CW Signal Processing Pipeline

```text
microphone → biquad bandpass (adjustable Q = center / bandwidth)
           → envelope detector  (fast attack ~3 ms, moderate release ~5 ms)
           → peak follower       (fast rise ~10 ms, slow fall ~300 ms)
           → 50 % / 25 % hysteresis vs peak → mark / space FSM
           → symbol buffer (max 6 elements — hard cap, overflow emits '?')
           → Morse table lookup → character / prosign output
```

- **Bandpass filter**: Standard biquad, Q computed per-render so `bandwidth_Hz` stays constant as the center frequency is dragged
- **Squelch**: Applied per audio buffer by comparing the FFT magnitude at the tone bin against the user's visual threshold — the squelch line on the spectrum canvas is the exact gate the decoder uses
- **Adaptive speed tracker**: Always runs in the background regardless of manual/adaptive mode; the estimated WPM is shown as a live suggestion even when manual mode is active
- **Manual WPM override**: When adaptive mode is off, the user sets a fixed WPM; toggling adaptive off pre-fills the input with the last detected speed
- **6-element cap**: No valid Morse character exceeds 6 elements (the longest prosigns, e.g. `<SK>` = `...-.-`, are exactly 6); any sequence longer than this is flushed immediately as `?` to prevent noise from stalling the decoder
- **SNR display**: Noise floor tracked via a separate slow-fall IIR; real-time dB readout colour-coded (green ≥ 15 dB, amber 6–15 dB, red < 6 dB)

### Morse Display (live visualiser)

A real-time Morse element display sits inside the Audio Analysis panel and reflects the decoder's internal symbol buffer directly:

- **Dots** (blue circles) and **dashes** (green pills) appear with a spring-bounce animation as each element is received
- **Receiving indicator**: An amber pulsing dot shows while a tone is actively being measured (before dot vs dash is determined)
- **Character flash**: When the decoder resolves a complete symbol, the decoded character blooms large in the centre, holds for ~1.4 s, then fades — colour and glow match the channel (blue for Ch A, orange for Ch B)
- **Recent strip**: The last 10 decoded characters are shown in a fading history row with their Morse pattern underneath
- Element display is driven by `stats.partialSymbol` (decoder source of truth) to avoid React render-batch ordering bugs

### A/B Mode (dual-channel)

Enable **A/B Mode** to run two independent CW decoders simultaneously on different frequencies — useful for monitoring both sides of a QSO or two nearby stations.

- Each channel (A = blue, B = orange) has its own center frequency, squelch gate, and Morse visualiser
- Decoded text from both channels is interleaved in the output panel with distinct colours
- Channel B can be enabled/disabled mid-session without restarting audio capture
- The spectrum shows labelled `A` and `B` markers; both can be dragged independently
- The spectrogram overlay highlights both filter bands simultaneously

### CW How to Use

1. Click **Start Decoding** and allow microphone access
2. Drag the **CF** (or **A**) marker on the spectrum to the CW tone peak, or type the frequency in the **Center** input
3. Adjust **Bandwidth** — narrow (50–80 Hz) for clean signals, wider (150–300 Hz) for drifting or noisy ones
4. Drag the **SQL** line just above the noise floor to gate noise from decoding
5. Set **speed**: leave adaptive off and type the known WPM, or enable **Adaptive WPM** to let the decoder track the sender automatically — the live detected WPM is always visible as a suggestion even in manual mode
6. For a two-station QSO, enable **A/B Mode** and drag the **B** marker to the second tone

## MFSK Decoder

Real-time decoding of MFSK (Multiple Frequency Shift Keying) modes using Goertzel-based tone detection, K=7 R=1/2 Viterbi FEC, and IZ8BLY varicode character decoding — matching fldigi's implementation exactly.

### Supported MFSK Presets

| Preset | Tones | Baud Rate | FEC | Center |
|--------|-------|-----------|-----|--------|
| **fldigi MFSK4** | 32 | 3.9 Bd | K=7 R=1/2, depth 5 | 1500 Hz |
| **fldigi MFSK8** | 32 | 7.8 Bd | K=7 R=1/2, depth 5 | 1500 Hz |
| **fldigi MFSK16** | 16 | 15.6 Bd | K=7 R=1/2, depth 10 | 1500 Hz |
| **fldigi MFSK32** | 16 | 31.25 Bd | K=7 R=1/2, depth 10 | 1500 Hz |
| **fldigi MFSK64** | 16 | 62.5 Bd | K=7 R=1/2, depth 10 | 1500 Hz |
| **fldigi MFSK128** | 16 | 125 Bd | K=7 R=1/2, depth 20 | 1500 Hz |
| **Classic MFSK-4/8/16/32** | 4–32 | varies | None (IZ8BLY only) | 1500 Hz |

### MFSK Parameters

| Parameter | Default | Notes |
|-----------|---------|-------|
| **Center Frequency** | 1500 Hz | Move all tones as a group |
| **Baud Rate** | preset | Goertzel block size = sampleRate / baudRate |
| **Squelch** | 0% | Gate against noise floor |
| **FEC** | K=7 R=1/2 | Convolutional code + de-interleaving |

### MFSK Signal Processing

- **Goertzel detection**: Per-tone power computed over each symbol block (block size = sampleRate / baudRate)
- **Gray code**: Tone index decoded with Gray coding (matching fldigi's `mfsk.cxx`)
- **Soft decisions**: Raw Goertzel power scaled to 8-bit soft bits for Viterbi input
- **De-interleaver**: Reverse cascade interleaver, depth varies by mode
- **Viterbi decoder**: K=7, polynomials 0x6d / 0x4f, traceback 84 steps
- **Varicode**: IZ8BLY varicode bit stream → ASCII characters

### MFSK How to Use

1. Select **MFSK** from the top tab bar
2. Click **— load preset —** and select the matching mode (e.g. *fldigi MFSK16 — 16 tones / 15.6 Bd*)
3. Use the **Center** input to shift all tones to the signal's center frequency
4. Click **Start** and allow microphone access
5. Adjust **Squelch** to suppress noise between transmissions
6. Decoded text appears in the output panel in real-time
7. Switch presets at any time — the decoder resets automatically

## FT8 / FT4 Decoder

Real-time decoding of the WSJT-X FT digital modes, with automatic QSO tracking. Decoding runs entirely in the browser via two WebAssembly engines: FT8 uses [ft8mon](https://github.com/rtmrtmrtmrtm/ft8mon) (MIT — full WSJT-X-style LDPC + OSD + multi-pass interference subtraction), FT4 uses [ft8_lib](https://github.com/kgoba/ft8_lib) (see the *FT8/FT4 WASM Decoders* section below for the architecture, benchmark, and rebuild instructions).

Decoded messages **stream into the UI live** as the decoder finds them — a window's results appear one by one during the decode pass instead of all at once when it finishes, and the contacts/auto-reply pipeline consumes them just as incrementally. The FT panel includes a WASM status strip with a live decode progress bar (elapsed vs CPU budget; turns green when the window reaches the rolling average message count), runtime decoder tuning (**Tune**: OSD depth, CPU budget with a data-driven suggested value, subtraction passes, LDPC iterations, band limits — applied live, persisted locally), and a **⟳ WASM** button that reloads the decode engines without a page refresh.

### FT Modes

| Mode | Window | Sensitivity | Status |
|------|--------|-------------|--------|
| **FT8** | 15 s | −24 dB SNR | Fully supported |
| **FT4** | 7.5 s | −17 dB SNR | Fully supported |
| **FT2** | 3.75 s | −12 dB SNR | Experimental — waterfall only, no JS decoder available yet |

The decoder synchronizes to UTC wall-clock windows (your system clock must be NTP-synced within ±1 s), records one full window, then decodes it — exactly like WSJT-X. A clock ring shows the current window progress and REC/DEC state.

### Decoded Messages

Every decode is listed with UTC time, audio frequency (Hz), SNR (dB), and time offset (DT). Messages are classified by type, each with a fixed color used consistently across the UI:

| Tag | Meaning |
|-----|---------|
| `CQ` | General call (optionally with directed prefix and grid) |
| `ANS` | Answer with Maidenhead grid |
| `RPT` | Signal report |
| `R+RPT` | Roger + signal report |
| `RRR` / `RR73` | Roger acknowledgments |
| `73` | Sign-off |

`RR73` is never interpreted as a grid locator (it is lexically a valid Maidenhead square, but is reserved as a sign-off — same convention as WSJT-X).

### Contacts Panel

Callsigns are extracted from decoded messages and tracked as contacts with full QSO history:

- **Validation**: Only decodes with ≥3 readable words are parsed; `<...>` hashed-callsign placeholders and the literal `CQ` are never treated as callsigns
- **World map**: Located contacts (from their Maidenhead grid) are plotted on a Leaflet dark map, starting fully zoomed out
- **Location labels**: Grids are reverse-geocoded asynchronously (OSM Nominatim, throttled and cached) into `🇧🇷 Joao Pessoa - HI72` style labels
- **Operator lookup**: Name/email looked up asynchronously via hamdb.org (QRZ's API requires a paid authenticated session); the callsign in the list links to its qrz.com profile
- **QSO history**: Per-contact message log with seconds-precision UTC timestamps, message-type badges, and TX/RX direction; runs of repeated messages collapse into one row with a `×N` counter (hover to see every occurrence)
- **Cross-linking**: Callsigns are clickable everywhere they appear (worked list, map popups) and jump to the expanded contact
- **Sorting**: By last activity, TX count, or callsign — click the active sort again to reverse
- **ADIF export**: Download the session log as a standard `.adi` file for import into any logger

## Technology Stack

- **Next.js 15**: React framework with App Router
- **TypeScript**: Type-safe development
- **Web Audio API**: Real-time audio capture and processing
  - ScriptProcessorNode (Chrome, Firefox, Edge)
  - requestAnimationFrame polling (Safari, iOS)
- **Canvas API**: Progressive image rendering
- **Tailwind CSS**: Utility-first styling

## uSDX BLACK_BRICK Firmware

The `firmware/usdxBLACKBRICK/` directory contains `usdxBLACKBRICK.ino` — a customized uSDX firmware for the Chinese black-brick clone (ATmega328P at 20 MHz) with TS-480 Kenwood CAT protocol and PU7FTW custom extensions. The web app's Radio CAT panel speaks directly to this firmware.

### Hardware

| Item | Detail |
|------|--------|
| MCU | ATmega328P at 20 MHz |
| Display | HD44780 2-line LCD (regular green backlit, NOT OLED) |
| Flash programmer | USBasp (USB ID `16c0:05dc`) |
| CAT serial | CH340 USB-serial chip (USB ID `1a86:55d3`) |

**USBasp ISP wiring to uSDX BLACK_BRICK programming header:**

```text
USBasp 10-pin IDC    uSDX ISP header (6-pin)
─────────────────    ───────────────────────
Pin 1  MOSI     →    MOSI
Pin 5  RST      →    RST
Pin 7  SCK      →    SCK
Pin 9  MISO     →    MISO
Pin 2  VCC      →    VCC  (3.3 V or 5 V — match radio supply)
Pin 6  GND      →    GND
```

The ISP header is typically a 6-pin 2×3 2.54 mm connector on the radio PCB. The USBasp can power the target from its VCC pin — leave the radio's own power switch off while flashing.

### Prerequisites

Install `arduino-cli` and `avrdude`:

```bash
# Arch / Manjaro
sudo pacman -S arduino-cli avrdude

# Debian / Ubuntu
sudo apt install avrdude
curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh
```

Add the Arduino AVR core (one time):

```bash
arduino-cli core update-index
arduino-cli core install arduino:avr
```

**Linux — USBasp udev rule** (allows flashing without `sudo`):

```bash
sudo tee /etc/udev/rules.d/51-usbasp.rules <<'EOF'
SUBSYSTEM=="usb", ATTR{idVendor}=="16c0", ATTR{idProduct}=="05dc", MODE="0666", GROUP="dialout"
EOF
sudo udevadm control --reload-rules && sudo udevadm trigger
```

Add your user to the `dialout` group (needed for both USBasp and the CH340 serial port):

```bash
sudo usermod -aG dialout $USER   # log out and back in for the group to apply
```

### Compile

All commands are run from the **repository root** (`Signal-Decoder/`).

```bash
arduino-cli compile \
  --fqbn arduino:avr:uno \
  --output-dir firmware/build \
  firmware/usdxBLACKBRICK
```

> The FQBN targets Arduino Uno (16 MHz). The firmware corrects the baud rate for the actual 20 MHz crystal via `Serial.begin(16000000ULL * BAUD / F_MCU)`.

Expected output:

```text
Sketch uses 30048 bytes (93%) of program storage space. Maximum is 32256 bytes.
Global variables use 1472 bytes (71%) of dynamic memory, leaving 576 bytes for local variables.
```

Build artifacts are written to `firmware/build/`:

- `usdxBLACKBRICK.ino.hex` — flash image
- `usdxBLACKBRICK.ino.eep` — EEPROM image (empty by default; settings are written at runtime)

### Flash

Connect the USBasp to the uSDX ISP header. The radio's own power switch should be **off** — the USBasp supplies VCC.

```bash
avrdude -c usbasp -p m328p -B 4 -v \
  -U flash:w:firmware/build/usdxBLACKBRICK.ino.hex:i
```

The `-B 4` flag sets a 4 µs ISP bit-clock period (≈187 kHz SCK). This is necessary because the USBasp's default clock can be too fast for the target to follow reliably.

Expected final lines from avrdude:

```text
30048 bytes of flash verified
Avrdude done.  Thank you.
```

**Troubleshooting:**

- **`target does not answer`** — USBasp not making contact. Reseat the ISP connector and check pin 1 orientation.
- **`cannot open USB device`** — missing udev rule or user not in `dialout` group. Add the rule above and re-login.
- **`Error: cannot set sck period`** — old USBasp bootloader. This is a harmless warning; the flash proceeds normally.
- **Sketch won't start after flash** — EEPROM holds stale settings from a previous firmware. Power-cycle the radio; hold the encoder button at boot to reset to defaults.

### Verify the flash without a programmer

After flashing, disconnect the USBasp and power the radio normally. Open a terminal and send the batch poll command:

```bash
# Replace /dev/ttyACM1 with your actual port (ttyACM0, ttyUSB0, etc.)
stty -F /dev/ttyACM1 38400 raw -echo
printf 'FA;MD;AG0;FW;VO;AT;A2;NR;BL;' > /dev/ttyACM1 && cat /dev/ttyACM1 &
sleep 0.5 && kill %1
```

A working radio replies with all 9 frames in one line, e.g.:

```text
FA00007074000;MD1;AG01;FW0;VO12;AT0;A22;NR2;BL1;
```

If the port is busy or silent, make sure no other CAT application (hamlib, rigctld, WSJT-X) has the port open.

### CAT connection parameters

| Parameter | Value |
|-----------|-------|
| Baud rate | 38400 (default; configurable in menu → *CAT baud*: 9600 / 19200 / 38400 / 57600) |
| Data bits | 8 |
| Stop bits | 1 |
| Parity | None |
| Flow control | None |
| Port (Linux) | `/dev/ttyACM0` or `/dev/ttyACM1` (CH340 USB-serial) |
| Port (Windows) | `COMx` — check Device Manager under *Ports (COM & LPT)* |

### Custom CAT commands (PU7FTW extensions)

All commands terminate with `;`. All SET commands echo the new value as a GET reply. Commands are safe to batch in a single write — the firmware processes them in order and concatenates replies, e.g. `FA;MD;AG0;FW;VO;AT;A2;NR;BL;` returns all 9 replies in one read window.

| Command | Query | Set | Range | Notes |
|---------|-------|-----|-------|-------|
| **VO** — volume | `VO;` → `VOn;` | `VOn;` | −1…16 | −1 = mute |
| **AT** — ATT1 | `AT;` → `ATn;` | `ATn;` | 0…7 | dB steps: 0/−13/−20/−33/−40/−53/−60/−73 dB |
| **A2** — ATT2 | `A2;` → `A2n;` | `A2n;` | 0…16 | linear index |
| **NR** — noise reduction | `NR;` → `NRn;` | `NRn;` | 0…8 | 0 = off |
| **BL** — backlight | `BL;` → `BL0;`/`BL1;` | `BL0;`/`BL1;` | 0…1 | |
| **AG0** — AGC | `AG0;` → `AG0n;` | `AG0n;` | 0…2 | 0=OFF 1=Fast 2=Slow |
| **FW** — filter BW | `FW;` → `FWn;` | `FWn;` | 0…7 | 0=Full 1=3k 2=2.4k 3=1.8k 4=500 5=200 6=100 7=50 Hz |
| **TQ** — PTT state | `TQ;` → `TQ0;`/`TQ1;` | `TQ0;`/`TQ1;` | 0…1 | firmware also broadcasts `TQ0;`/`TQ1;` unsolicited on PTT transitions |

Standard TS-480 commands also supported: `FA` (VFO A freq get/set), `MD` (mode), `IF` (37-byte info frame), `TX`/`RX` (PTT), `ID`, `PS`, `AI`, `VX`.

## Testing

The project includes unit tests for core decoding algorithms and CAT protocol logic.

### Running all tests

```bash
# Run all tests (no hardware needed)
npm test

# Watch mode during development
npm run test:watch

# With coverage report
npm run test:coverage
```

### CAT protocol tests (no hardware required)

`src/lib/cat/__tests__/protocol.test.ts` runs entirely in Node.js — no radio, no serial port. It covers:

- TS-480 command construction (`FA`, `MD`)
- Response parsing helpers (`parseFrequency`, `parseMode`, `parseIntField`, `parseBoolField`)
- All 8 custom BLACK_BRICK commands (`VO`, `AT`, `A2`, `NR`, `BL`, `AG0`, `FW`, `TQ`)
- Multi-command batch response splitting and 2-char prefix lookup map
- IF frame parsing against the exact frame layout emitted by the firmware
- Range validation for every writable parameter

```bash
npm test -- src/lib/cat/__tests__/protocol.test.ts
```

Expected result: **35 tests, 35 passed**.

### Testbed setup (live radio required)

The CAT unit tests above need no hardware. If you want to run manual smoke tests or extend the suite with hardware-in-the-loop tests:

**1. Flash the firmware** (see [Flash](#flash) above).

**2. Confirm the port appears:**

```bash
ls /dev/ttyACM*    # Linux
# Expected: /dev/ttyACM0 or /dev/ttyACM1
```

**3. Confirm your user can access it:**

```bash
stat /dev/ttyACM1       # check group — should be 'dialout'
groups                  # your user should include 'dialout'
```

If not, add yourself to `dialout` (see [Prerequisites](#prerequisites)) and re-login.

**4. Make sure no other software has the port open:**

```bash
lsof /dev/ttyACM1       # should return nothing
# If hamlib/rigctld is running:
pkill rigctld
```

**5. Send a smoke-test batch query:**

```bash
PORT=/dev/ttyACM1
BAUD=38400
stty -F $PORT $BAUD raw -echo cs8 -cstopb -parenb
printf 'FA;MD;AG0;FW;VO;AT;A2;NR;BL;' > $PORT
timeout 1 cat $PORT
```

Expected output (values will differ by radio state):

```
FA00007074000;MD1;AG01;FW0;VO12;AT0;A22;NR2;BL1;
```

**6. Run the Jest test suite** (no hardware needed, but safe to run with the radio connected):

```bash
npm test -- --no-coverage
```

The CAT protocol tests pass regardless of whether the radio is connected — they test parsing and command construction in pure JavaScript. The 2 pre-existing failures in `sstv/constants.test.ts` are unrelated to the firmware or CAT stack.

### Test framework

- **Jest** — test runner with TypeScript support via `ts-jest`
- **@testing-library/react** — React component testing utilities
- **jsdom** — DOM environment for browser API simulation

## Getting Started

### Requirements

- Node.js 18+ installed
- A modern web browser with microphone access

### Installation

1. Clone the repository:
```bash
git clone https://github.com/acesso/Signal-Decoder.git
cd Signal-Decoder
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

### Building for Production

```bash
npm run build
npm start
```

### FT8/FT4 WASM Decoders

Two native decoders are compiled to WebAssembly; the compiled output under `public/wasm/` is committed, so **no rebuild is needed for normal development or deployment**.

| Engine | Used for | Source | Pipeline |
| --- | --- | --- | --- |
| `ft8mon.{js,wasm}` | FT8 | [rtmrtmrtmrtm/ft8mon](https://github.com/rtmrtmrtmrtm/ft8mon) (Robert Morris, AB1HL — MIT license), vendored at `lib/ft8mon` | LDPC belief propagation + OSD fallback + multi-pass interference subtraction (WSJT-X-style), statically linked against FFTW 3.3.10 compiled to WASM |
| `ft8.{js,wasm}` | FT4, and FT8 fallback | [kgoba/ft8_lib](https://github.com/kgoba/ft8_lib), git submodule at `lib/ft8_lib` | lightweight single-pass BP-only decoder |

ft8mon decodes substantially more signals than ft8_lib (on ft8_lib's reference WAVs, matched against WSJT-X decodes: **310/353 vs 257/353**) at the cost of CPU time, bounded by a runtime-tunable budget. Decoder tuning (OSD depth, CPU budget, subtraction passes, LDPC iterations, band limits) lives behind the **Tune** button in the FT8/4 panel and applies live, without restart. The **⟳ WASM** button respawns the decode worker and reloads both modules without a page reload. ft8mon is FT8-only, which is why ft8_lib remains for FT4.

`lib/ft8mon` is vendored (not a submodule) because it carries small Emscripten compatibility patches, all under `#ifdef __EMSCRIPTEN__`: synchronous decode instead of `std::thread`, `set()` returns NaN instead of `exit(1)` on unknown params, no FFTW plan lock file, no libsndfile dependency.

**Known issue — CPU budget is a soft limit.** ft8mon checks its decode deadline only between candidates inside each subtraction pass; the fixed per-pass work (full-band FFTs, coarse Costas search, subtraction re-synthesis) is not deadline-checked. In practice a decode can overrun the configured budget by roughly a second per pass — more on CPU-constrained machines — and the decoder may finish its last in-progress message past the deadline. This is inherent to the strongest-first multi-pass design and is left as-is; the decode-time display in the FT panel shows the real cost, and the suggested-budget marker adapts to it.

The ft8_lib source is a git submodule. When cloning for the first time, initialize it with:

```bash
git clone --recurse-submodules https://github.com/acesso/Signal-Decoder.git
# or, if you already cloned without --recurse-submodules:
git submodule update --init
```

#### Rebuilding the WASM (only needed if lib/ft8_lib, lib/ft8mon, or the wrappers change)

Requires [Docker](https://docs.docker.com/get-docker/). Run from the **project root**:

```bash
docker run --rm \
  -v "$(pwd):/src" \
  -w /src/lib/wasm_build \
  -u "$(id -u):$(id -g)" \
  emscripten/emsdk \
  make
```

The first build downloads and cross-compiles FFTW (cached under `lib/wasm_build/fftw-build/`, gitignored). Output is written to `public/wasm/ft8.{js,wasm}` and `public/wasm/ft8mon.{js,wasm}`. Commit these files after rebuilding.

To clean and rebuild from scratch:

```bash
docker run --rm \
  -v "$(pwd):/src" \
  -w /src/lib/wasm_build \
  -u "$(id -u):$(id -g)" \
  emscripten/emsdk \
  make clean all
```

#### Decoder regression benchmark

`lib/wasm_build/testbuild/test_decode.mjs` decodes ft8_lib's reference WAVs (`lib/ft8_lib/test/wav/`) with both engines and reports match counts against the expected decodes. Build the node-target modules it needs with `make test-modules` (same Docker invocation as above), then run:

```bash
node lib/wasm_build/testbuild/test_decode.mjs [osd_depth]
```

#### UI performance testbed

`npm run test:perf` (headless Firefox via playwright-core; needs a playwright Firefox build in `~/.cache/ms-playwright` or `PLAYWRIGHT_FIREFOX_PATH`, plus a dev server started with `npm run dev:test` — port 3002; **port 3000 is reserved for the developer's own dev server and must never be used by test tooling**) injects synthetic decode windows through the real streaming pipeline and measures main-thread blocking via heartbeat gaps. Reference profiles, with the validated numbers as regression baselines:

| Profile | Flags | Validated result |
| --- | --- | --- |
| target | `--msgs 50 --cadence 12000 --windows 40` | 1200 contacts, worst freeze 141 ms |
| stress | `--msgs 100 --cadence 8000 --windows 45` | 1200 contacts, worst freeze 119 ms, DOM ~4.1k |
| medium | `--msgs 18 --cadence 2500 --windows 120` | 725 contacts, near-zero blocking |

Add `--cat` to also connect the simulated uSDX radio (`src/lib/cat/mockSerial.ts`) so the full serial CAT poll pipeline runs concurrently; per-sample output then includes poll-cadence stats (`maxPollGapMs` stretching = main-thread jam, the mechanism behind CAT-induced decode-delta drift).

#### Manual live-signal test rig (WebSDR → app, Linux/PipeWire)

For end-to-end testing with real FT8 signals and no radio attached, route a WebSDR tab's audio into the app's microphone via a virtual sink:

```bash
# 1. create a null sink; note the printed module id for cleanup
pactl load-module module-null-sink sink_name=ft8test

# 2. open a WebSDR (e.g. http://appr.org.br:8901/?tune=7074usb) in one tab
#    CAVEAT: ?tune= sets the frequency but NOT the mode — click USB manually.
#    Widen the passband (3k0 preset) to cover the full FT8 sub-band.

# 3. open the app in another tab and Start Decoding, then move the streams:
pactl list sink-inputs      # find the WebSDR tab's stream id
pactl move-sink-input <id> ft8test
pactl list source-outputs   # find the app tab's capture id
pactl move-source-output <id> ft8test.monitor

# 4. cleanup when done
pactl unload-module <module-id-from-step-1>
```

Caveats learned the hard way: match streams by their id/app name carefully so you don't re-route another browser's audio; under `xvfb-run` there is no vsync (uncapped rAF makes the waterfall race) and no GPU (llvmpipe software rendering starves the WASM decoder — decode times roughly double), so prefer a real display for decode-quality comparisons.

## How to Use

Select a mode from the top tab bar (RTTY / CW / SSTV / FT / MFSK), then click **Start** and allow microphone access when prompted.

### RTTY

1. **Configure**: Set center frequency, carrier shift, and baud rate to match the incoming signal (defaults work for most HF RTTY: 50 baud / 450 Hz shift / 500 Hz center)
2. **Start**: Click "Start" — the decoder locks on to the first valid start bit it finds
3. **Read text**: Decoded characters appear in the session panel in real-time
4. **Sessions**: Each received text block is saved as a named session; switch between them in the session list
5. **Reverse shift**: Toggle "Rev" if the mark/space tones appear inverted (common when receiving on LSB)

### CW

1. **Tune**: Adjust the tone frequency slider to match the CW note you want to decode (700 Hz is a common CW sidetone)
2. **Squelch**: Raise the squelch threshold until background noise stops producing output, then lower it until the signal decodes cleanly
3. **Start**: Click "Start" — decoded characters appear as the decoder tracks speed automatically
4. **Speed**: WPM is calculated adaptively; no manual entry needed

### SSTV

1. **Mode**: Leave mode on **Auto** to let VIS code detection select the mode automatically, or pick a specific mode from the selector
2. **Start**: Click "Start Decoding" to begin capturing from the microphone
3. **Receive**: Play or tune to an SSTV signal — the image builds progressively on the canvas
4. **Monitor**: Use the spectrum analyzer and SNR indicator to optimise audio levels
5. **Save**: Click "Save Image" to download the decoded image as a PNG
   - Filename: `sstv-{mode}-{timestamp}.png`
6. **Gallery**: Previously decoded images are kept in the gallery below the canvas
7. **Reset**: Click "Reset" to clear the canvas and start a new decode

### FT8 / FT4

1. **Sync your clock**: FT modes require the system clock to be NTP-synchronized within ±1 second
2. **Mode**: Select **FT8** (15 s windows) or **FT4** (7.5 s windows) in the sub-mode selector
3. **Tune**: Set your radio to a standard FT frequency in USB mode (e.g. 14.074 MHz for 20m FT8; FT4 14.080 MHz)
4. **Start**: The decoder waits for the next UTC window boundary, records the full window, then decodes automatically
5. **Contacts**: Decoded callsigns appear in the Contacts panel with QSO history, location, and the world map; click any callsign to jump to its details
6. **Export**: Download the session as an ADIF log with the `.adi` button

## Technical Details

### Signal Processing Chain

1. **Baseband Conversion**: Complex multiplication at center frequency (1900 Hz)
2. **Baseband Lowpass Filter**: Kaiser-windowed FIR filter (2ms length, 900 Hz cutoff)
3. **FM Demodulation**: Phase difference detection with scale factor (sampleRate / (bandwidth × π))
4. **Sync Detection**: Schmitt trigger detecting frequency drops to 1200 Hz
5. **Line Decoding**: Bidirectional exponential moving average filtering for horizontal resolution

### Audio Parameters

- **Sample Rate**: Auto-detected (44.1 kHz or 48 kHz, matches browser/hardware)
- **Center Frequency**: 1900 Hz (midpoint of 1000-2800 Hz range)
- **Bandwidth**: 800 Hz (white-black range: 2300-1500 Hz)
- **Sync Frequency**: 1200 Hz (normalized to -1.750)
- **Schmitt Trigger**: Low threshold = -1.563 (1275 Hz), High threshold = -1.375 (1350 Hz)

### Robot36 Color Mode Specifications

- **Resolution**: 320×240 pixels
- **Color Format**: Interlaced YUV (even lines: Y + R-Y, odd lines: Y + B-Y)
- **Line Duration**: ~150ms per scan line
- **Sync Pulse**: 9ms at 1200 Hz
- **Sync Porch**: 3ms at 1500 Hz
- **Luminance (Y)**: 88ms
- **Separator**: 4.5ms (frequency indicates even/odd line)
- **Porch**: 1.5ms
- **Chrominance (R-Y or B-Y)**: 44ms
- **Total Lines**: 240 (produces 240 pixel rows, 120 even + 120 odd pairs)
- **Encoding**: 1 row per scan line (interlaced chroma pairing)

### PD120 Mode Specifications

- **Resolution**: 640×496 pixels
- **Color Format**: Dual-luminance YUV (Y-even + V-avg + U-avg + Y-odd)
- **Scan Line Duration**: ~508ms per scan line
- **Sync Pulse**: 20ms at 1200 Hz
- **Sync Porch**: 2.08ms at 1500 Hz
- **Y-even Channel**: 121.6ms (luminance for even row)
- **V-avg Channel**: 121.6ms (R-Y chroma, shared)
- **U-avg Channel**: 121.6ms (B-Y chroma, shared)
- **Y-odd Channel**: 121.6ms (luminance for odd row)
- **Pixel Dwell Time**: 190µs per pixel
- **Total Scan Lines**: 248 (produces 496 pixel rows, 248 × 2)
- **Encoding**: 2 rows per scan line (shared chroma between rows)

### PD160 Mode Specifications

- **Resolution**: 512×400 pixels
- **Color Format**: Dual-luminance YUV (Y-even + V-avg + U-avg + Y-odd)
- **Scan Line Duration**: ~804ms per scan line
- **Sync Pulse**: 20ms at 1200 Hz
- **Sync Porch**: 2.08ms at 1500 Hz
- **Y-even Channel**: 195.584ms (luminance for even row)
- **V-avg Channel**: 195.584ms (R-Y chroma, shared)
- **U-avg Channel**: 195.584ms (B-Y chroma, shared)
- **Y-odd Channel**: 195.584ms (luminance for odd row)
- **Pixel Dwell Time**: 382µs per pixel (2× longer than PD120)
- **SNR Improvement**: ~3.0 dB better than PD120
- **Total Scan Lines**: 200 (produces 400 pixel rows, 200 × 2)
- **Encoding**: 2 rows per scan line (shared chroma between rows)

### PD180 Mode Specifications

- **Resolution**: 640×496 pixels
- **Color Format**: Dual-luminance YUV (Y-even + V-avg + U-avg + Y-odd)
- **Scan Line Duration**: ~752ms per scan line
- **Sync Pulse**: 20ms at 1200 Hz
- **Sync Porch**: 2.08ms at 1500 Hz
- **Y-even Channel**: 182.4ms (luminance for even row)
- **V-avg Channel**: 182.4ms (R-Y chroma, shared)
- **U-avg Channel**: 182.4ms (B-Y chroma, shared)
- **Y-odd Channel**: 182.4ms (luminance for odd row)
- **Pixel Dwell Time**: 286µs per pixel (50% longer than PD120)
- **SNR Improvement**: ~1.8 dB better than PD120
- **Total Scan Lines**: 248 (produces 496 pixel rows, 248 × 2)
- **Encoding**: 2 rows per scan line (shared chroma between rows)

### Sync Detection

- **9ms Pulses**: Robot36/Scottie scan line sync
- **20ms Pulses**: PD mode scan line sync
- **5ms Pulses**: Martin mode sync / VIS calibration headers
- **Frequency Tolerance**: ±0.125 normalized units (~50 Hz at 1900 Hz center)
- All timing automatically adapts to detected sample rate (44.1 kHz or 48 kHz)
- Mode-specific pulse width detection ensures correct decoder selection

### Image Export

- Format: PNG (lossless compression)
- Resolution: Matches selected SSTV mode
- Filename: Includes mode and timestamp for easy identification
- Method: Canvas.toBlob() API for efficient conversion

### Known Issues

- Occasional false sync detections from noise/interference
- Stack overflow on very long lines (>6 seconds) - indicates lost sync
- Best results with clean, strong signals from radio or audio playback
- Safari iOS may have slightly higher latency (~34ms) due to polling approach

## Contributing

I welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on:

- Setting up your development environment
- Creating feature branches
- Writing and running tests
- Code quality standards
- Submitting pull requests
- Adding new SSTV modes

## License

This project is licensed under the 0BSD license (Zero-Clause BSD).

## Acknowledgments

- **smolgroot**: Upstream [sstv-decoder](https://github.com/smolgroot/sstv-decoder) web application this project is forked from
- **Ahmet Inan (xdsopl)**: Original [Robot36 Android app](https://github.com/xdsopl/robot36) DSP algorithms that informed the SSTV implementation
- **Amateur Radio Community**: Protocol specifications and documentation for RTTY, CW, and SSTV
