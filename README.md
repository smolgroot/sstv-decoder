# SSTV Decoder Web Application

A real-time SSTV (Slow Scan Television) decoder web application built with Next.js. Decode SSTV signals from your microphone directly in your browser - similar to the Robot36 Android app.

## Features

- **Real-time SSTV Decoding**: Captures audio from your microphone and decodes SSTV signals in real-time
- **Multiple SSTV Modes**: Supports Robot36, Martin M1, and Scottie S1 modes
- **Live Image Display**: Progressive image rendering on HTML canvas as the signal is decoded
- **Audio Spectrum Visualization**: Real-time frequency spectrum analyzer
- **Web Audio API**: Efficient audio processing using browser-native APIs
- **TypeScript**: Full type safety throughout the codebase
- **Responsive Design**: Modern UI with Tailwind CSS

## Technology Stack

- **Next.js 15**: React framework with App Router
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first styling
- **Web Audio API**: Microphone access and audio processing
- **Canvas API**: Image rendering and visualization

## Getting Started

### Prerequisites

- Node.js 18+ installed
- A modern web browser with Web Audio API support
- Microphone access

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
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

1. **Select SSTV Mode**: Choose between Robot36, Martin M1, or Scottie S1
2. **Start Decoding**: Click "Start Decoding" to enable microphone access
3. **Play SSTV Signal**: Play an SSTV audio signal (from a recording or generator)
4. **Watch Decoding**: The image will appear progressively on the canvas
5. **Reset/Stop**: Use the Reset button to clear and restart, or Stop to end the session

## SSTV Signal Sources

To test the decoder, you can:
- Use online SSTV signal generators
- Play pre-recorded SSTV audio files
- Receive actual SSTV transmissions from ham radio operators
- Use SSTV encoding software like MMSSTV or Robot36

## Architecture

### Core Components

- **`src/lib/sstv/decoder.ts`**: Main SSTV decoding engine
- **`src/lib/sstv/dsp.ts`**: Digital signal processing (Goertzel filters, frequency detection)
- **`src/lib/sstv/constants.ts`**: SSTV mode specifications and frequency constants
- **`src/hooks/useAudioProcessor.ts`**: React hook for audio capture and processing
- **`src/components/SSTVDecoder.tsx`**: Main UI component with controls and canvas

### Decoding Process

1. **Audio Capture**: Web Audio API captures microphone input at 44.1kHz
2. **Frequency Detection**: Goertzel filters detect specific SSTV frequencies
3. **Sync Detection**: Identifies sync pulses (1200 Hz) to start decoding
4. **Line Decoding**: Converts frequency values to pixel brightness (1500-2300 Hz)
5. **Color Composition**: Assembles RGB channels according to mode specification
6. **Canvas Rendering**: Updates the canvas in real-time as lines are decoded

## Browser Compatibility

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support (requires HTTPS for microphone access)
- Mobile browsers: Limited support (microphone API availability varies)

## Deployment

This application is ready to deploy on Vercel:

```bash
npm install -g vercel
vercel
```

Or connect your GitHub repository to Vercel for automatic deployments.

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Acknowledgments

- Inspired by the Robot36 Android application
- SSTV protocol specifications from the amateur radio community
- Goertzel algorithm for efficient frequency detection

## Future Enhancements

- [ ] VIS code auto-detection for automatic mode selection
- [ ] Image saving/export functionality
- [ ] Additional SSTV modes (PD modes, Wraase modes)
- [ ] Audio file upload for offline decoding
- [ ] Signal strength meter and quality indicator
- [ ] WebAssembly port for improved performance
