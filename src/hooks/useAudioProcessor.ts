import { useEffect, useRef, useState } from 'react';
import { SSTVDecoder, DecoderStats } from '@/lib/sstv/decoder';
import { SSTV_MODES } from '@/lib/sstv/constants';

export interface AudioProcessorState {
  isRecording: boolean;
  isSupported: boolean;
  error: string | null;
  stats: DecoderStats | null;
}

export function useAudioProcessor(modeName: keyof typeof SSTV_MODES = 'ROBOT36') {
  const [state, setState] = useState<AudioProcessorState>({
    isRecording: false,
    isSupported: typeof window !== 'undefined' && 'AudioContext' in window,
    error: null,
    stats: null,
  });

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const decoderRef = useRef<SSTVDecoder | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);

  // Initialize decoder
  useEffect(() => {
    if (typeof window !== 'undefined') {
      decoderRef.current = new SSTVDecoder(modeName);
    }
  }, [modeName]);

  const startRecording = async () => {
    try {
      if (!state.isSupported) {
        throw new Error('Web Audio API not supported in this browser');
      }

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 44100,
        },
      });

      streamRef.current = stream;

      // Create audio context
      const audioContext = new AudioContext({ sampleRate: 44100 });
      audioContextRef.current = audioContext;

      // Create audio source from microphone
      const source = audioContext.createMediaStreamSource(stream);

      // Create analyser for visualization
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;

      // Create script processor for audio processing
      const bufferSize = 4096;
      const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
      processorNodeRef.current = processor;

      processor.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);
        
        // Process audio with SSTV decoder
        if (decoderRef.current) {
          decoderRef.current.processSamples(inputData);
          
          // Update stats
          const stats = decoderRef.current.getStats();
          setState(prev => ({ ...prev, stats }));
        }
      };

      // Connect audio nodes
      source.connect(analyser);
      analyser.connect(processor);
      processor.connect(audioContext.destination);

      // Start decoder
      if (decoderRef.current) {
        decoderRef.current.start();
      }

      setState(prev => ({
        ...prev,
        isRecording: true,
        error: null,
      }));

    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to access microphone';
      setState(prev => ({
        ...prev,
        error,
        isRecording: false,
      }));
    }
  };

  const stopRecording = () => {
    // Stop all tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Disconnect audio nodes
    if (processorNodeRef.current) {
      processorNodeRef.current.disconnect();
      processorNodeRef.current = null;
    }

    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Cancel animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Stop decoder
    if (decoderRef.current) {
      decoderRef.current.stop();
    }

    setState(prev => ({
      ...prev,
      isRecording: false,
      stats: null,
    }));
  };

  const resetDecoder = () => {
    if (decoderRef.current) {
      decoderRef.current.reset();
      if (state.isRecording) {
        decoderRef.current.start();
      }
    }
  };

  const getImageData = (): Uint8ClampedArray | null => {
    return decoderRef.current ? decoderRef.current.getImageData() : null;
  };

  const getDimensions = () => {
    return decoderRef.current
      ? decoderRef.current.getDimensions()
      : { width: 320, height: 240 };
  };

  const getAnalyser = (): AnalyserNode | null => {
    return analyserRef.current;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, []);

  return {
    state,
    startRecording,
    stopRecording,
    resetDecoder,
    getImageData,
    getDimensions,
    getAnalyser,
  };
}
