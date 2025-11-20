/**
 * PD120 Line Decoder
 * Decodes a single PD120 scan line using sequential RGB format
 * PD modes transmit Y, R, B components sequentially (no interlacing)
 */

import { ExponentialMovingAverage } from './fm-demodulator';

export interface DecodedLine {
  pixels: Uint8ClampedArray; // RGBA pixel data
  width: number;
  height: number; // Always 1 for PD120 (non-interlaced)
  isOddLine: boolean; // Not used for PD120, always false
}

export class PD120LineDecoder {
  private lowPassFilter: ExponentialMovingAverage;

  private readonly horizontalPixels = 640;
  private readonly verticalPixels = 496;
  private readonly samplesPerMs: number;
  
  // Timing samples for each component
  private readonly ySamples: number;
  private readonly rSamples: number;
  private readonly bSamples: number;
  private readonly separatorSamples: number;
  private readonly porchSamples: number;
  
  // Begin positions for each component
  private readonly yBeginSamples: number;
  private readonly rBeginSamples: number;
  private readonly bBeginSamples: number;
  private readonly endSamples: number;

  constructor(sampleRate: number) {
    this.samplesPerMs = sampleRate / 1000;

    // PD120 timing (in seconds)
    const syncPulseSeconds = 0.020;      // 20ms
    const syncPorchSeconds = 0.00208;    // 2.08ms
    const ySeconds = 0.1216;             // 121.6ms (Y channel = luminance)
    const separatorSeconds = 0.004862;   // 4.862ms
    const porchSeconds = 0.001504;       // 1.504ms
    const rSeconds = 0.1216;             // 121.6ms (R channel)
    const bSeconds = 0.1216;             // 121.6ms (B channel)

    this.ySamples = Math.round(ySeconds * sampleRate);
    this.rSamples = Math.round(rSeconds * sampleRate);
    this.bSamples = Math.round(bSeconds * sampleRate);
    this.separatorSamples = Math.round(separatorSeconds * sampleRate);
    this.porchSamples = Math.round(porchSeconds * sampleRate);

    // Calculate begin positions
    // Line structure: sync(20) + porch(2.08) + Y(121.6) + sep(4.862) + porch(1.504) + R(121.6) + sep(4.862) + porch(1.504) + B(121.6)
    this.yBeginSamples = Math.round(syncPorchSeconds * sampleRate);
    this.rBeginSamples = Math.round((syncPorchSeconds + ySeconds + separatorSeconds + porchSeconds) * sampleRate);
    this.bBeginSamples = Math.round((syncPorchSeconds + ySeconds + separatorSeconds + porchSeconds + rSeconds + separatorSeconds + porchSeconds) * sampleRate);
    this.endSamples = Math.round((syncPorchSeconds + ySeconds + separatorSeconds + porchSeconds + rSeconds + separatorSeconds + porchSeconds + bSeconds) * sampleRate);

    this.lowPassFilter = new ExponentialMovingAverage();
  }

  /**
   * Convert normalized frequency (-1 to +1) to level (0 to 1)
   */
  private freqToLevel(frequency: number, offset: number): number {
    return 0.5 * (frequency - offset + 1.0);
  }

  /**
   * Convert YUV to RGB
   * For PD modes: Y is luminance (0-255), RY is R-Y difference, BY is B-Y difference
   * Uses ITU-R BT.601 color space conversion (same as Robot36)
   */
  private yuv2rgb(y: number, ry: number, by: number): { r: number; g: number; b: number } {
    // Use the same YUV to RGB conversion as Robot36
    // This handles studio range (16-235) correctly
    // V = R-Y (ry parameter)
    // U = B-Y (by parameter)
    
    const yAdj = y - 16;
    const uAdj = by - 128;  // B-Y
    const vAdj = ry - 128;  // R-Y

    const r = Math.max(0, Math.min(255, ((298 * yAdj + 409 * vAdj + 128) >> 8)));
    const g = Math.max(0, Math.min(255, ((298 * yAdj - 100 * uAdj - 208 * vAdj + 128) >> 8)));
    const b = Math.max(0, Math.min(255, ((298 * yAdj + 516 * uAdj + 128) >> 8)));

    return { r, g, b };
  }

