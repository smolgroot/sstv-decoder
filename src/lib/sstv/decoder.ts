import { SSTV_MODES, SSTVMode, SAMPLE_RATE } from './constants';
import { SyncDetector, SyncPulseWidth } from './sync-detector';
import { Robot36LineDecoder } from './robot36-line-decoder';

export enum DecoderState {
  IDLE = 'IDLE',
  DECODING_IMAGE = 'DECODING_IMAGE',
}

export interface DecoderStats {
  state: DecoderState;
  mode: string | null;
  currentLine: number;
  totalLines: number;
  progress: number;
  frequency: number;
}

/**
 * Main SSTV Decoder using sync detection and line-based processing
 * Architecture: Buffer audio → Detect sync pulses → Decode complete lines
 */
export class SSTVDecoder {
  private mode: SSTVMode;
  private state: DecoderState = DecoderState.IDLE;
  private imageData: Uint8ClampedArray;
  private currentLine: number = 0;
  private sampleRate: number;

  // Audio buffer (7 seconds max for line + safety margin)
  private audioBuffer: Float32Array;
  private demodulatedBuffer: Float32Array; // FM demodulated + compensated values
  private bufferWritePos: number = 0;
  private bufferSize: number;

  // Sync detection
  private syncDetector: SyncDetector;
  private lineDecoder: Robot36LineDecoder;

  // Line boundaries detected by sync pulses
  private lastSyncPos: number = -1;
  private lastSyncWidth: SyncPulseWidth | null = null;

  // Frequency calibration
  private frequencyOffset: number = 0;

  constructor(sampleRate: number = SAMPLE_RATE) {
    this.sampleRate = sampleRate;
    
    // Robot36 only
    this.mode = SSTV_MODES['ROBOT36'];
    this.imageData = new Uint8ClampedArray(320 * 240 * 4);

    // Initialize with grey
    for (let i = 0; i < this.imageData.length; i += 4) {
      this.imageData[i] = 128;     // R
      this.imageData[i + 1] = 128; // G
      this.imageData[i + 2] = 128; // B
      this.imageData[i + 3] = 255; // A
    }

    // Buffer size: 7 seconds (max line ~150ms + safety margin)
    this.bufferSize = Math.floor(sampleRate * 7);
    this.audioBuffer = new Float32Array(this.bufferSize);
    this.demodulatedBuffer = new Float32Array(this.bufferSize);

    // Create sync detector and line decoder
    this.syncDetector = new SyncDetector(sampleRate);
    this.lineDecoder = new Robot36LineDecoder(sampleRate);
  }

  // Sample counter for periodic logging
  private sampleCounter: number = 0;
  private lastLogTime: number = 0;
  private absoluteSamplePosition: number = 0;

  /**
   * Process audio samples
   */
  processSamples(samples: Float32Array): void {
    if (this.state !== DecoderState.DECODING_IMAGE) {
      return;
    }

    this.sampleCounter += samples.length;

    // Process samples through sync detector FIRST to get demodulated values
    const demodulated = new Float32Array(samples.length);
    const result = this.syncDetector.process(samples, demodulated);

    // Store both raw audio AND demodulated samples in circular buffers
    for (let i = 0; i < samples.length; i++) {
      this.audioBuffer[this.bufferWritePos] = samples[i];
      this.demodulatedBuffer[this.bufferWritePos] = demodulated[i];
      this.bufferWritePos = (this.bufferWritePos + 1) % this.bufferSize;
    }

    // Log periodically (every 2 seconds)
    const now = Date.now();
    if (now - this.lastLogTime > 2000) {
      const avgAmplitude = samples.reduce((sum, val) => sum + Math.abs(val), 0) / samples.length;
      console.log(`Processing audio: ${this.sampleCounter} samples, avgAmp=${avgAmplitude.toFixed(4)}, bufferPos=${this.bufferWritePos}`);
      this.lastLogTime = now;
    }

    if (result.detected) {
      console.log(`🎯 Sync DETECTED! width=${result.width}, offset=${result.offset}, freqOffset=${result.frequencyOffset.toFixed(1)}Hz`);

      // Calculate absolute position in buffer (where sync pulse ended)
      const syncEndPos = (this.bufferWritePos - samples.length + result.offset + this.bufferSize) % this.bufferSize;

      // Only process if this is a new sync pulse (9ms or 20ms)
      if ((result.width === SyncPulseWidth.NineMilliSeconds || result.width === SyncPulseWidth.TwentyMilliSeconds) &&
          (this.lastSyncPos === -1 || this.distanceInBuffer(this.lastSyncPos, syncEndPos) > this.sampleRate * 0.1)) {

        // Update frequency calibration
        this.frequencyOffset = result.frequencyOffset;

        // If we have a previous sync, decode the line between them
        if (this.lastSyncPos !== -1) {
          const distance = this.distanceInBuffer(this.lastSyncPos, syncEndPos);
          console.log(`📏 Decoding line between syncs: distance=${distance} samples (${(distance/this.sampleRate*1000).toFixed(1)}ms)`);
          this.decodeLine(this.lastSyncPos, syncEndPos);
        }

        this.lastSyncPos = syncEndPos;
        this.lastSyncWidth = result.width;
      } else if (result.width === SyncPulseWidth.FiveMilliSeconds) {
        console.log(`⏭️ Skipping 5ms sync (VIS code)`);
      } else {
        console.log(`⏭️ Skipping sync: too close to last`);
      }
    }

    this.absoluteSamplePosition += samples.length;
  }

