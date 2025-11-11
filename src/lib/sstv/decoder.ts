import {
  SSTV_MODES,
  SSTVMode,
  FREQ_SYNC,
  FREQ_BLACK,
  FREQ_WHITE,
  SAMPLE_RATE,
} from './constants';
import { FrequencyDetector, frequencyToPixel, LowPassFilter } from './dsp';

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

export class SSTVDecoder {
  private mode: SSTVMode;
  private state: DecoderState = DecoderState.IDLE;
  private imageData: Uint8ClampedArray;
  private currentLine = 0;
  private currentPixel = 0;
  private currentColor = 0;

  private frequencyDetector: FrequencyDetector;
  private sampleCount = 0;

  private samplesPerMs: number;
  private colorSamplesPerLine: number;

  private lowPassFilter: LowPassFilter;
  private currentFrequency = 0;

  constructor(modeName: keyof typeof SSTV_MODES = 'ROBOT36') {
    this.mode = SSTV_MODES[modeName];
    this.imageData = new Uint8ClampedArray(this.mode.width * this.mode.height * 4);

    // Initialize with black background
    for (let i = 0; i < this.imageData.length; i += 4) {
      this.imageData[i] = 0;     // R
      this.imageData[i + 1] = 0; // G
      this.imageData[i + 2] = 0; // B
      this.imageData[i + 3] = 255; // A
    }

    // Setup frequency detection for key frequencies
    // More frequency bins for better resolution (1500-2300Hz in ~13Hz steps)
    const detectionFreqs = [
      FREQ_SYNC,
      FREQ_BLACK,
      ...this.generateFrequencyRange(FREQ_BLACK, FREQ_WHITE, 60),
      FREQ_WHITE,
    ];

    this.frequencyDetector = new FrequencyDetector(SAMPLE_RATE, detectionFreqs);
    this.lowPassFilter = new LowPassFilter(0.2); // Less filtering for faster response

    this.samplesPerMs = SAMPLE_RATE / 1000;
    this.colorSamplesPerLine = Math.floor(this.mode.colorScanTime * this.samplesPerMs);
  }

  private generateFrequencyRange(start: number, end: number, steps: number): number[] {
    const range: number[] = [];
    const step = (end - start) / steps;
    for (let i = 1; i < steps; i++) {
      range.push(Math.round(start + step * i));
    }
    return range;
  }

  /**
   * Process audio samples
   */
  processSamples(samples: Float32Array): void {
    for (let i = 0; i < samples.length; i++) {
      this.processSample(samples[i]);
    }
  }

  private processSample(sample: number): void {
    this.frequencyDetector.processSample(sample);
    this.sampleCount++;

    // Get frequency more frequently for better resolution
    if (this.sampleCount % 20 === 0) {
      const freq = this.frequencyDetector.getFrequency();
      this.currentFrequency = this.lowPassFilter.process(freq);
    }

    // Always decode when active - no sync detection
    if (this.state === DecoderState.DECODING_IMAGE) {
      this.decodeImage();
    }
  }

