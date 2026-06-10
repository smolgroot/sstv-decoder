export type FTMode = 'FT8' | 'FT4' | 'FT2';

export interface FTMessage {
  freq: number;
  dt: number;
  snr: number;
  msg: string;
  sync: number;
}

export interface FTDecodeResult {
  windowStart: Date;
  mode: FTMode;
  messages: FTMessage[];
  decodeMs: number;
}

export const FT_WINDOW_SECONDS: Record<FTMode, number> = {
  FT8: 15,
  FT4: 7.5,
  FT2: 3.75,
};

export const FT_SUPPORTED: Record<FTMode, boolean> = {
  FT8: true,
  FT4: true,
  FT2: false,
};

// Shared callbook persists across windows to resolve hashed callsigns
let sharedBookPromise: Promise<import('@e04/ft8ts').HashCallBook> | null = null;

function getSharedBook() {
  if (!sharedBookPromise) {
    sharedBookPromise = import('@e04/ft8ts').then(({ HashCallBook }) => new HashCallBook());
  }
  return sharedBookPromise;
}

export async function decodeFTAudio(
  samples: Float32Array,
  sampleRate: number,
  mode: FTMode,
): Promise<FTMessage[]> {
  if (!FT_SUPPORTED[mode]) return [];

  const [{ decodeFT8, decodeFT4 }, book] = await Promise.all([
    import('@e04/ft8ts'),
    getSharedBook(),
  ]);

  const options = { sampleRate, hashCallBook: book };
  const results = mode === 'FT8'
    ? decodeFT8(samples, options)
    : decodeFT4(samples, options);

  return results.map(r => ({
    freq: r.freq,
    dt: r.dt,
    snr: r.snr,
    msg: r.msg,
    sync: r.sync,
  }));
}
