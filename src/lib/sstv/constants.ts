// SSTV Mode Specifications
export interface SSTVMode {
  readonly name: string;
  readonly visCode: number;
  readonly width: number;
  readonly height: number;
  readonly scanTime: number; // milliseconds per line
  readonly syncPulse: number; // milliseconds
  readonly syncPorch: number; // milliseconds
  readonly porchFreq: number; // Hz
  readonly separatorPulse: number; // milliseconds (default separator)
  readonly separatorPulses?: readonly number[]; // Optional: different separator after each channel (for Robot36)
  readonly colorScanTime: number; // milliseconds per color component (for uniform modes)
  readonly colorScanTimes?: readonly number[]; // Optional: different scan time per channel (for Robot36)
  readonly colorOrder: readonly ('R' | 'G' | 'B')[];
}

// Robot36 SSTV mode only
export const SSTV_MODES = {
  ROBOT36: {
    name: 'Robot 36',
    visCode: 8,
    width: 320,
    height: 240,
    // Actual line: sync(9) + syncPorch(3) + Y(88) + separator(4.5) + porch(1.5) + chrominance(44) = 150ms
    scanTime: 150,
    syncPulse: 9,
    syncPorch: 3,
    porchFreq: 1500,
    separatorPulse: 4.5,
    separatorPulses: [4.5], // Only one separator after Y
    colorScanTime: 88,
    colorScanTimes: [88, 44], // Y=88ms, then ONE chrominance channel=44ms (alternates R-Y/B-Y)
    colorOrder: ['G', 'R', 'B'], // Not used for Robot36 (it's interlaced)
  },
} as const;

// Frequency constants
export const FREQ_SYNC = 1200; // Hz - sync pulse
export const FREQ_BLACK = 1500; // Hz - black level
export const FREQ_WHITE = 2300; // Hz - white level
export const FREQ_VIS_BIT1 = 1100; // Hz - VIS bit 1
export const FREQ_VIS_BIT0 = 1300; // Hz - VIS bit 0
export const FREQ_VIS_START = 1900; // Hz - VIS start bit
export const FREQ_VIS_STOP = 1200; // Hz - VIS stop bit

export const SAMPLE_RATE = 44100; // Standard audio sample rate
