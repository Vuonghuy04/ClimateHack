"use client";

import { useEffect, useRef, useState } from "react";

export function useAudioCapture(onAudio: (blob: Blob, filename: string) => void) {
  const [recording, setRecording] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const capRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const callbackRef = useRef(onAudio); callbackRef.current = onAudio;

  function clearTimers() { if (intervalRef.current) clearInterval(intervalRef.current); if (capRef.current) clearTimeout(capRef.current); }
  function stopTracks() { streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; }
  function stop() { if (recorderRef.current?.state === "recording") recorderRef.current.stop(); clearTimers(); }

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; clearTimers(); if (recorderRef.current) { recorderRef.current.onstop = null; if (recorderRef.current.state === "recording") recorderRef.current.stop(); } stopTracks(); };
  }, []);

  async function start() {
    if (recording || requesting) return;
    setError(null); setRequesting(true); setSeconds(0);
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("Recording is unavailable here. Use localhost in Chrome or Edge, or type the observation.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error("This browser cannot record a supported audio format. Type the observation instead.");
      const recorder = new MediaRecorder(stream, { mimeType }); recorderRef.current = recorder;
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        clearTimers(); stopTracks();
        if (!mounted.current) return;
        setRecording(false);
        const blob = new Blob(chunks, { type: mimeType });
        if (!blob.size) { setError("No audio was recorded. Try again or type the observation."); return; }
        callbackRef.current(blob, mimeType.includes("mp4") ? "observation.mp4" : "observation.webm");
      };
      recorder.onerror = () => { clearTimers(); stopTracks(); if (mounted.current) { setRecording(false); setError("Recording stopped unexpectedly. Try again or type your observation."); } };
      recorder.start(); setRecording(true);
      const startedAt = performance.now(); intervalRef.current = setInterval(() => setSeconds(Math.min(60, Math.floor((performance.now() - startedAt) / 1000))), 250);
      capRef.current = setTimeout(stop, 60_000);
    } catch (caught) {
      stopTracks();
      if (mounted.current) setError(caught instanceof DOMException && caught.name === "NotAllowedError" ? "Microphone permission was denied. Type your observation or enter the fields manually." : caught instanceof Error ? caught.message : "Microphone access failed. Type your observation instead.");
    } finally { if (mounted.current) setRequesting(false); }
  }
  return { recording, requesting, seconds, error, start, stop };
}
