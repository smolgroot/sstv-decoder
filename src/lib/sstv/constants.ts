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
    scanTime: 150, // Total: sync(9) + porch(3) + Y(88) + sep(4.5) + RY(44) + sep(1.5) + BY(44) = 194ms
                   // Spec says 150ms, but actual is ~194ms. Using spec value for line sync.
    syncPulse: 9,
    syncPorch: 3,
    porchFreq: 1500,
    separatorPulse: 4.5, // Default
    separatorPulses: [4.5, 1.5], // After Y: 4.5ms, After RY: 1.5ms
    colorScanTime: 88, // Default (for Y channel)
    colorScanTimes: [88, 44, 44], // Y=88ms (full resolution), R-Y=44ms, B-Y=44ms
    colorOrder: ['G', 'R', 'B'], // Y mapped to G, R-Y to R, B-Y to B (approximation)
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
