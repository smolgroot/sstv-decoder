# SSTV Decoder Web Application

A web application for real-time SSTV (Slow Scan Television) decoding from microphone input. Based on the [Robot36 Android app](https://github.com/xdsopl/robot36) by xdsopl.

## Features

- **Real-time Audio Processing**: Captures microphone input using Web Audio API (44.1 kHz)
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
- **Web Audio API**: Real-time audio capture and processing (ScriptProcessorNode)
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

- **Sample Rate**: 44.1 kHz
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

- **9ms Pulses**: Scan line sync (309-639 samples at 44.1 kHz)
- **5ms Pulses**: VIS code/calibration headers (110-309 samples, ignored)
- **20ms Pulses**: Frame sync (639-1103 samples)
- **Frequency Tolerance**: ±0.125 normalized units (~50 Hz at 1900 Hz center)

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

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support (iOS 14.5+)
- Requires HTTPS for microphone access (except on localhost)

## Implementation Notes

This implementation closely follows the [Robot36 Android app](https://github.com/xdsopl/robot36) by Ahmet Inan (xdsopl), translating the Java implementation to TypeScript while maintaining the same DSP algorithms:

- **FM Demodulation**: Complex baseband conversion with phase difference calculation
- **Lowpass Filtering**: Kaiser-windowed FIR filter matching Java's `ComplexConvolution`
- **Sync Detection**: Schmitt trigger logic from `Robot_36_Color.java`
- **Line Decoding**: Bidirectional exponential moving average filter with proper cutoff formula
- **Color Conversion**: ITU-R BT.601 YUV to RGB transformation with interlaced chrominance

### Known Issues

- Uses deprecated `ScriptProcessorNode` (should migrate to AudioWorklet)
- Occasional false sync detections from noise/interference
- Stack overflow on very long lines (>6 seconds) - indicates lost sync
- Best results with clean, strong signals from radio or audio playback

## Future Improvements

- [ ] Migrate to AudioWorkletProcessor for better performance
- [ ] Add support for more SSTV modes (Martin M1, Scottie S1, etc.)
- [ ] Implement VIS code detection for automatic mode selection
- [ ] Add signal strength indicator
- [ ] Improve sync detection robustness
- [ ] Add audio file upload option (decode from WAV/MP3)

## License

This project is based on [Robot36](https://github.com/xdsopl/robot36) by Ahmet Inan, which is licensed under the AGPLv3.

## Acknowledgments

- **Ahmet Inan (xdsopl)**: Original Robot36 Android app and DSP algorithms
- **Amateur Radio SSTV Community**: Protocol specifications and documentation
- The Java implementation at `./robot36/` is included as reference for algorithm verification
