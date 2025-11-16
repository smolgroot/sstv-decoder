# SSTV Decoder Architecture

## New Architecture (Sync-Based Line Processing)

### Overview
Complete rewrite implementing proper Robot36 decoding with FM demodulation and sync pulse detection, based on the official xdsopl/robot36 Android app.

### Key Changes from Old Architecture

#### OLD APPROACH (Problems):
- ❌ **No sync detection** - Assumed perfect 150ms line timing
- ❌ **Sample-by-sample processing** - Decoded pixels continuously without line boundaries
- ❌ **Goertzel frequency detection** - Only detected discrete frequencies
- ❌ **No filtering** - Raw frequency values used directly
- ❌ **Wrong YUV handling** - Direct frequency-to-RGB conversion without proper interlacing

**Result**: White/grey incoherent strips, no recognizable images

#### NEW APPROACH (Proper Implementation):
- ✅ **Sync pulse detection** - Detects 9ms pulses at 1200Hz to find actual line boundaries
- ✅ **Line-based processing** - Buffers audio and decodes complete lines after sync detection
- ✅ **FM demodulation** - Converts audio to baseband complex signal, extracts instantaneous frequency
- ✅ **Bidirectional filtering** - Forward and backward exponential moving average smooths pixels
- ✅ **Proper interlacing** - Even lines store B-Y, odd lines combine with R-Y to output 2 RGB lines

### Module Structure

```
src/lib/sstv/
├── fm-demodulator.ts      # DSP building blocks
│   ├── Complex            # Complex number math (multiply, conjugate, argument)
│   ├── Phasor             # Oscillator for baseband conversion
│   ├── FrequencyModulation # FM demod: arg(sample × conj(prev)) / π
│   ├── SimpleMovingAverage # Circular buffer averaging
│   ├── SchmittTrigger     # Dual-threshold state machine
│   ├── Delay              # Sample delay buffer
│   └── ExponentialMovingAverage # Configurable EMA for bidirectional filtering
│
├── sync-detector.ts       # Sync pulse detection
│   └── SyncDetector       # Detects 1200Hz sync pulses (5ms/9ms/20ms)
│       ├── Converts to complex baseband (Phasor at -1900Hz)
│       ├── FM demodulates baseband signal
│       ├── Filters with moving average
│       ├── Schmitt trigger detects sync threshold
│       └── Returns pulse width + frequency calibration
│
├── robot36-line-decoder.ts # Line decoding
│   └── Robot36LineDecoder
│       ├── Timing: sync(9ms) + syncPorch(3ms) + Y(88ms) + sep(4.5ms) + porch(1.5ms) + chroma(44ms)
│       ├── Separator frequency determines even (B-Y) vs odd (R-Y)
│       ├── Bidirectional filtering: forward pass then backward pass
│       ├── Even lines: Store Y + B-Y for interlacing
│       ├── Odd lines: Combine with stored even line → Output 2 RGB lines
│       └── YUV→RGB: ITU-R BT.601 formula
│
└── decoder.ts             # Main decoder (NEW)
    └── SSTVDecoder
        ├── Buffers 7 seconds of audio (circular buffer)
        ├── Searches recent samples for sync pulses
        ├── When sync detected, decodes line between syncs
        ├── Copies decoded RGB pixels to image data
        └── Handles interlacing: even lines prepare, odd lines output 2 lines
```

### Processing Flow

```
1. AUDIO INPUT (44.1kHz samples)
   ↓
2. CIRCULAR BUFFER (7 seconds)
   ↓
3. SYNC DETECTION (SyncDetector.process)
   ├── Convert to complex baseband (multiply by Phasor at -1900Hz)
   ├── FM demodulate: frequency = arg(sample × conj(prev)) / π
   ├── Moving average filter
   ├── Schmitt trigger: detect when freq drops below threshold
   └── Classify pulse width: 5ms (half line), 9ms (full line), 20ms (VIS)
   ↓
4. LINE EXTRACTION
   ├── Extract samples between consecutive sync pulses
   └── Pass to line decoder
   ↓
5. LINE DECODING (Robot36LineDecoder.decodeScanLine)
   ├── Detect even/odd by separator frequency
   ├── Apply bidirectional exponential moving average
   ├── Extract luminance pixels (88ms @ 320 pixels)
   ├── Extract chrominance pixels (44ms @ 320 pixels)
   ├── Even line: Store Y + B-Y
   ├── Odd line: Combine Y+R-Y with stored Y+B-Y → 2 RGB lines
   └── Return decoded pixels
   ↓
6. IMAGE UPDATE
   └── Copy RGB pixels to canvas imageData
```

