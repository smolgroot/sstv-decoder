# SSTV Decoder Web Application

A simple web application for real-time SSTV (Slow Scan Television) decoding from microphone input. Similar to the Robot36 Android app functionality.

## Features

- **Real-time Audio Processing**: Captures microphone input using Web Audio API
- **SSTV Decoding**: Supports multiple SSTV modes:
  - Robot36 (320x240)
  - Martin M1 (320x256)
  - Scottie S1 (320x256)
- **Live Image Display**: Progressive image rendering on HTML canvas
- **Save Image**: Export decoded images as PNG files with timestamped filenames
- **Frequency Analysis**: Uses Goertzel algorithm for accurate frequency detection
- **Mobile-First Design**: Fully responsive UI optimized for mobile devices
- **Digital Signal Processing**: Includes low-pass filtering for signal smoothing

## Technology Stack

- **Next.js 14+**: React framework with App Router
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first styling
- **Web Audio API**: Real-time audio capture and processing
- **Canvas API**: Image rendering

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

1. **Select SSTV Mode**: Choose the appropriate mode (Robot36, Martin M1, or Scottie S1) from the dropdown
2. **Start Decoding**: Click "Start Decoding" to begin capturing audio from your microphone
3. **Grant Microphone Permission**: Allow the browser to access your microphone when prompted
4. **Play SSTV Signal**: Play an SSTV signal near your microphone (from another device, radio, etc.)
5. **Watch Live Decoding**: The decoded image will appear progressively on the canvas
6. **Reset**: Click "Reset" to clear the canvas and start a new decode
7. **Save Image**: Click "Save Image" to download the decoded image as a PNG file
   - Filename format: `sstv-decode-{MODE}-{TIMESTAMP}.png`
   - Example: `sstv-decode-robot36-20240315-143022.png`
8. **Stop**: Click "Stop" to end the decoding session

## Technical Details

### Audio Processing

- Sample Rate: 44.1 kHz
- Frequency Detection: Goertzel algorithm with 60 frequency bins
- Frequency Range: 1500 Hz (black) to 2300 Hz (white)
- Sync Frequency: 1200 Hz
- Low-pass Filter: Alpha = 0.2 for signal smoothing

### SSTV Modes

#### Robot36
- Resolution: 320x240 pixels
- Color Format: YUV
- Scan Time: 150ms per line

#### Martin M1
- Resolution: 320x256 pixels
- Color Format: RGB
- Scan Time: 446.446ms per line

#### Scottie S1
- Resolution: 320x256 pixels
- Color Format: RGB
- Scan Time: 428.22ms per line

### Image Export

- Format: PNG (lossless compression)
- Resolution: Matches selected SSTV mode
- Filename: Includes mode and timestamp for easy identification
- Method: Canvas.toBlob() API for efficient conversion

## Project Structure

```
src/
├── app/
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Home page
│   └── globals.css         # Global styles
├── components/
│   └── SSTVDecoder.tsx     # Main decoder component
├── hooks/
│   └── useAudioProcessor.ts # Audio processing hook
└── lib/
    └── sstv/
        ├── constants.ts    # SSTV mode specifications
        ├── decoder.ts      # Main decoder logic
        └── dsp.ts          # Digital signal processing utilities
```

## Browser Compatibility

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support (iOS 14.5+)
- Requires HTTPS for microphone access (except on localhost)

## Known Limitations

- No automatic sync detection - starts decoding immediately
- Works best with clean, strong SSTV signals
- Background noise may affect decoding quality

## License

[Your License Here]

## Acknowledgments

- Inspired by the Robot36 Android application
- SSTV protocol specifications from various amateur radio sources
