import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Send, Volume2, X } from 'lucide-react';
import type { CoinMonumentNode } from '../../shared/coinMap3dLayout';

interface VoiceAssistantPanelProps {
  selectedNode: CoinMonumentNode | null;
  onClose: () => void;
}

interface TranscriptEntry {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
}

function float32ToPcm16Base64(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function pcm16Base64ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const out = new Float32Array(Math.floor(bytes.length / 2));
  for (let i = 0; i < out.length; i++) {
    out[i] = view.getInt16(i * 2, true) / 0x8000;
  }
  return out;
}

export const VoiceAssistantPanel: React.FC<VoiceAssistantPanelProps> = ({
  selectedNode,
  onClose,
}) => {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'ready' | 'error'>('disconnected');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [micActive, setMicActive] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([
    {
      id: 'init',
      role: 'system',
      text: 'Connect to speak live with MULTITRADE AI (Gemini 3.8 Live) about today’s top coins on the 3D map.',
    },
  ]);

  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const micActiveRef = useRef<boolean>(false);

  micActiveRef.current = micActive;

  const stopOutputPlayback = () => {
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
      } catch {
        // ignore already stopped source
      }
    }
    activeSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  };

  const stopMicCapture = () => {
    setMicActive(false);
    micActiveRef.current = false;
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {
        // ignore
      }
      processorRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (inputCtxRef.current) {
      inputCtxRef.current.close().catch(() => {});
      inputCtxRef.current = null;
    }
  };

  const disconnectSession = () => {
    stopMicCapture();
    stopOutputPlayback();
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }
    if (outputCtxRef.current) {
      outputCtxRef.current.close().catch(() => {});
      outputCtxRef.current = null;
    }
    setStatus('disconnected');
  };

  useEffect(() => {
    return () => {
      disconnectSession();
    };
  }, []);

  const appendTranscript = (role: TranscriptEntry['role'], text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setTranscripts((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === role && role !== 'system') {
        return [
          ...prev.slice(0, -1),
          { ...last, text: `${last.text} ${clean}`.trim() },
        ];
      }
      return [...prev.slice(-18), { id: `${Date.now()}-${Math.random()}`, role, text: clean }];
    });
  };

  const playPcm24Chunk = (base64: string) => {
    if (!outputCtxRef.current) {
      outputCtxRef.current = new AudioContext({ sampleRate: 24000 });
    }
    const ctx = outputCtxRef.current;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const samples = pcm16Base64ToFloat32(base64);
    if (samples.length === 0) return;

    const buffer = ctx.createBuffer(1, samples.length, 24000);
    buffer.getChannelData(0).set(samples);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);

    const now = ctx.currentTime;
    if (nextStartTimeRef.current < now) {
      nextStartTimeRef.current = now + 0.02;
    }
    const startAt = nextStartTimeRef.current;
    nextStartTimeRef.current = startAt + buffer.duration;

    activeSourcesRef.current.add(src);
    src.onended = () => {
      activeSourcesRef.current.delete(src);
    };
    src.start(startAt);
  };

  const connectVoice = () => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    setStatus('connecting');
    setErrorMsg('');

    if (!outputCtxRef.current) {
      outputCtxRef.current = new AudioContext({ sampleRate: 24000 });
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws/voice`);
    wsRef.current = ws;

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data) as {
          type?: string;
          data?: string;
          text?: string;
          message?: string;
        };
        if (msg.type === 'ready') {
          setStatus('ready');
          appendTranscript(
            'system',
            selectedNode
              ? `Live Voice ready (focused on $${selectedNode.symbol}). Enable Mic or send a question.`
              : 'Live Voice ready. Enable Mic or type a question about today’s top coins.'
          );
        } else if (msg.type === 'audio' && msg.data) {
          playPcm24Chunk(msg.data);
        } else if (msg.type === 'inputTranscript' && msg.text) {
          appendTranscript('user', msg.text);
        } else if (msg.type === 'outputTranscript' && msg.text) {
          appendTranscript('assistant', msg.text);
        } else if (msg.type === 'interrupted') {
          stopOutputPlayback();
        } else if (msg.type === 'error') {
          setStatus('error');
          setErrorMsg(msg.message || 'Voice session error.');
          appendTranscript('system', msg.message || 'Voice session error.');
        } else if (msg.type === 'closed') {
          setStatus('disconnected');
        }
      } catch {
        // ignore malformed message
      }
    };

    ws.onerror = () => {
      setStatus('error');
      setErrorMsg('WebSocket connection to Live Voice failed.');
    };

    ws.onclose = () => {
      stopMicCapture();
      setStatus((prev) => (prev === 'error' ? 'error' : 'disconnected'));
    };
  };

  const toggleMic = async () => {
    if (micActiveRef.current) {
      stopMicCapture();
      return;
    }

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      connectVoice();
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      mediaStreamRef.current = stream;
      const inputCtx = new AudioContext({ sampleRate: 16000 });
      inputCtxRef.current = inputCtx;
      const source = inputCtx.createMediaStreamSource(stream);
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (!micActiveRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          return;
        }
        const float32 = e.inputBuffer.getChannelData(0);
        const base64 = float32ToPcm16Base64(float32);
        wsRef.current.send(JSON.stringify({ type: 'audio', audio: base64 }));
      };

      source.connect(processor);
      processor.connect(inputCtx.destination);
      setMicActive(true);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Microphone access was denied. You can still type questions below.');
    }
  };

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    const q = textInput.trim();
    if (!q) return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setErrorMsg('Start Live Voice session first before sending a prompt.');
      return;
    }
    const contextualPrompt = selectedNode
      ? `[Currently focused on #${selectedNode.rank} ${selectedNode.symbol} ($${selectedNode.token.priceUsd.toPrecision(
          4
        )}, 1h ${selectedNode.momentum1h.toFixed(1)}%)] ${q}`
      : q;
    wsRef.current.send(JSON.stringify({ type: 'text', text: contextualPrompt }));
    appendTranscript('user', q);
    setTextInput('');
  };

  return (
    <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-[#0A0F1C]/95 p-4 shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <Volume2 className="h-4 w-4 text-blue-400" />
          <div>
            <div className="text-xs font-bold text-white">Live Voice Market Desk</div>
            <div className="font-mono text-[10px] text-slate-400">
              {status === 'ready'
                ? 'Gemini 3.8 Live · Connected'
                : status === 'connecting'
                ? 'Connecting audio stream...'
                : status === 'error'
                ? 'Connection unavailable'
                : 'Ready to connect'}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            disconnectSession();
            onClose();
          }}
          aria-label="Close voice desk"
          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {errorMsg && (
        <div className="mt-2 rounded border border-rose-500/40 bg-rose-950/50 px-2.5 py-1.5 text-[11px] text-rose-200">
          {errorMsg}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        {status !== 'ready' ? (
          <button
            type="button"
            onClick={connectVoice}
            disabled={status === 'connecting'}
            className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {status === 'connecting' ? 'Connecting...' : 'Start Live Voice'}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={toggleMic}
              className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${
                micActive
                  ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                  : 'border border-slate-700 bg-[#0D1322] text-slate-200 hover:border-blue-500'
              }`}
            >
              {micActive ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
              {micActive ? 'Mic Live (Mute)' : 'Enable Microphone'}
            </button>
            <button
              type="button"
              onClick={disconnectSession}
              className="rounded-lg border border-slate-700 bg-[#0D1322] px-3 py-2 text-xs text-slate-300 hover:border-rose-500/50 hover:text-rose-300"
            >
              End
            </button>
          </>
        )}
      </div>

      <div className="mt-3 max-h-44 space-y-2 overflow-y-auto rounded-lg border border-slate-800/80 bg-[#070B14] p-2.5 text-[11px]">
        {transcripts.map((entry) => (
          <div
            key={entry.id}
            className={
              entry.role === 'user'
                ? 'text-blue-300'
                : entry.role === 'assistant'
                ? 'text-slate-100'
                : 'text-slate-400 italic'
            }
          >
            {entry.role !== 'system' && (
              <span className="mr-1.5 font-mono text-[10px] uppercase text-slate-500">
                {entry.role === 'user' ? 'You:' : 'AI:'}
              </span>
            )}
            <span>{entry.text}</span>
          </div>
        ))}
      </div>

      <form onSubmit={handleSendText} className="mt-2.5 flex gap-1.5">
        <input
          type="text"
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          placeholder="Ask about top coins..."
          className="flex-1 rounded-lg border border-slate-700 bg-[#070B14] px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
        />
        <button
          type="submit"
          aria-label="Send voice text prompt"
          className="rounded-lg border border-slate-700 bg-[#0D1322] px-2.5 py-1.5 text-slate-200 hover:border-blue-500 hover:text-white"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
};