  /**
   * Decode a single PD120 scan line
   * @param scanLineBuffer Demodulated frequency values for the entire line
   * @param syncPulseIndex Index where sync pulse starts
   * @param frequencyOffset Frequency calibration offset
   * @returns Decoded line data (single line for PD120)
   */
  decodeScanLine(
    scanLineBuffer: Float32Array,
    syncPulseIndex: number,
    frequencyOffset: number
  ): DecodedLine | null {
    // Check buffer bounds
    if (syncPulseIndex + this.endSamples > scanLineBuffer.length) {
      console.warn(`PD120: Buffer too short for full line decode`);
      return null;
    }

    // Apply bidirectional low-pass filter
    const scratchBuffer = new Float32Array(this.endSamples);

    // Configure filter for horizontal resolution
    // Use Y channel samples as the rate (same for all channels)
    this.lowPassFilter.cutoff(this.horizontalPixels, 2 * this.ySamples, 2);

    this.lowPassFilter.reset();

    // Forward pass - apply lowpass filtering
    for (let i = this.yBeginSamples; i < this.endSamples; i++) {
      scratchBuffer[i] = this.lowPassFilter.avg(scanLineBuffer[syncPulseIndex + i]);
    }

    // Backward pass
    this.lowPassFilter.reset();
    for (let i = this.endSamples - 1; i >= this.yBeginSamples; i--) {
      scratchBuffer[i] = this.freqToLevel(this.lowPassFilter.avg(scratchBuffer[i]), frequencyOffset);
    }

    // Decode pixels
    const pixels = new Uint8ClampedArray(this.horizontalPixels * 4);

    // Extract Y, R-Y, B-Y channels separately
    // Note: PD120 transmits color difference signals, not direct RGB
    const yChannel = new Float32Array(this.horizontalPixels);
    const ryChannel = new Float32Array(this.horizontalPixels);  // R-Y color difference
    const byChannel = new Float32Array(this.horizontalPixels);  // B-Y color difference

    // Sample each channel
    for (let i = 0; i < this.horizontalPixels; i++) {
      const yPos = this.yBeginSamples + Math.floor((i * this.ySamples) / this.horizontalPixels);
      const ryPos = this.rBeginSamples + Math.floor((i * this.rSamples) / this.horizontalPixels);
      const byPos = this.bBeginSamples + Math.floor((i * this.bSamples) / this.horizontalPixels);

      // Y channel: luminance (0-255)
      yChannel[i] = Math.max(0, Math.min(1, scratchBuffer[yPos])) * 255;
      
      // R-Y and B-Y channels: color differences (centered at 128)
      // These represent (R-Y) and (B-Y) difference signals, not direct R and B values
      ryChannel[i] = Math.max(0, Math.min(1, scratchBuffer[ryPos])) * 255;
      byChannel[i] = Math.max(0, Math.min(1, scratchBuffer[byPos])) * 255;
    }

    // Apply 5-pixel median filter to chroma channels for noise reduction
    const ryFiltered = new Float32Array(this.horizontalPixels);
    const byFiltered = new Float32Array(this.horizontalPixels);
    
    for (let i = 0; i < this.horizontalPixels; i++) {
      // Get 5 neighboring values (or edge values if near boundaries)
      const i1 = Math.max(0, i - 2);
      const i2 = Math.max(0, i - 1);
      const i3 = i;
      const i4 = Math.min(this.horizontalPixels - 1, i + 1);
      const i5 = Math.min(this.horizontalPixels - 1, i + 2);

      // Median filter for R-Y channel
      const ryValues = [ryChannel[i1], ryChannel[i2], ryChannel[i3], ryChannel[i4], ryChannel[i5]];
      ryValues.sort((a, b) => a - b);
      ryFiltered[i] = ryValues[2];

      // Median filter for B-Y channel
      const byValues = [byChannel[i1], byChannel[i2], byChannel[i3], byChannel[i4], byChannel[i5]];
      byValues.sort((a, b) => a - b);
      byFiltered[i] = byValues[2];
    }

    // Apply chroma desaturation to reduce color noise (70% intensity)
    const CHROMA_REDUCTION = 0.7;

    // Convert to RGB pixels
    for (let i = 0; i < this.horizontalPixels; i++) {
      // Reduce chroma saturation
      const ry = 128 + (ryFiltered[i] - 128) * CHROMA_REDUCTION;
      const by = 128 + (byFiltered[i] - 128) * CHROMA_REDUCTION;
      
      const rgb = this.yuv2rgb(yChannel[i], ry, by);
      
      pixels[i * 4] = rgb.r;
      pixels[i * 4 + 1] = rgb.g;
      pixels[i * 4 + 2] = rgb.b;
      pixels[i * 4 + 3] = 255;
    }

    // Debug: Log sample pixel values for first few pixels
    if (Math.random() < 0.1) {  // Log ~10% of lines
      const mid = Math.floor(this.horizontalPixels / 2);
      console.log(`PD120 Line: Y[${mid}]=${yChannel[mid].toFixed(1)}, RY[${mid}]=${ryChannel[mid].toFixed(1)}, BY[${mid}]=${byChannel[mid].toFixed(1)} → RGB=(${pixels[mid*4]},${pixels[mid*4+1]},${pixels[mid*4+2]})`);
      
      // Check channel ranges
      const yMin = Math.min(...yChannel);
      const yMax = Math.max(...yChannel);
      const ryMin = Math.min(...ryChannel);
      const ryMax = Math.max(...ryChannel);
      const byMin = Math.min(...byChannel);
      const byMax = Math.max(...byChannel);
      console.log(`  Channel ranges: Y[${yMin.toFixed(0)}-${yMax.toFixed(0)}], RY[${ryMin.toFixed(0)}-${ryMax.toFixed(0)}], BY[${byMin.toFixed(0)}-${byMax.toFixed(0)}]`);
    }

    return {
      pixels,
      width: this.horizontalPixels,
      height: 1, // PD120 is non-interlaced, always returns 1 line
      isOddLine: false,
    };
  }

  reset(): void {
    this.lowPassFilter.reset();
  }
}