  /**
   * Calculate distance between two positions in circular buffer
   */
  private distanceInBuffer(start: number, end: number): number {
    if (end >= start) {
      return end - start;
    } else {
      return (this.bufferSize - start) + end;
    }
  }

  /**
   * Decode a complete line between two sync pulses
   */
  private decodeLine(startPos: number, endPos: number): void {
    const lineLength = this.distanceInBuffer(startPos, endPos);

    console.log(`🔍 decodeLine: lineLength=${lineLength} samples (${(lineLength/this.sampleRate*1000).toFixed(1)}ms)`);

    // Extract DEMODULATED line samples into contiguous buffer
    const lineSamples = new Float32Array(lineLength);
    for (let i = 0; i < lineLength; i++) {
      const pos = (startPos + i) % this.bufferSize;
      lineSamples[i] = this.demodulatedBuffer[pos]; // Use demodulated, not raw audio
    }

    // Check sample quality (demodulated values should be ~±300 range after compensation)
    const avgAmp = lineSamples.reduce((sum, val) => sum + Math.abs(val), 0) / lineSamples.length;
    console.log(`📊 Demodulated line: avgAmp=${avgAmp.toFixed(1)}, min=${Math.min(...lineSamples).toFixed(1)}, max=${Math.max(...lineSamples).toFixed(1)}`);

    // Decode the scan line
    const line = this.lineDecoder.decodeScanLine(lineSamples, 0, this.frequencyOffset);

    // Copy decoded pixels to image data
    if (line && line.height > 0) {
      // height=0 for even lines (stores data), height=2 for odd lines (outputs 2 lines)
      const pixelsPerLine = line.width;
      const numLines = line.height;

      for (let lineIdx = 0; lineIdx < numLines; lineIdx++) {
        const targetLine = this.currentLine + lineIdx;
        if (targetLine >= 240) continue;

        for (let x = 0; x < pixelsPerLine && x < 320; x++) {
          const srcIdx = (lineIdx * pixelsPerLine + x) * 4;
          const destIdx = (targetLine * 320 + x) * 4;

          this.imageData[destIdx] = line.pixels[srcIdx];       // R
          this.imageData[destIdx + 1] = line.pixels[srcIdx + 1]; // G
          this.imageData[destIdx + 2] = line.pixels[srcIdx + 2]; // B
          this.imageData[destIdx + 3] = 255; // A
        }
      }

      this.currentLine += numLines;
      console.log(`Decoded ${numLines} line(s), now at line ${this.currentLine}/240`);
    } else if (line && line.height === 0) {
      console.log(`Stored even line for interlacing`);
    }
  }

  /**
   * Get current image data
   */
  getImageData(): Uint8ClampedArray {
    return this.imageData;
  }

  /**
   * Get decoder statistics
   */
  getStats(): DecoderStats {
    return {
      state: this.state,
      mode: 'Robot 36',
      currentLine: this.currentLine,
      totalLines: 240,
      progress: (this.currentLine / 240) * 100,
      frequency: Math.round(1900 + this.frequencyOffset), // Center frequency + offset
    };
  }

  /**
   * Get image dimensions
   */
  getDimensions(): { width: number; height: number } {
    return {
      width: 320,
      height: 240,
    };
  }

  /**
   * Reset decoder
   */
  reset(): void {
    this.currentLine = 0;
    this.bufferWritePos = 0;
    this.lastSyncPos = -1;
    this.lastSyncWidth = null;
    this.frequencyOffset = 0;
    this.sampleCounter = 0;
    this.lastLogTime = 0;
    this.absoluteSamplePosition = 0;

    // Reset sync detector state
    this.syncDetector.reset();
    this.lineDecoder.reset();

    // Clear audio buffer
    this.audioBuffer.fill(0);

    // Clear image data to black
    for (let i = 0; i < this.imageData.length; i += 4) {
      this.imageData[i] = 0;       // R
      this.imageData[i + 1] = 0;   // G
      this.imageData[i + 2] = 0;   // B
      this.imageData[i + 3] = 255; // A
    }
  }

  /**
   * Start decoding
   */
  start(): void {
    this.reset();
    this.state = DecoderState.DECODING_IMAGE;
    console.log('Starting SSTV decode with sync detection');
  }

  /**
   * Stop decoding
   */
  stop(): void {
    this.state = DecoderState.IDLE;
  }
}
