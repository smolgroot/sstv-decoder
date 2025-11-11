'use client';

import { useEffect, useRef, useState } from 'react';
import { useAudioProcessor } from '@/hooks/useAudioProcessor';
import { SSTV_MODES } from '@/lib/sstv/constants';
import { DecoderState } from '@/lib/sstv/decoder';

export default function SSTVDecoder() {
  const [selectedMode, setSelectedMode] = useState<keyof typeof SSTV_MODES>('ROBOT36');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spectrumCanvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  const {
    state,
    startRecording,
    stopRecording,
    resetDecoder,
    getImageData,
    getDimensions,
    getAnalyser,
  } = useAudioProcessor(selectedMode);

  // Draw spectrum visualization
  const drawSpectrum = (canvas: HTMLCanvasElement) => {
    const analyser = getAnalyser();
    if (!analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    ctx.fillStyle = 'rgb(10, 10, 10)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const barWidth = canvas.width / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const barHeight = (dataArray[i] / 255) * canvas.height;

      const hue = (i / bufferLength) * 120;
      ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
      ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

      x += barWidth;
    }
  };

  // Update canvas with decoded image
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dimensions = getDimensions();
    
    // Create an offscreen canvas that matches SSTV dimensions
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = dimensions.width;
    offscreenCanvas.height = dimensions.height;
    const offscreenCtx = offscreenCanvas.getContext('2d');
    
    if (!offscreenCtx) return;

    // Disable image smoothing for crisp pixels
    ctx.imageSmoothingEnabled = false;
    offscreenCtx.imageSmoothingEnabled = false;

    // Clear both canvases initially
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    offscreenCtx.fillStyle = 'black';
    offscreenCtx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);

    let lastRenderedLine = -1;

    const updateCanvas = () => {
      if (!state.isRecording) {
        animationFrameRef.current = requestAnimationFrame(updateCanvas);
        return;
      }

      const imageData = getImageData();
      const currentLine = state.stats?.currentLine ?? 0;

      // Always update to see the progressive image
      if (imageData && offscreenCtx) {
        // Debug: Check if we have any non-black pixels
        if (currentLine > lastRenderedLine && currentLine % 10 === 0) {
          let nonBlackPixels = 0;
          for (let i = 0; i < imageData.length; i += 4) {
            if (imageData[i] > 0 || imageData[i+1] > 0 || imageData[i+2] > 0) {
              nonBlackPixels++;
            }
          }
          console.log(`Line ${currentLine}: ${nonBlackPixels} non-black pixels in imageData`);
        }
        
        // Create ImageData from a copy of the decoder's buffer
        const imgData = new ImageData(
          new Uint8ClampedArray(imageData),
          dimensions.width,
          dimensions.height
        );
        
        // Put the complete image data on the offscreen canvas
        offscreenCtx.putImageData(imgData, 0, 0);
        
        // Draw to main canvas without clearing (preserve all previous lines)
        ctx.drawImage(offscreenCanvas, 0, 0, canvas.width, canvas.height);
        
        lastRenderedLine = currentLine;
      }

      // Draw spectrum
      const spectrumCanvas = spectrumCanvasRef.current;
      if (spectrumCanvas) {
        drawSpectrum(spectrumCanvas);
      }

      animationFrameRef.current = requestAnimationFrame(updateCanvas);
    };

    animationFrameRef.current = requestAnimationFrame(updateCanvas);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [state.isRecording, state.stats?.currentLine, getImageData, getDimensions, drawSpectrum, getAnalyser]);

  const handleStart = async () => {
    await startRecording();
  };

  const handleStop = () => {
    stopRecording();
  };

  const handleReset = () => {
    resetDecoder();
  };

  const handleModeChange = (mode: keyof typeof SSTV_MODES) => {
    const wasRecording = state.isRecording;
    if (wasRecording) {
      stopRecording();
    }
    setSelectedMode(mode);
    // Note: useAudioProcessor will recreate decoder with new mode
  };

  const getStateColor = () => {
    if (!state.stats) return 'text-gray-400';
    switch (state.stats.state) {
      case DecoderState.IDLE:
        return 'text-gray-400';
      case DecoderState.DETECTING_SYNC:
        return 'text-yellow-400';
      case DecoderState.DECODING_IMAGE:
        return 'text-green-400';
      default:
        return 'text-gray-400';
    }
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="bg-gray-900 rounded-lg p-6 space-y-4">
        <div className="flex items-center gap-4 flex-wrap">
          <select
            value={selectedMode}
            onChange={(e) => handleModeChange(e.target.value as keyof typeof SSTV_MODES)}
            disabled={state.isRecording}
            className="bg-gray-800 text-white px-4 py-2 rounded-md border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {Object.keys(SSTV_MODES).map((mode) => (
              <option key={mode} value={mode}>
                {SSTV_MODES[mode as keyof typeof SSTV_MODES].name}
              </option>
            ))}
          </select>

          {!state.isRecording ? (
            <button
              onClick={handleStart}
              disabled={!state.isSupported}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold px-6 py-2 rounded-md transition-colors"
            >
              Start Decoding
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-2 rounded-md transition-colors"
            >
              Stop
            </button>
          )}

          <button
            onClick={handleReset}
            disabled={!state.isRecording}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold px-6 py-2 rounded-md transition-colors"
          >
            Reset
          </button>
        </div>

        {state.error && (
          <div className="bg-red-900/50 border border-red-700 rounded-md p-3 text-red-200">
            {state.error}
          </div>
        )}

        {!state.isSupported && (
          <div className="bg-yellow-900/50 border border-yellow-700 rounded-md p-3 text-yellow-200">
            Web Audio API is not supported in this browser
          </div>
        )}

        {/* Stats */}
        {state.stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-gray-400">State</div>
              <div className={`font-mono font-semibold ${getStateColor()}`}>
                {state.stats.state}
              </div>
            </div>
            <div>
              <div className="text-gray-400">Mode</div>
              <div className="font-mono font-semibold">{state.stats.mode}</div>
            </div>
            <div>
              <div className="text-gray-400">Line</div>
              <div className="font-mono font-semibold">
                {state.stats.currentLine} / {state.stats.totalLines}
              </div>
            </div>
            <div>
              <div className="text-gray-400">Frequency</div>
              <div className="font-mono font-semibold">{state.stats.frequency} Hz</div>
            </div>
          </div>
        )}

        {/* Progress bar */}
        {state.stats && state.stats.progress > 0 && (
          <div className="w-full bg-gray-800 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${state.stats.progress}%` }}
            />
          </div>
        )}
      </div>

      {/* Canvas Display */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Decoded Image */}
        <div className="bg-gray-900 rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-3">Decoded Image</h2>
          <canvas
            ref={canvasRef}
            width={640}
            height={480}
            className="w-full border border-gray-700 rounded bg-black"
          />
        </div>

        {/* Audio Spectrum */}
        <div className="bg-gray-900 rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-3">Audio Spectrum</h2>
          <canvas
            ref={spectrumCanvasRef}
            width={640}
            height={480}
            className="w-full border border-gray-700 rounded bg-black"
          />
        </div>
      </div>

      {/* Info */}
      <div className="bg-gray-900 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-3">How to Use</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-300">
          <li>Select an SSTV mode (Robot36, Martin M1, or Scottie S1)</li>
          <li>Click &quot;Start Decoding&quot; to begin capturing audio from your microphone</li>
          <li>Play an SSTV signal (you can use a signal generator or recording)</li>
          <li>Watch as the image is decoded in real-time on the canvas</li>
          <li>Click &quot;Reset&quot; to clear the image and start over</li>
          <li>Click &quot;Stop&quot; when finished</li>
        </ol>
        <p className="mt-4 text-sm text-gray-400">
          Note: For best results, ensure your audio source is clear and at an appropriate volume level.
          The decoder will automatically detect sync pulses and begin decoding.
        </p>
      </div>
    </div>
  );
}
