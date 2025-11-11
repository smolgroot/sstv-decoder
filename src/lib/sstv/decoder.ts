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
  DETECTING_SYNC = 'DETECTING_SYNC',
  DETECTING_VIS = 'DETECTING_VIS',
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
  private syncDetectCount = 0;
  private readonly syncThreshold = 10; // Number of consecutive sync samples needed
  
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
    const detectionFreqs = [
      FREQ_SYNC,
      FREQ_BLACK,
      ...this.generateFrequencyRange(FREQ_BLACK, FREQ_WHITE, 20),
      FREQ_WHITE,
    ];
    
    this.frequencyDetector = new FrequencyDetector(SAMPLE_RATE, detectionFreqs);
    this.lowPassFilter = new LowPassFilter(0.3);
    
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

    // Get frequency on every sample (Goertzel accumulates internally)
    // We use a small window size so we get frequent updates
    if (this.sampleCount % 50 === 0) {
      const freq = this.frequencyDetector.getFrequency();
      this.currentFrequency = this.lowPassFilter.process(freq);
    }
    
    // Process state machine on every sample
    switch (this.state) {
      case DecoderState.IDLE:
      case DecoderState.DETECTING_SYNC:
        if (this.sampleCount % 100 === 0) {
          this.detectSync();
        }
        break;
      case DecoderState.DECODING_IMAGE:
        // Decode on every sample to get accurate pixel placement
        this.decodeImage();
        break;
    }
  }

  private detectSync(): void {
    const syncMagnitude = this.frequencyDetector.getMagnitude(FREQ_SYNC);
    const threshold = 50; // Adjust based on signal strength

    // Debug: log signal strength periodically
    if (this.sampleCount % 44100 === 0) { // Every second
      console.log(`Sync detection: magnitude=${syncMagnitude.toFixed(1)}, freq=${this.currentFrequency.toFixed(0)}Hz`);
    }

    if (syncMagnitude > threshold) {
      this.syncDetectCount++;
      if (this.syncDetectCount >= this.syncThreshold) {
        this.state = DecoderState.DECODING_IMAGE;
        this.currentLine = 0;
        this.currentPixel = 0;
        this.currentColor = 0;
        this.sampleCount = 0;
        console.log('🎯 Sync detected, starting decode!');
      }
    } else {
      this.syncDetectCount = 0;
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

    // Check if we should advance to next line
    if (samplesIntoLine < 10 && this.sampleCount > totalLineSamples) {
      // Just wrapped to new line
      this.currentLine++;
      this.currentPixel = 0;
      this.currentColor = 0;
      
      if (this.currentLine % 10 === 0) {
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
    
    // Determine which color block we're in (0, 1, or 2)
    const colorBlockIndex = Math.floor(dataPosition / samplesPerColorBlock);
    
    if (colorBlockIndex >= this.mode.colorOrder.length) {
      // Beyond all color data for this line
      return;
    }

    // Position within this color block
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
    
    // Only update if we've moved to a new pixel or color channel
    if (pixelX !== this.currentPixel || colorBlockIndex !== this.currentColor) {
      this.currentPixel = pixelX;
      this.currentColor = colorBlockIndex;
      
      // Convert frequency to pixel value
      const pixelValue = frequencyToPixel(this.currentFrequency, FREQ_BLACK, FREQ_WHITE);
      
      // Debug first few pixels
      if (this.currentLine === 0 && pixelX < 5 && colorBlockIndex === 0) {
        console.log(`Pixel [${pixelX}] color ${colorBlockIndex}: freq=${this.currentFrequency.toFixed(0)}Hz -> value=${pixelValue}`);
      }
      
      // Set pixel in image data
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
    this.state = DecoderState.IDLE;
    this.currentLine = 0;
    this.currentPixel = 0;
    this.currentColor = 0;
    this.sampleCount = 0;
    this.syncDetectCount = 0;
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
   * Start decoding
   */
  start(): void {
    this.reset();
    this.state = DecoderState.DETECTING_SYNC;
  }

  /**
   * Stop decoding
   */
  stop(): void {
    this.state = DecoderState.IDLE;
  }
}
