'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
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
  const drawSpectrum = useCallback((canvas: HTMLCanvasElement) => {
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
  }, [getAnalyser]);

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

  const handleSaveImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Create a download link
    canvas.toBlob((blob) => {
      if (!blob) return;
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      link.download = `sstv-decode-${selectedMode}-${timestamp}.png`;
      link.href = url;
      link.click();
      
      // Clean up
      URL.revokeObjectURL(url);
    }, 'image/png');
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
      case DecoderState.DECODING_IMAGE:
        return 'text-green-400';
      default:
        return 'text-gray-400';
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Controls */}
      <div className="bg-gray-900 rounded-lg p-4 sm:p-6 space-y-4">
        {/* Mode selector - full width on mobile */}
        <div className="w-full">
          <select
            value={selectedMode}
            onChange={(e) => handleModeChange(e.target.value as keyof typeof SSTV_MODES)}
            disabled={state.isRecording}
            className="w-full bg-gray-800 text-white px-4 py-3 rounded-md border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 text-base"
          >
            {Object.keys(SSTV_MODES).map((mode) => (
              <option key={mode} value={mode}>
                {SSTV_MODES[mode as keyof typeof SSTV_MODES].name}
              </option>
            ))}
          </select>
        </div>

        {/* Action buttons - full width on mobile, flex on larger screens */}
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          {!state.isRecording ? (
            <button
              onClick={handleStart}
              disabled={!state.isSupported}
              className="w-full sm:flex-1 bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold px-6 py-3 rounded-md transition-colors text-base"
            >
              Start Decoding
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="w-full sm:flex-1 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-semibold px-6 py-3 rounded-md transition-colors text-base"
            >
              Stop
            </button>
          )}

          <button
            onClick={handleReset}
            disabled={!state.isRecording}
            className="w-full sm:flex-1 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold px-6 py-3 rounded-md transition-colors text-base"
          >
            Reset
          </button>

          <button
            onClick={handleSaveImage}
            className="w-full sm:flex-1 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-semibold px-6 py-3 rounded-md transition-colors text-base flex items-center justify-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            Save Image
          </button>
        </div>

        {state.error && (
          <div className="bg-red-900/50 border border-red-700 rounded-md p-3 text-red-200 text-sm sm:text-base">
            {state.error}
          </div>
        )}

        {!state.isSupported && (
          <div className="bg-yellow-900/50 border border-yellow-700 rounded-md p-3 text-yellow-200 text-sm sm:text-base">
            Web Audio API is not supported in this browser
          </div>
        )}

        {/* Stats */}
        {state.stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 text-sm">
            <div className="bg-gray-800/50 rounded-lg p-3">
              <div className="text-gray-400 text-xs sm:text-sm mb-1">State</div>
              <div className={`font-mono font-semibold text-sm sm:text-base ${getStateColor()}`}>
                {state.stats.state}
              </div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3">
              <div className="text-gray-400 text-xs sm:text-sm mb-1">Mode</div>
              <div className="font-mono font-semibold text-sm sm:text-base truncate">{state.stats.mode}</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3">
              <div className="text-gray-400 text-xs sm:text-sm mb-1">Line</div>
              <div className="font-mono font-semibold text-sm sm:text-base">
                {state.stats.currentLine} / {state.stats.totalLines}
              </div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3">
              <div className="text-gray-400 text-xs sm:text-sm mb-1">Frequency</div>
              <div className="font-mono font-semibold text-sm sm:text-base">{state.stats.frequency} Hz</div>
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

      {/* Canvas Display - prioritize decoded image on mobile */}
      <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-6">
        {/* Decoded Image - main focus */}
        <div className="bg-gray-900 rounded-lg p-3 sm:p-4">
          <h2 className="text-lg sm:text-xl font-semibold mb-2 sm:mb-3">Decoded Image</h2>
          <canvas
            ref={canvasRef}
            width={640}
            height={480}
            className="w-full border border-gray-700 rounded bg-black touch-manipulation"
          />
        </div>

        {/* Audio Spectrum - collapsible on mobile */}
        <div className="bg-gray-900 rounded-lg p-3 sm:p-4">
          <h2 className="text-lg sm:text-xl font-semibold mb-2 sm:mb-3">Audio Spectrum</h2>
          <canvas
            ref={spectrumCanvasRef}
            width={640}
            height={480}
            className="w-full border border-gray-700 rounded bg-black touch-manipulation"
          />
        </div>
      </div>

      {/* Info - collapsible on mobile */}
      <details className="bg-gray-900 rounded-lg" open>
        <summary className="cursor-pointer p-4 sm:p-6 font-semibold text-lg sm:text-xl hover:bg-gray-800/50 rounded-lg transition-colors select-none">
          How to Use
        </summary>
        <div className="px-4 pb-4 sm:px-6 sm:pb-6">
          <ol className="list-decimal list-inside space-y-2 text-sm sm:text-base text-gray-300">
            <li>Select an SSTV mode (Robot36, Martin M1, or Scottie S1)</li>
            <li>Click &quot;Start Decoding&quot; to begin capturing audio from your microphone</li>
            <li>Play an SSTV signal (you can use a signal generator or recording)</li>
            <li>Watch as the image is decoded in real-time on the canvas</li>
            <li>Click &quot;Reset&quot; to clear the image and start over</li>
            <li>Click &quot;Stop&quot; when finished</li>
          </ol>
          <p className="mt-4 text-xs sm:text-sm text-gray-400">
            Note: For best results, ensure your audio source is clear and at an appropriate volume level.
            The decoder will automatically detect sync pulses and begin decoding.
          </p>
        </div>
      </details>
    </div>
  );
}
