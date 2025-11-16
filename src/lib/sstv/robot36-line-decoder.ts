/**
 * Robot36 Line Decoder
 * Decodes a single Robot36 scan line using interlaced YUV format
 * Based on xdsopl/robot36 Robot_36_Color.java
 */

import { ExponentialMovingAverage } from './fm-demodulator';

export interface DecodedLine {
  pixels: Uint8ClampedArray; // RGBA pixel data
  width: number;
  height: number; // Will be 2 for interlaced (even and odd lines)
  isOddLine: boolean; // True if this completes an odd line (returns a line pair)
}

export class Robot36LineDecoder {
  private lowPassFilter: ExponentialMovingAverage;
  private lastEven: boolean = false;
  private evenLinePixels: Uint8ClampedArray; // Store even line for interlacing

  private readonly horizontalPixels = 320;
  private readonly verticalPixels = 240;
  private readonly samplesPerMs: number;
  private readonly luminanceSamples: number;
  private readonly separatorSamples: number;
  private readonly chrominanceSamples: number;
  private readonly luminanceBeginSamples: number;
  private readonly separatorBeginSamples: number;
  private readonly chrominanceBeginSamples: number;
  private readonly endSamples: number;

  constructor(sampleRate: number) {
    this.samplesPerMs = sampleRate / 1000;

    // Robot36 timing
    const syncPulseSeconds = 0.009;
    const syncPorchSeconds = 0.003;
    const luminanceSeconds = 0.088;
    const separatorSeconds = 0.0045;
    const porchSeconds = 0.0015;
    const chrominanceSeconds = 0.044;

    this.luminanceSamples = Math.round(luminanceSeconds * sampleRate);
    this.separatorSamples = Math.round(separatorSeconds * sampleRate);
    this.chrominanceSamples = Math.round(chrominanceSeconds * sampleRate);

    this.luminanceBeginSamples = Math.round(syncPorchSeconds * sampleRate);
    this.separatorBeginSamples = Math.round((syncPorchSeconds + luminanceSeconds) * sampleRate);
    this.chrominanceBeginSamples = Math.round((syncPorchSeconds + luminanceSeconds + separatorSeconds + porchSeconds) * sampleRate);
    this.endSamples = Math.round((syncPorchSeconds + luminanceSeconds + separatorSeconds + porchSeconds + chrominanceSeconds) * sampleRate);

    this.lowPassFilter = new ExponentialMovingAverage();
    this.evenLinePixels = new Uint8ClampedArray(this.horizontalPixels * 4);
  }

  /**
   * Convert normalized frequency (-1 to +1) to level (0 to 1)
   */
  private freqToLevel(frequency: number, offset: number): number {
    return 0.5 * (frequency - offset + 1.0);
  }

  /**
   * Convert YUV to RGB
   * U and V are color difference signals: U = B-Y, V = R-Y
   */
  private yuv2rgb(y: number, u: number, v: number): { r: number; g: number; b: number } {
    // YUV to RGB conversion (ITU-R BT.601)
    // Matches Java ColorConverter.YUV2RGB()
    const yAdj = y - 16;
    const uAdj = u - 128;
    const vAdj = v - 128;

    const r = Math.max(0, Math.min(255, ((298 * yAdj + 409 * vAdj + 128) >> 8)));
    const g = Math.max(0, Math.min(255, ((298 * yAdj - 100 * uAdj - 208 * vAdj + 128) >> 8)));
    const b = Math.max(0, Math.min(255, ((298 * yAdj + 516 * uAdj + 128) >> 8)));

    return { r, g, b };
  }

