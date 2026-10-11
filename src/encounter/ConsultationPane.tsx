import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { LiveTranscript } from "../stt/LiveTranscript";
import type { Segment } from "../stt/protocol";

const demoCues = [
  { at: 0, speaker: "Doctor", text: "Tell me what brought you in today.", keywords: [] },
  { at: 3, speaker: "Patient", text: "My left arm feels weak, and my speech is slurred.", keywords: ["Left arm weakness", "Slurred speech"] },
  { at: 7, speaker: "Doctor", text: "When did you last feel like yourself? Any allergies?", keywords: ["Onset review", "Allergy review"] },
  { at: 11, speaker: "Patient", text: "About an hour ago. I have a penicillin allergy.", keywords: ["About 1 hour ago", "Penicillin allergy"] },
];

/** Recorded synthetic demo and optional local camera; neither is a connected call. */
export function ConsultationPane({
  hospital,
  onHide,
  onTranscript,
}: {
  hospital: string;
  /** Folds the video away so the form can use the space. */
  onHide?: () => void;
  onTranscript?: (segments: Segment[]) => void;
}) {
  const [preview, setPreview] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const demoVideo = useRef<HTMLVideoElement>(null);
  const [demoTime, setDemoTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [transcriptMode, setTranscriptMode] = useState<"demo" | "live">("demo");
  const transcriptDialog = useRef<HTMLDialogElement>(null);
  const [liveSegments, setLiveSegments] = useState<Segment[]>([]);
  const captureTranscript = useCallback((segments: Segment[]) => {
    setLiveSegments(segments);
    onTranscript?.(segments);
  }, [onTranscript]);
  const cues = demoCues.filter((cue) => cue.at <= demoTime);
  const stream = useRef<MediaStream | undefined>(undefined);
  const generation = useRef(0);
  const stop = () => {
    generation.current++;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = undefined;
    if (video.current) video.current.srcObject = null;
    setPreview(false);
    setPending(false);
  };
  useEffect(
    () => () => {
      generation.current++;
      stream.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );
  const start = async () => {
    demoVideo.current?.pause();
    const request = ++generation.current;
    setPending(true);
    setError("");
    setExpanded(true);
    try {
      const next = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
      if (request !== generation.current) {
        next.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = next;
      if (video.current) {
        video.current.srcObject = next;
        await video.current.play();
      }
      setPreview(true);
    } catch {
      if (request === generation.current) {
        stop();
        setError(
          "Camera preview is unavailable. Check camera permissions or continue without video.",
        );
      }
    } finally {
      if (request === generation.current) setPending(false);
    }
  };
  return (
    <section
      className={`consultation-pane${expanded ? " is-expanded" : ""}`}
      aria-label="Video consultation"
      data-testid="consultation-pane"
    >
      <header className="consultation-head">
        <div>
          <span className="consultation-brand">
            sevaro<span> / consultation</span>
          </span>
          <p>{hospital}</p>
        </div>
        <span className="video-mode">{preview ? "Local preview" : "Demo"}</span>
        {onHide && (
          <button
            className="video-hide"
            onClick={() => {
              stop();
              onHide();
            }}
            aria-label="Hide video"
            title="Hide video — gives the form more room"
          >
            <Icon name="left" size={18} />
          </button>
        )}
      </header>
      <button
        className="video-mobile-toggle"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        {expanded ? "Minimize video" : "Show video workspace"}
        <Icon name="camera" size={18} />
      </button>
      <div className="video-stage">
        <video
          ref={video}
          muted
          playsInline
          aria-label="Local camera preview"
          className={preview ? "is-playing" : ""}
        />
        {!preview && <video ref={demoVideo} className="recorded-demo is-playing"
          src="/media/doctor-consultation-demo.mp4" controls muted playsInline preload="metadata"
          aria-label="Recorded consultation demo"
          onTimeUpdate={(e) => setDemoTime(e.currentTarget.currentTime)}
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() => setError("The recorded demo could not load. You can continue documenting.")}
        />}
        {preview && (
          <span className="local-preview-tag">
            Only visible on this device · microphone off
          </span>
        )}
      </div>
      <section className={`caption-strip${playing ? " is-capturing" : ""}`} aria-label="Consultation captions">
        <div><span className="capture-indicator">{transcriptMode === "demo" ? "SCRIPTED CAPTIONS" : "ELEVENLABS TRANSCRIPT"}</span>
          <p key={transcriptMode === "demo" ? cues.at(-1)?.at : liveSegments.at(-1)?.id} aria-live="polite">
            {transcriptMode === "demo" ? `${cues.at(-1)?.speaker}: ${cues.at(-1)?.text}` : liveSegments.at(-1)?.text || "Open transcript to start live transcription."}
          </p>
        </div>
        <button type="button" onClick={() => transcriptDialog.current?.showModal()}>Open transcript <Icon name="right" size={16} /></button>
      </section>
      {!preview && <div className="demo-playback">
        <button type="button" onClick={() => {
          if (playing) demoVideo.current?.pause();
          else void demoVideo.current?.play().catch(() => setError("Use the video controls to start playback."));
        }}>{playing ? "Pause demo" : "Play demo"}</button>
        <button type="button" onClick={() => {
          void demoVideo.current?.requestFullscreen?.().catch(() => setError("Fullscreen is unavailable in this browser. Use the video controls."));
        }}>Fullscreen</button>
      </div>}
      <p className="demo-disclosure">Recorded preview · No live Sevaro call is connected.</p>
      <dialog ref={transcriptDialog} className="full-transcript-dialog" aria-label="Full consultation transcript">
        <header><div><strong>Consultation transcript</strong><p>Review the conversation and prepare field suggestions.</p></div>
          <button type="button" aria-label="Close transcript" onClick={() => transcriptDialog.current?.close()}><Icon name="close" size={20} /></button></header>
      <label className="transcript-mode">Transcript source
        <select value={transcriptMode} onChange={(e) => {
          demoVideo.current?.pause();
          setTranscriptMode(e.target.value as "demo" | "live");
          onTranscript?.([]);
        }}><option value="demo">Scripted demo</option><option value="live">Live · ElevenLabs</option></select>
      </label>
      {transcriptMode === "live" ? <LiveTranscript onTranscript={captureTranscript} /> : <section className={`demo-transcript${playing ? " is-capturing" : ""}`} aria-label="Scripted demo transcript">
        <header><strong>Transcript preview</strong><span className="capture-indicator">{playing ? "Capturing" : "Demo"}</span></header>
        <p className="transcript-disclaimer">Scripted example, not transcribed from this video. Play to reveal.</p>
        <div className="transcript-lines" aria-live="polite" aria-atomic="false">
          {cues.map((cue) => <p className="transcript-cue" key={cue.at}>
            <span>{`00:${String(cue.at).padStart(2, "0")}`} · {cue.speaker}</span>{cue.text}
          </p>)}
        </div>
        <div className="captured-keywords"><strong>Keywords captured · demo</strong>
          <div>{cues.flatMap((cue) => cue.keywords).map((word) => <span key={word}>{word}</span>)}</div>
          {cues.length === 1 && <p>Symptoms, timing and allergies appear here.</p>}
        </div>
        <button className="demo-use-transcript" type="button" onClick={() => {
          onTranscript?.(demoCues.map((cue, i) => ({ id: i + 1, text: `${cue.speaker}: ${cue.text}`, at: new Date().toISOString() })));
          const tools = document.querySelector<HTMLDetailsElement>(".ai-drafting-tools");
          if (tools) tools.open = true;
          transcriptDialog.current?.close();
        }}>Use scripted example for AI drafts</button>
      </section>}
      </dialog>
      <div className="video-controls">
        <div>
          <Icon name="shield" size={16} />
          <span>{preview ? "Local camera only" : "Microphone off"}</span>
        </div>
        <button
          className={`camera-control${preview ? " is-on" : ""}`}
          onClick={preview ? stop : start}
          disabled={pending}
        >
          <Icon name={preview ? "stop" : "camera"} size={18} />
          {pending
            ? "Opening camera…"
            : preview
              ? "Stop preview"
              : "Preview camera"}
        </button>
      </div>
      {error && (
        <p className="video-error" role="status">
          {error}
        </p>
      )}
    </section>
  );
}