  private decodeImage(): void {
    if (this.currentLine >= this.mode.height) {
      this.state = DecoderState.IDLE;
      console.log('Image decode complete');
      return;
    }

    // Calculate timing for current line
    const totalLineSamples = Math.floor(this.mode.scanTime * this.samplesPerMs);
    const samplesIntoLine = this.sampleCount % totalLineSamples;
    const syncSamples = Math.floor(this.mode.syncPulse * this.samplesPerMs);
    const porchSamples = Math.floor(this.mode.syncPorch * this.samplesPerMs);
    const separatorSamples = Math.floor(this.mode.separatorPulse * this.samplesPerMs);

    // Check if we should advance to next line (when we wrap around)
    if (samplesIntoLine === 0 && this.sampleCount > 0) {
      // Just wrapped to new line
      this.currentLine++;
      this.currentPixel = 0;
      this.currentColor = 0;

      if (this.currentLine % 20 === 0) {
        console.log(`Decoding line ${this.currentLine}/${this.mode.height}`);
      }

      if (this.currentLine >= this.mode.height) {
        this.state = DecoderState.IDLE;
        console.log('Image decode complete');
        return;
      }
    }

    // Skip sync and porch at start of line
    if (samplesIntoLine < syncSamples + porchSamples) {
      return;
    }

    // Position after sync and porch
    const dataPosition = samplesIntoLine - syncSamples - porchSamples;

    // Each line has: [Color1 data][Separator][Color2 data][Separator][Color3 data]
    // Calculate total samples for one color + separator
    const samplesPerColorBlock = this.colorSamplesPerLine + separatorSamples;

    // Total valid data region (all colors + all separators except the last one)
    const totalDataSamples = (this.colorSamplesPerLine * this.mode.colorOrder.length) +
                             (separatorSamples * (this.mode.colorOrder.length - 1));

    // If we're beyond all valid data for this line, skip
    if (dataPosition >= totalDataSamples) {
      return;
    }

    // Determine which color block we're in (0, 1, or 2)
    const colorBlockIndex = Math.floor(dataPosition / samplesPerColorBlock);

    if (colorBlockIndex >= this.mode.colorOrder.length) {
      // Beyond all color data for this line
      return;
    }    // Position within this color block
    const positionInBlock = dataPosition % samplesPerColorBlock;

    // Skip separator pulse - only process if we're in the actual color scan time
    if (positionInBlock >= this.colorSamplesPerLine) {
      // We're in the separator region, skip it
      return;
    }

    // Calculate which pixel (0 to width-1)
    const pixelX = Math.floor((positionInBlock / this.colorSamplesPerLine) * this.mode.width);

    // Strict bounds check - reject invalid pixels
    if (pixelX < 0 || pixelX >= this.mode.width) {
      return;
    }

    // Track position
    this.currentPixel = pixelX;
    this.currentColor = colorBlockIndex;

    // Convert frequency to pixel value
    const pixelValue = frequencyToPixel(this.currentFrequency, FREQ_BLACK, FREQ_WHITE);

    // Debug first few pixels
    if (this.currentLine === 0 && pixelX < 5 && colorBlockIndex === 0) {
      console.log(`Pixel [${pixelX}] color ${colorBlockIndex}: freq=${this.currentFrequency.toFixed(0)}Hz -> value=${pixelValue}`);
    }

    // Set pixel in image data - write on every sample for continuous coverage
    const pixelIndex = (this.currentLine * this.mode.width + pixelX) * 4;

    if (pixelIndex >= 0 && pixelIndex < this.imageData.length - 3) {
      const colorChannel = this.mode.colorOrder[colorBlockIndex];

      switch (colorChannel) {
        case 'R':
          this.imageData[pixelIndex] = pixelValue;
          break;
        case 'G':
          this.imageData[pixelIndex + 1] = pixelValue;
          break;
        case 'B':
          this.imageData[pixelIndex + 2] = pixelValue;
          break;
      }
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
      mode: this.mode.name,
      currentLine: this.currentLine,
      totalLines: this.mode.height,
      progress: (this.currentLine / this.mode.height) * 100,
      frequency: Math.round(this.currentFrequency),
    };
  }

  /**
   * Get image dimensions
   */
  getDimensions(): { width: number; height: number } {
    return {
      width: this.mode.width,
      height: this.mode.height,
    };
  }

  /**
   * Reset decoder
   */
  reset(): void {
    this.currentLine = 0;
    this.currentPixel = 0;
    this.currentColor = 0;
    this.sampleCount = 0;
    this.frequencyDetector.reset();
    this.lowPassFilter.reset();

    // Clear image
    for (let i = 0; i < this.imageData.length; i += 4) {
      this.imageData[i] = 0;
      this.imageData[i + 1] = 0;
      this.imageData[i + 2] = 0;
      this.imageData[i + 3] = 255;
    }
  }

  /**
   * Change SSTV mode
   */
  setMode(modeName: keyof typeof SSTV_MODES): void {
    this.mode = SSTV_MODES[modeName];
    this.imageData = new Uint8ClampedArray(this.mode.width * this.mode.height * 4);
    this.colorSamplesPerLine = Math.floor(this.mode.colorScanTime * this.samplesPerMs);
    this.reset();
  }

  /**
   * Start decoding - immediately begin decoding without sync detection
   */
  start(): void {
    this.reset();
    this.state = DecoderState.DECODING_IMAGE;
    console.log('Starting SSTV decode - will show noise until signal arrives');
  }

  /**
   * Stop decoding
   */
  stop(): void {
    this.state = DecoderState.IDLE;
  }
}