  /**
   * Decode a single Robot36 scan line
   * @param scanLineBuffer Demodulated frequency values for the entire line
   * @param syncPulseIndex Index where sync pulse starts
   * @param frequencyOffset Frequency calibration offset
   * @returns Decoded line data (may contain 2 lines for interlaced decoding)
   */
  decodeScanLine(
    scanLineBuffer: Float32Array,
    syncPulseIndex: number,
    frequencyOffset: number
  ): DecodedLine | null {
    // Check buffer bounds
    if (syncPulseIndex + this.endSamples > scanLineBuffer.length) {
      return null;
    }

    // Detect even/odd line by examining separator pulse frequency
    let separator = 0;
    for (let i = 0; i < this.separatorSamples; i++) {
      separator += scanLineBuffer[syncPulseIndex + this.separatorBeginSamples + i];
    }
    separator /= this.separatorSamples;
    separator -= frequencyOffset;

    // Separator frequency determines even (B-Y) vs odd (R-Y) line
    // Negative separator = even line (B-Y), Positive = odd line (R-Y)
    let even = separator < 0;

    // Validate separator frequency
    if (separator < -1.1 || (separator > -0.9 && separator < 0.9) || separator > 1.1) {
      even = !this.lastEven;
    }
    this.lastEven = even;

    // Apply bidirectional low-pass filter
    const scratchBuffer = new Float32Array(this.endSamples);

    // Configure filter for horizontal resolution
    this.lowPassFilter.cutoff(this.horizontalPixels, 2 * this.luminanceSamples, 2);

    // Debug: Check alpha value
    const alphaValue = (this.lowPassFilter as any).alpha;
    console.log(`🔧 LowPass alpha=${alphaValue.toFixed(6)}, freq=${this.horizontalPixels}, rate=${2 * this.luminanceSamples}`);

    // Debug: Check scanLineBuffer RAW values before filtering (10 samples from luminance region)
    const rawSamples = Array.from({length: 10}, (_, idx) => {
      const pos = syncPulseIndex + this.luminanceBeginSamples + Math.floor((idx * this.luminanceSamples) / 10);
      return scanLineBuffer[pos]?.toFixed(4) || 'undef';
    });
    console.log(`📡 RAW scanLineBuffer samples (10 points): ${rawSamples.join(', ')}`);

    this.lowPassFilter.reset();

    // Forward pass - apply lowpass filtering
    // FM demod output is already scaled correctly by FILTER_COMPENSATION in FrequencyModulation
    for (let i = this.luminanceBeginSamples; i < this.endSamples; i++) {
      scratchBuffer[i] = this.lowPassFilter.avg(scanLineBuffer[syncPulseIndex + i]);
    }

    // Backward pass
    this.lowPassFilter.reset();
    for (let i = this.endSamples - 1; i >= this.luminanceBeginSamples; i--) {
      scratchBuffer[i] = this.freqToLevel(this.lowPassFilter.avg(scratchBuffer[i]), frequencyOffset);
    }

    // Debug: Check scratchBuffer values after filtering
    const sampleValues = Array.from({length: 10}, (_, idx) => {
      const pos = this.luminanceBeginSamples + Math.floor((idx * this.luminanceSamples) / 10);
      return scratchBuffer[pos].toFixed(3);
    });
    console.log(`📊 ScratchBuffer samples (10 points): ${sampleValues.join(', ')}`);

    // Decode pixels
    const pixels = new Uint8ClampedArray(this.horizontalPixels * 4 * 2); // Allocate for 2 lines

    for (let i = 0; i < this.horizontalPixels; i++) {
      const luminancePos = this.luminanceBeginSamples + Math.floor((i * this.luminanceSamples) / this.horizontalPixels);
      const chrominancePos = this.chrominanceBeginSamples + Math.floor((i * this.chrominanceSamples) / this.horizontalPixels);

      const y = Math.round(scratchBuffer[luminancePos] * 255);
      // Chroma uses 1500Hz as center (128), not black (0)
      // Map 0.0→1.0 range to 0→255, then it represents deviation from center
      const chroma = Math.round(scratchBuffer[chrominancePos] * 255);

      if (even) {
        // Even line: Y + B-Y (store for interlacing)
        this.evenLinePixels[i * 4] = y;      // Store Y
        this.evenLinePixels[i * 4 + 1] = 0;  // U placeholder
        this.evenLinePixels[i * 4 + 2] = chroma; // Store B-Y
        this.evenLinePixels[i * 4 + 3] = 255;
      } else {
        // Odd line: Y + R-Y, combine with previous even line
        const evenY = this.evenLinePixels[i * 4];
        const evenBY = this.evenLinePixels[i * 4 + 2];
        const oddY = y;
        const oddRY = chroma;

        // Debug YUV values for first pixel
        if (i === 100) {
          console.log(`🎨 Pixel ${i} YUV values: evenY=${evenY}, oddY=${oddY}, B-Y=${evenBY}, R-Y=${oddRY}`);
        }

        // Convert even line: [Y_even, R-Y_odd, B-Y_even] → RGB
        // YUV2RGB expects (Y, U=B-Y, V=R-Y) per ITU-R BT.601
        const evenRGB = this.yuv2rgb(evenY, evenBY, oddRY);
        pixels[i * 4] = evenRGB.r;
        pixels[i * 4 + 1] = evenRGB.g;
        pixels[i * 4 + 2] = evenRGB.b;
        pixels[i * 4 + 3] = 255;

        // Convert odd line: [Y_odd, R-Y_odd, B-Y_even] → RGB
        const oddRGB = this.yuv2rgb(oddY, evenBY, oddRY);
        pixels[this.horizontalPixels * 4 + i * 4] = oddRGB.r;
        pixels[this.horizontalPixels * 4 + i * 4 + 1] = oddRGB.g;
        pixels[this.horizontalPixels * 4 + i * 4 + 2] = oddRGB.b;
        pixels[this.horizontalPixels * 4 + i * 4 + 3] = 255;
      }
    }

    return {
      pixels,
      width: this.horizontalPixels,
      height: even ? 0 : 2, // Return 2 lines only on odd lines
      isOddLine: !even,
    };
  }

  reset(): void {
    this.lastEven = false;
    this.evenLinePixels.fill(0);
    this.lowPassFilter.reset();
  }
}
