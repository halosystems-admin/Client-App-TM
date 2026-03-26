import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Wand2, MessageCircle } from 'lucide-react';
import { transcribeToSOAP } from '../../services/api';

export type UniversalScribeVariant = 'floating' | 'recordDock';

interface Props {
  onTranscriptionComplete: (text: string) => void;
  onError?: (message: string) => void;
  customTemplate?: string;
  onRequestStartRecording?: (start: () => void) => void;
  /** Legacy floating layout: offset above compact bottom UI. */
  reserveBottomNav?: boolean;
  /** Floating only: extra action above the mic (not used when `recordDock`). */
  onOpenAskHalo?: () => void;
  /** `floating` = corner stack (desktop); `recordDock` = single teal control for bottom bar. */
  variant?: UniversalScribeVariant;
  /** Merged onto `recordDock` root only. */
  className?: string;
}

export const UniversalScribe: React.FC<Props> = ({
  onTranscriptionComplete,
  onError,
  customTemplate,
  onRequestStartRecording,
  reserveBottomNav,
  onOpenAskHalo,
  variant = 'floating',
  className = '',
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [longWait, setLongWait] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingMimeType = useRef<string>('audio/webm');

  useEffect(() => {
    if (!isProcessing) {
      setLongWait(false);
      return;
    }
    const id = setTimeout(() => setLongWait(true), 10_000);
    return () => clearTimeout(id);
  }, [isProcessing]);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current) {
        try {
          mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
        } catch {
          // Stream may already be stopped
        }
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
          ? 'audio/ogg;codecs=opus'
          : 'audio/webm';

      recordingMimeType.current = mimeType;

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        setIsProcessing(true);
        try {
          const audioBlob = new Blob(chunksRef.current, { type: recordingMimeType.current });

          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            try {
              const base64Data = (reader.result as string).split(',')[1];
              if (base64Data) {
                const soapNote = await transcribeToSOAP(base64Data, recordingMimeType.current, customTemplate);
                onTranscriptionComplete(soapNote);
              }
            } catch (err) {
              onError?.(`Transcription failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
            setIsProcessing(false);
          };
        } catch (err) {
          onError?.(`Audio processing failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
          setIsProcessing(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      onError?.('Could not access microphone. Please check your browser permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  const micClick = () => {
    if (isRecording || isProcessing) {
      if (isRecording) stopRecording();
      return;
    }
    if (onRequestStartRecording && !isRecording) {
      onRequestStartRecording(startRecording);
    } else {
      startRecording();
    }
  };

  /** Matches nav pill: `p-1.5` + `flex-1` button so total height aligns with tab bar. */
  const dockButtonBase =
    'flex min-h-[3.25rem] w-full min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[1.05rem] px-1.5 py-1 text-[10px] font-semibold tracking-tight transition-all duration-200 sm:text-[11px] focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/60 focus-visible:ring-offset-2 active:scale-[0.97] disabled:cursor-not-allowed';

  if (variant === 'recordDock') {
    return (
      <div
        className={`flex h-full min-h-0 w-[5.25rem] shrink-0 flex-col gap-1.5 p-1.5 sm:w-[5.5rem] ${className}`.trim()}
        role="group"
        aria-label="Voice capture"
      >
        {(isRecording || isProcessing) && (
          <div className="flex shrink-0 flex-col items-center gap-1 px-0.5">
            {isRecording && (
              <div className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-200/90 bg-white/95 px-2 py-1 shadow-sm">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]" />
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-600">Rec</span>
              </div>
            )}
            {isProcessing && (
              <div className="flex w-full flex-col items-center gap-0.5 rounded-lg border border-teal-200/90 bg-white/95 px-2 py-1 shadow-sm">
                <div className="flex items-center gap-1.5">
                  <Wand2 className="h-3 w-3 animate-spin text-teal-600" />
                  <span className="text-[9px] font-bold uppercase tracking-wider text-teal-800">Scribe</span>
                </div>
                {longWait && (
                  <span className="text-[8px] leading-tight text-slate-500">15–60s…</span>
                )}
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={micClick}
          disabled={isProcessing}
          title={isRecording ? 'Stop recording' : isProcessing ? 'Processing...' : 'Launch Scribe'}
          className={`${dockButtonBase} text-white shadow-md ${
            isRecording
              ? 'bg-red-500 shadow-red-500/30 ring-2 ring-white/40'
              : isProcessing
                ? 'bg-slate-300 text-slate-500 shadow-none ring-0'
                : 'bg-teal-600 shadow-teal-600/35 hover:bg-teal-700'
          }`}
        >
          {isProcessing ? (
            <Wand2 className="h-[1.35rem] w-[1.35rem] animate-spin sm:h-6 sm:w-6" aria-hidden />
          ) : isRecording ? (
            <Square className="h-[1.2rem] w-[1.2rem] fill-current sm:h-5 sm:w-5" aria-hidden />
          ) : (
            <Mic className="h-[1.35rem] w-[1.35rem] sm:h-6 sm:w-6" strokeWidth={2.25} aria-hidden />
          )}
          <span className="truncate">{isRecording ? 'Stop' : isProcessing ? 'Wait' : 'Record'}</span>
        </button>
      </div>
    );
  }

  const stackStyle: React.CSSProperties = {
    bottom: reserveBottomNav
      ? 'calc(1rem + var(--halo-bottom-nav-height, 5.75rem) + env(safe-area-inset-bottom, 0px))'
      : 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
    right: 'calc(1.5rem + env(safe-area-inset-right, 0px))',
  };

  return (
    <div className="pointer-events-none fixed z-50 flex flex-col items-end gap-2" style={stackStyle}>
      {isRecording && (
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-red-200 bg-white px-3 py-1.5 shadow-lg">
          <div className="h-2 w-2 animate-pulse rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Recording</span>
        </div>
      )}

      {isProcessing && (
        <div className="pointer-events-auto flex flex-col items-end gap-1 rounded-full border border-teal-200 bg-white px-3 py-1.5 shadow-lg">
          <div className="flex items-center gap-2">
            <Wand2 className="h-3.5 w-3.5 animate-spin text-teal-500" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-teal-700">Scribing...</span>
          </div>
          {longWait && (
            <span className="text-[9px] text-slate-500">This may take 15–60 seconds.</span>
          )}
        </div>
      )}

      {onOpenAskHalo && (
        <button
          type="button"
          onClick={onOpenAskHalo}
          title="Ask HALO"
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-teal-600 shadow-md transition hover:bg-teal-50"
        >
          <MessageCircle className="h-5 w-5" />
        </button>
      )}

      <button
        type="button"
        onClick={micClick}
        disabled={isProcessing}
        title={isRecording ? 'Stop recording' : isProcessing ? 'Processing...' : 'Launch Scribe'}
        className={`pointer-events-auto flex items-center justify-center rounded-full shadow-lg transition-all duration-200 ${
          isRecording
            ? 'h-12 w-12 animate-pulse bg-red-500 text-white ring-4 ring-red-200 hover:bg-red-600'
            : isProcessing
              ? 'h-12 w-12 cursor-not-allowed bg-slate-200 text-slate-400'
              : 'h-12 w-12 bg-teal-600 text-white hover:scale-110 hover:bg-teal-700 hover:shadow-xl active:scale-95'
        }`}
      >
        {isProcessing ? (
          <Wand2 className="h-5 w-5 animate-spin" />
        ) : isRecording ? (
          <Square className="h-4.5 w-4.5 fill-current" />
        ) : (
          <Mic className="h-5 w-5" />
        )}
      </button>
    </div>
  );
};
