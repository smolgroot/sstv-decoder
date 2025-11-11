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
  private ySamples: number;    // Y channel: 88ms
  private rySamples: number;   // R-Y channel: 44ms
  private bySamples: number;   // B-Y channel: 44ms

  private lowPassFilter: LowPassFilter;
  private currentFrequency = 0;
  
  // Track last pixel written to avoid redundant writes
  private lastPixelX = -1;
  private lastPixelLine = -1;
  private lastChannelIndex = -1;

  constructor() {
    // Robot36 only
    this.mode = SSTV_MODES.ROBOT36;
    this.imageData = new Uint8ClampedArray(320 * 240 * 4);

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

    // Robot36 specific: Y=88ms, R-Y=44ms, B-Y=44ms
    this.ySamples = Math.floor(88 * this.samplesPerMs);
    this.rySamples = Math.floor(44 * this.samplesPerMs);
    this.bySamples = Math.floor(44 * this.samplesPerMs);
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

    // Get frequency on every sample for maximum resolution
    const freq = this.frequencyDetector.getFrequency();
    this.currentFrequency = this.lowPassFilter.process(freq);

    // Always decode when active - no sync detection
    if (this.state === DecoderState.DECODING_IMAGE) {
      this.decodeImage();
    }
  }

  private decodeImage(): void {
    if (this.currentLine >= 240) {
      this.state = DecoderState.IDLE;
      console.log('Image decode complete');
      return;
    }

    // Robot36 line structure:
    // sync(9ms) + porch(3ms) + Y(88ms) + sep(4.5ms) + R-Y(44ms) + sep(1.5ms) + B-Y(44ms)
    const totalLineSamples = Math.floor(150 * this.samplesPerMs); // 150ms per line
    const samplesIntoLine = this.sampleCount % totalLineSamples;
    const syncSamples = Math.floor(9 * this.samplesPerMs);
    const porchSamples = Math.floor(3 * this.samplesPerMs);
    const sep1Samples = Math.floor(4.5 * this.samplesPerMs);
    const sep2Samples = Math.floor(1.5 * this.samplesPerMs);

    // Check if we should advance to next line
    if (samplesIntoLine === 0 && this.sampleCount > 0) {
      this.currentLine++;
      this.lastPixelX = -1; // Reset pixel tracking for new line
      this.lastChannelIndex = -1;
      
      if (this.currentLine % 20 === 0) {
        console.log(`Decoding line ${this.currentLine}/240`);
      }
      if (this.currentLine >= 240) {
        this.state = DecoderState.IDLE;
        console.log('Image decode complete');
        return;
      }
    }

    // Skip sync and porch
    if (samplesIntoLine < syncSamples + porchSamples) {
      return;
    }

    const dataPosition = samplesIntoLine - syncSamples - porchSamples;

    // Determine which channel we're in
    let channelIndex = -1; // 0=Y, 1=R-Y, 2=B-Y
    let positionInChannel = 0;
    let channelSamples = 0;

    if (dataPosition < this.ySamples) {
      // Y channel (luminance)
      channelIndex = 0;
      positionInChannel = dataPosition;
      channelSamples = this.ySamples;
    } else if (dataPosition < this.ySamples + sep1Samples) {
      // First separator - skip
      return;
    } else if (dataPosition < this.ySamples + sep1Samples + this.rySamples) {
      // R-Y channel (red chrominance)
      channelIndex = 1;
      positionInChannel = dataPosition - this.ySamples - sep1Samples;
      channelSamples = this.rySamples;
    } else if (dataPosition < this.ySamples + sep1Samples + this.rySamples + sep2Samples) {
      // Second separator - skip
      return;
    } else if (dataPosition < this.ySamples + sep1Samples + this.rySamples + sep2Samples + this.bySamples) {
      // B-Y channel (blue chrominance)
      channelIndex = 2;
      positionInChannel = dataPosition - this.ySamples - sep1Samples - this.rySamples - sep2Samples;
      channelSamples = this.bySamples;
    } else {
      // Beyond valid data
      return;
    }

    // Calculate pixel position (0-319)
    const pixelX = Math.floor((positionInChannel / channelSamples) * 320);
    if (pixelX < 0 || pixelX >= 320) {
      return;
    }

    // Only write when we advance to a new pixel or channel
    const pixelChanged = (pixelX !== this.lastPixelX || 
                         this.currentLine !== this.lastPixelLine || 
                         channelIndex !== this.lastChannelIndex);
    
    if (!pixelChanged) {
      return; // Skip redundant writes to the same pixel
    }
    
    this.lastPixelX = pixelX;
    this.lastPixelLine = this.currentLine;
    this.lastChannelIndex = channelIndex;

    // Convert frequency to pixel value (0-255)
    const pixelValue = frequencyToPixel(this.currentFrequency, FREQ_BLACK, FREQ_WHITE);

    // Set pixel in image data
    const pixelIndex = (this.currentLine * 320 + pixelX) * 4;
    if (pixelIndex >= 0 && pixelIndex < this.imageData.length - 3) {
      // Robot36 uses YUV color space - need proper conversion to RGB
      if (channelIndex === 0) {
        // Y (luminance) - store temporarily in green channel
        this.imageData[pixelIndex + 1] = pixelValue; // Store Y in G channel
      } else if (channelIndex === 1) {
        // R-Y (red chrominance) - convert YUV to RGB
        const y = this.imageData[pixelIndex + 1]; // Get Y value
        const ry = pixelValue - 128; // Center chrominance around 0

        // R = Y + R-Y
        this.imageData[pixelIndex] = Math.max(0, Math.min(255, y + ry));
      } else if (channelIndex === 2) {
        // B-Y (blue chrominance) - convert YUV to RGB
        const y = this.imageData[pixelIndex + 1]; // Get Y value
        const by = pixelValue - 128; // Center chrominance around 0

        // B = Y + B-Y
        this.imageData[pixelIndex + 2] = Math.max(0, Math.min(255, y + by));

        // Now calculate G using the YUV to RGB formula:
        // G = Y - 0.299*R-Y/0.587 - 0.114*B-Y/0.587
        // Simplified: G = Y - 0.509*(R-Y) - 0.194*(B-Y)
        const r = this.imageData[pixelIndex];
        const b = this.imageData[pixelIndex + 2];
        const ry = r - y;
        const by_val = b - y;
        const g = y - 0.509 * ry - 0.194 * by_val;
        this.imageData[pixelIndex + 1] = Math.max(0, Math.min(255, g));
      }
    }
  }  /**
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
      frequency: Math.round(this.currentFrequency),
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
    this.currentPixel = 0;
    this.currentColor = 0;
    this.sampleCount = 0;
    this.lastPixelX = -1;
    this.lastPixelLine = -1;
    this.lastChannelIndex = -1;
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
