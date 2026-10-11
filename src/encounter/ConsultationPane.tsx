import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";

/** Local camera preview only. A real Sevaro call requires its host integration. */
export function ConsultationPane({ hospital }: { hospital: string }) {
  const [preview, setPreview] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
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
        {!preview && (
          <div className="video-empty">
            <div className="camera-emblem">
              <Icon name="camera" size={32} />
            </div>
            <h2>Space for the conversation.</h2>
            <p>
              Your consultation on the left.
              <br />
              Everything you need to document, on the right.
            </p>
            <span className="video-disclosure">
              No live Sevaro call is connected.
            </span>
          </div>
        )}
        {preview && (
          <span className="local-preview-tag">
            Only visible on this device · microphone off
          </span>
        )}
      </div>
      <div className="video-controls">
        <div>
          <Icon name="shield" size={16} />
          <span>{preview ? "Local camera only" : "Ready for a preview"}</span>
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
      <footer className="consultation-footer">
        <Icon name="book" size={18} />
        <div>
          <strong>Stay with the patient.</strong>
          <p>
            Hospital guidance follows the field you’re in. Review it when you
            need it.
          </p>
        </div>
      </footer>
    </section>
  );
}