### Robot36 Format Specifications

**Image**: 320×240, interlaced
**Line time**: ~150ms total
**Sample rate**: 44100 Hz

**Frequencies**:
- Sync: 1200 Hz
- Black: 1500 Hz
- White: 2300 Hz
- Center: 1900 Hz

**Line Structure**:
```
|--9ms--|--3ms--|--------88ms--------|--4.5ms--|1.5ms|-------44ms-------|
  Sync   S.Porch   Luminance (Y)      Separator Porch  Chrominance
                    (320 pixels)                        (R-Y or B-Y)
```

**Interlacing**:
- **Even lines**: Y + B-Y chrominance (separator < 0)
- **Odd lines**: Y + R-Y chrominance (separator > 0)
- Both Y values from consecutive lines combined with B-Y and R-Y → 2 RGB output lines

**Filtering**:
- Horizontal: Bidirectional exponential moving average
- Configuration: cutoff(320 pixels, 2×luminanceSamples, 2)
- Forward pass: luminanceBegin → end
- Backward pass: end → luminanceBegin

### Key Algorithms

#### FM Demodulation
```typescript
// Convert audio to complex baseband
const baseband = sample.multiply(oscillator.nextComplex());

// Instantaneous frequency from phase difference
const frequency = baseband.multiply(prevSample.conjugate()).argument() / Math.PI;
```

#### Sync Detection
```typescript
// Schmitt trigger with hysteresis
if (value < lowThreshold) state = false;
if (value > highThreshold) state = true;

// Classify pulse width
const pulseWidthMs = (pulseLength / sampleRate) * 1000;
if (pulseWidthMs < 7) return SyncPulseWidth.FiveMilliSeconds;
if (pulseWidthMs < 15) return SyncPulseWidth.NineMilliSeconds;
return SyncPulseWidth.TwentyMilliSeconds;
```

#### Bidirectional Filtering
```typescript
// Forward pass
for (let i = start; i < end; i++) {
  buffer[i] = ema.avg(input[i]);
}

// Backward pass
ema.reset();
for (let i = end - 1; i >= start; i--) {
  buffer[i] = ema.avg(buffer[i]);
}
```

#### YUV to RGB (ITU-R BT.601)
```typescript
const yScaled = (y - 16) * 298;
const uScaled = u - 128;
const vScaled = v - 128;

r = (yScaled + 409 * vScaled + 128) >> 8;
g = (yScaled - 100 * uScaled - 208 * vScaled + 128) >> 8;
b = (yScaled + 516 * uScaled + 128) >> 8;
```

### Testing Plan

1. **Sync Detection Test**: Verify 1200Hz sync pulses are detected
2. **Timing Test**: Confirm 150ms line spacing
3. **Frequency Calibration**: Check frequency offset correction
4. **Interlacing Test**: Verify even/odd line pairing
5. **Color Test**: Confirm YUV→RGB conversion produces correct colors

### Known Limitations

- No VIS code detection (assumes Robot36)
- No Martin M1 or Scottie S1 modes
- 7-second buffer limit
- No automatic gain control (AGC)
- No noise reduction beyond EMA filtering

### References

- Official implementation: `./robot36/app/src/main/java/xdsopl/robot36/`
- Key files:
  - `Demodulator.java` - Sync detection and FM demod
  - `Robot_36_Color.java` - Line decoding and interlacing
  - `ComplexMath.java` - Complex number operations

## Comparison: Before vs After

| Aspect | Old Decoder | New Decoder |
|--------|-------------|-------------|
| Sync Detection | ❌ None | ✅ 1200Hz pulse detection |
| Processing Model | Sample-by-sample | Line-based after sync |
| Frequency Detection | Goertzel (discrete) | FM demod (continuous) |
| Filtering | None | Bidirectional EMA |
| Interlacing | ❌ Wrong | ✅ Proper even/odd pairing |
| Line Boundaries | ❌ Assumed 150ms | ✅ Detected from sync |
| Buffer | None | 7-second circular buffer |
| Result | White/grey strips | Should show proper images |
