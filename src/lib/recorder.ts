import { useCallback, useEffect, useRef, useState } from 'react';

/** Picks an audio format this browser can record that Whisper can read. */
function pickMime(): string {
  const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  if (typeof MediaRecorder === 'undefined') return '';
  return options.find((m) => MediaRecorder.isTypeSupported(m)) || '';
}

export function recordingSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('Couldn’t read the recording.'));
    r.readAsDataURL(blob);
  });
}

export type Recording = { blob: Blob; mime: string; seconds: number };

/**
 * Records the microphone at a low bitrate (about 0.25 MB a minute) and reports a live input level,
 * so members can see the mic is picking them up. Every recording is transcribed by Whisper.
 */
export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState('');
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const raf = useRef(0);
  const startedAt = useRef(0);

  const cleanup = useCallback(() => {
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    audioCtx.current?.close().catch(() => {});
    audioCtx.current = null;
    setLevel(0);
  }, []);

  useEffect(() => () => { try { rec.current?.stop(); } catch { /* ignore */ } cleanup(); }, [cleanup]);

  const start = useCallback(async (): Promise<boolean> => {
    setError('');
    if (!recordingSupported()) { setError('This browser can’t record audio. Use Chrome, or type your script instead.'); return false; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      stream.current = s;
      const mime = pickMime();
      const r = new MediaRecorder(s, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : { audioBitsPerSecond: 32000 });
      chunks.current = [];
      r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      r.start(1000);
      rec.current = r;
      startedAt.current = Date.now();
      setRecording(true);
      // Input level meter.
      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        audioCtx.current = ctx;
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        ctx.createMediaStreamSource(s).connect(an);
        const data = new Uint8Array(an.fftSize);
        const tick = () => {
          an.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
          setLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
          raf.current = requestAnimationFrame(tick);
        };
        tick();
      } catch { /* the meter is optional */ }
      return true;
    } catch (e) {
      const name = (e as { name?: string }).name;
      setError(name === 'NotAllowedError'
        ? 'Microphone access was blocked. Click the lock icon next to the web address, allow the microphone, and try again. On a school Chromebook, IT may need to allow it.'
        : name === 'NotFoundError' ? 'No microphone was found. Plug one in, or type your script instead.' : 'Couldn’t start the microphone. Try again, or type your script instead.');
      cleanup();
      return false;
    }
  }, [cleanup]);

  const stop = useCallback((): Promise<Recording | null> => new Promise((resolve) => {
    const r = rec.current;
    if (!r || r.state === 'inactive') { setRecording(false); cleanup(); resolve(null); return; }
    r.onstop = () => {
      const mime = r.mimeType || 'audio/webm';
      const blob = new Blob(chunks.current, { type: mime });
      const seconds = Math.round((Date.now() - startedAt.current) / 1000);
      rec.current = null;
      setRecording(false);
      cleanup();
      resolve({ blob, mime, seconds });
    };
    r.stop();
  }), [cleanup]);

  /** The audio recorded so far, without stopping. Used to hear what was said mid-performance. */
  const snapshot = useCallback(async (): Promise<Recording | null> => {
    const r = rec.current;
    if (!r || r.state !== 'recording') return null;
    // Ask the recorder to hand over what it has right now, then wait briefly for it.
    await new Promise<void>((resolve) => {
      const done = () => { r.removeEventListener('dataavailable', done); resolve(); };
      r.addEventListener('dataavailable', done);
      try { r.requestData(); } catch { done(); }
      setTimeout(done, 1500);
    });
    if (!chunks.current.length) return null;
    const mime = r.mimeType || 'audio/webm';
    return { blob: new Blob(chunks.current, { type: mime }), mime, seconds: Math.round((Date.now() - startedAt.current) / 1000) };
  }, []);

  return { recording, level, error, start, stop, snapshot, setError };
}

/** Reads text aloud with the browser's built-in voice, if it has one. */
export function speak(text: string) {
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.98;
    window.speechSynthesis.speak(u);
  } catch { /* reading aloud is optional */ }
}
export function stopSpeaking() { try { window.speechSynthesis.cancel(); } catch { /* ignore */ } }
