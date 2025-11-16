# SSTV Decoder Web Application

A web application for real-time SSTV (Slow Scan Television) decoding from microphone input. Based on the [Robot36 Android app](https://github.com/xdsopl/robot36) by xdsopl.

## Features

- **Real-time Audio Processing**: Captures microphone input using Web Audio API (auto-detects 44.1 kHz or 48 kHz)
- **SSTV Decoding**: Robot36 Color mode (320x240 resolution, interlaced YUV)
- **Professional DSP Chain**:
  - FM demodulation with complex baseband conversion
  - Kaiser-windowed FIR lowpass filtering
  - Schmitt trigger sync detection
  - Bidirectional exponential moving average filtering
- **Sync Detection**: Automatic detection of 9ms sync pulses at 1200 Hz
- **Live Image Display**: Progressive interlaced image rendering
- **Save Image**: Export decoded images as PNG files
- **Mobile-Responsive**: Optimized for both desktop and mobile devices

## Technology Stack

- **Next.js 15**: React framework with App Router
- **TypeScript**: Type-safe development
- **Web Audio API**: Real-time audio capture and processing
  - ScriptProcessorNode (Chrome, Firefox, Edge)
  - requestAnimationFrame polling (Safari, iOS)
- **Canvas API**: Progressive image rendering
- **Tailwind CSS**: Utility-first styling

## Getting Started

### Prerequisites

- Node.js 18+ installed
- A modern web browser with microphone access

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd sstv-decoder
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

## How to Use

1. **Start Decoding**: Click "Start Decoding" to begin capturing audio from your microphone
2. **Grant Microphone Permission**: Allow the browser to access your microphone when prompted
3. **Play SSTV Signal**: Play a Robot36 SSTV signal near your microphone (from another device, radio, etc.)
4. **Watch Live Decoding**: The decoded image will appear progressively on the canvas
5. **Reset**: Click "Reset" to clear the canvas and start a new decode
6. **Save Image**: Click "Save Image" to download the decoded image as a PNG file
   - Filename format: `sstv-decode-robot36-{TIMESTAMP}.png`
   - Example: `sstv-decode-robot36-20240315-143022.png`
7. **Stop**: Click "Stop" to end the decoding session

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
- **Color Format**: Interlaced YUV (even lines: Y + B-Y, odd lines: Y + R-Y)
- **Line Duration**: ~150ms per scan line
- **Sync Pulse**: 9ms at 1200 Hz
- **Sync Porch**: 3ms at 1500 Hz
- **Luminance (Y)**: 88ms
- **Separator**: 4.5ms
- **Porch**: 1.5ms
- **Chrominance (R-Y or B-Y)**: 44ms
- **Total Lines**: 240 (120 even + 120 odd, interlaced)

### Sync Detection

- **9ms Pulses**: Scan line sync (samples scale with sample rate)
- **5ms Pulses**: VIS code/calibration headers (ignored)
- **20ms Pulses**: Frame sync
- **Frequency Tolerance**: ±0.125 normalized units (~50 Hz at 1900 Hz center)
- All timing automatically adapts to detected sample rate (44.1 kHz or 48 kHz)

### Image Export

- Format: PNG (lossless compression)
- Resolution: Matches selected SSTV mode
- Filename: Includes mode and timestamp for easy identification
- Method: Canvas.toBlob() API for efficient conversion

## Project Structure

```
src/
├── app/
│   ├── layout.tsx              # Root layout with metadata
│   ├── page.tsx                # Home page
│   └── globals.css             # Global Tailwind styles
├── components/
│   └── SSTVDecoder.tsx         # Main decoder UI component
├── hooks/
│   └── useAudioProcessor.ts    # Web Audio API integration
└── lib/
    └── sstv/
        ├── constants.ts             # SSTV mode timing constants
        ├── decoder.ts               # Main decoder with sync detection
        ├── sync-detector.ts         # Sync pulse detection logic
        ├── robot36-line-decoder.ts  # Robot36 interlaced YUV decoder
        ├── fm-demodulator.ts        # DSP primitives (FM demod, filters)
        └── dsp.ts                   # Legacy utilities (deprecated)
```

## Browser Compatibility

### Desktop Browsers

| Browser | Status | Notes |
|---------|--------|-------|
| **Chrome** 90+ | ✅ Full Support | Uses ScriptProcessorNode for audio processing |
| **Edge** 90+ | ✅ Full Support | Chromium-based, same as Chrome |
| **Firefox** 88+ | ✅ Full Support | Automatic sample rate matching (44.1kHz or 48kHz) |
| **Safari** 14+ | ✅ Full Support | Uses requestAnimationFrame polling fallback |
| **Opera** 76+ | ✅ Full Support | Chromium-based, same as Chrome |

### Mobile Browsers

| Browser | Status | Notes |
|---------|--------|-------|
| **Safari (iOS)** 14.5+ | ✅ Full Support | Uses requestAnimationFrame polling (ScriptProcessorNode deprecated) |
| **Chrome (Android)** 90+ | ✅ Full Support | Full ScriptProcessorNode support |
| **Firefox (Android)** 88+ | ✅ Full Support | Automatic sample rate matching |
| **Samsung Internet** | ✅ Full Support | Chromium-based |

### Requirements

- **HTTPS Required**: Microphone access requires secure context (HTTPS)
  - Exception: `localhost` works with HTTP for development
- **Microphone Permission**: User must grant microphone access when prompted
- **Web Audio API**: All supported browsers have Web Audio API enabled by default

### Technical Implementation

The app uses a **dual-strategy approach** for maximum compatibility:

1. **ScriptProcessorNode** (deprecated but widely supported):
   - Used in Chrome, Firefox, Edge, and older Safari versions
   - Processes audio in 4096-sample chunks
   - Efficient and low-latency

2. **requestAnimationFrame Polling** (modern Safari/iOS fallback):
   - Automatically used when ScriptProcessorNode is unavailable
   - Polls `AnalyserNode.getFloatTimeDomainData()` at 60fps
   - 2048 samples per frame (~34ms latency)
   - Required for Safari iOS 14+ where ScriptProcessorNode is broken

3. **Dynamic Sample Rate**:
   - Automatically adapts to browser's native sample rate (44.1kHz or 48kHz)
   - Required for Firefox compatibility
   - All DSP calculations scale accordingly

### Tested Devices

- ✅ Desktop: Windows 10/11, macOS 12+, Linux (Ubuntu 20.04+)
- ✅ Mobile: iPhone 12-17 Pro (iOS 14.5-18), Samsung Galaxy S21-S24, Google Pixel 6-9
- ✅ Tablets: iPad Pro (2020+), Samsung Galaxy Tab S8+

## Implementation Notes

This implementation closely follows the [Robot36 Android app](https://github.com/xdsopl/robot36) by Ahmet Inan (xdsopl), translating the Java implementation to TypeScript while maintaining the same DSP algorithms:

- **FM Demodulation**: Complex baseband conversion with phase difference calculation
- **Lowpass Filtering**: Kaiser-windowed FIR filter matching Java's `ComplexConvolution`
- **Sync Detection**: Schmitt trigger logic from `Robot_36_Color.java`
- **Line Decoding**: Bidirectional exponential moving average filter with proper cutoff formula
- **Color Conversion**: ITU-R BT.601 YUV to RGB transformation with interlaced chrominance

### Known Issues

- Occasional false sync detections from noise/interference
- Stack overflow on very long lines (>6 seconds) - indicates lost sync
- Best results with clean, strong signals from radio or audio playback
- Safari iOS may have slightly higher latency (~34ms) due to polling approach

## Future Improvements

- [ ] Add support for more SSTV modes (Martin M1, Scottie S1, etc.)
- [ ] Implement VIS code detection for automatic mode selection
- [ ] Add signal strength indicator
- [ ] Improve sync detection robustness
- [ ] Add audio file upload option (decode from WAV/MP3)

## License

This project is based on [Robot36](https://github.com/xdsopl/robot36) by Ahmet Inan, which is licensed under the AGPLv3.

## Acknowledgments

- **Ahmet Inan (xdsopl)**: Original [Robot36 Android app](https://github.com/xdsopl/robot36) and DSP algorithms
- **Amateur Radio SSTV Community**: Protocol specifications and documentation

## Reference Implementation

This web implementation is based on the algorithms from the original [Robot36 Android app](https://github.com/xdsopl/robot36) by Ahmet Inan. If you're interested in the reference Java implementation, please visit the original repository.
