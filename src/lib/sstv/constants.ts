// SSTV Mode Specifications
export interface SSTVMode {
  name: string;
  visCode: number;
  width: number;
  height: number;
  scanTime: number; // milliseconds per line
  syncPulse: number; // milliseconds
  syncPorch: number; // milliseconds
  porchFreq: number; // Hz
  separatorPulse: number; // milliseconds
  colorScanTime: number; // milliseconds per color component
  colorOrder: ('R' | 'G' | 'B')[];
}

// Common SSTV modes
export const SSTV_MODES: { [key: string]: SSTVMode } = {
  ROBOT36: {
    name: 'Robot 36',
    visCode: 8,
    width: 320,
    height: 240,
    scanTime: 150, // Total: sync(9) + porch(3) + Y(88) + separator(4.5) + chroma(44)
    syncPulse: 9,
    syncPorch: 3,
    porchFreq: 1500,
    separatorPulse: 4.5,
    colorScanTime: 44, // Y=88ms for full width, chroma=44ms for half resolution
    colorOrder: ['R', 'G', 'B'], // Simplified RGB sequential for easier decoding
  },
  MARTIN_M1: {
    name: 'Martin M1',
    visCode: 44,
    width: 320,
    height: 256,
    scanTime: 446.446, // Total: sync(4.862) + porch(0.572) + G(146.432) + B(146.432) + R(146.432) + 2*sep(0.572)
    syncPulse: 4.862,
    syncPorch: 0.572,
    porchFreq: 1500,
    separatorPulse: 0.572,
    colorScanTime: 146.432,
    colorOrder: ['G', 'B', 'R'],
  },
  SCOTTIE_S1: {
    name: 'Scottie S1',
    visCode: 60,
    width: 320,
    height: 256,
    scanTime: 428.22, // Total: sync(9) + porch(1.5) + G(138.24) + sep(1.5) + B(138.24) + R(138.24) + sep(1.5)
    syncPulse: 9,
    syncPorch: 1.5,
    porchFreq: 1500,
    separatorPulse: 1.5,
    colorScanTime: 138.24,
    colorOrder: ['G', 'B', 'R'],
  },
};

// Frequency constants
export const FREQ_SYNC = 1200; // Hz - sync pulse
export const FREQ_BLACK = 1500; // Hz - black level
export const FREQ_WHITE = 2300; // Hz - white level
export const FREQ_VIS_BIT1 = 1100; // Hz - VIS bit 1
export const FREQ_VIS_BIT0 = 1300; // Hz - VIS bit 0
export const FREQ_VIS_START = 1900; // Hz - VIS start bit
export const FREQ_VIS_STOP = 1200; // Hz - VIS stop bit

export const SAMPLE_RATE = 44100; // Standard audio sample rate
