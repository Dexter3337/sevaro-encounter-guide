import { useEffect, useRef, useState } from "react";

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<{
          isFinal: boolean;
          0: { transcript: string; confidence: number };
        }>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  abort: () => void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};
export function useMicrophone(
  onFinal: (text: string, confidence: number) => void,
) {
  const [status, setStatus] = useState<
    "off" | "starting" | "listening" | "speaking"
  >("off");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const callback = useRef(onFinal);
  callback.current = onFinal;
  const recognition = useRef<Recognition | null>(null);
  const wanted = useRef(false);
  const speaking = useRef(false);
  const retries = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const speechTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const mounted = useRef(true);
  const speechSequence = useRef(0);
  const speechWindow = window as SpeechWindow;
  const Constructor =
    speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
  function detach() {
    const r = recognition.current;
    recognition.current = null;
    if (r) {
      r.onresult = null;
      r.onend = null;
      r.onerror = null;
      r.onstart = null;
      try {
        r.abort();
      } catch {}
    }
    clearTimeout(timer.current);
  }
  function stop() {
    speechSequence.current++;
    wanted.current = false;
    speaking.current = false;
    detach();
    clearTimeout(speechTimer.current);
    window.speechSynthesis?.cancel();
    if (mounted.current) {
      setStatus("off");
      setInterim("");
    }
  }
  function boot() {
    if (!wanted.current || speaking.current || !Constructor || !mounted.current)
      return;
    detach();
    const r = new Constructor();
    recognition.current = r;
    r.lang = "en-US";
    r.continuous = true;
    r.interimResults = true;
    const seen = new Set<number>();
    r.onstart = () => {
      if (recognition.current === r) setStatus("listening");
    };
    r.onresult = (event) => {
      if (!wanted.current || speaking.current || recognition.current !== r)
        return;
      retries.current = 0;
      let partial = "";
      const finals: { text: string; confidence: number }[] = [];
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal && !seen.has(i)) {
          seen.add(i);
          finals.push({
            text: result[0].transcript,
            confidence: result[0].confidence,
          });
        } else if (!result.isFinal) partial += result[0].transcript;
      }
      setInterim(partial);
      if (finals.length)
        callback.current(
          finals.map((x) => x.text).join(". "),
          Math.min(...finals.map((x) => x.confidence)),
        );
    };
    r.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      stop();
      setError(
        (
          {
            "not-allowed":
              "Microphone permission was denied. Allow microphone access in your browser, then retry.",
            "audio-capture":
              "No microphone is available. Check your input device.",
            network:
              "The browser speech service could not connect. Retry or use the transcript test below.",
            "service-not-allowed":
              "Speech recognition is unavailable in this browser. Try Chrome or use the transcript test.",
          } as Record<string, string>
        )[event.error] || `Speech recognition stopped: ${event.error}.`,
      );
    };
    r.onend = () => {
      if (recognition.current !== r || !wanted.current || speaking.current)
        return;
      setInterim("");
      if (++retries.current > 4) {
        stop();
        setError(
          "The speech service kept disconnecting. Select Start listening to retry.",
        );
        return;
      }
      setStatus("starting");
      timer.current = setTimeout(boot, 400);
    };
    try {
      setStatus("starting");
      r.start();
    } catch {
      stop();
      setError(
        "Microphone could not start. Use a supported browser on HTTPS or localhost.",
      );
    }
  }
  function start() {
    if (!Constructor) {
      setError(
        "Live speech is not supported in this browser. Use the transcript test below.",
      );
      return;
    }
    if (wanted.current) return;
    setError("");
    wanted.current = true;
    retries.current = 0;
    boot();
  }
  function speak(text: string) {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
    // Suspend recognition while the bot speaks, preventing its response from
    // becoming a fresh transcript or command through the microphone.
    const sequence = ++speechSequence.current;
    detach();
    clearTimeout(speechTimer.current);
    window.speechSynthesis.cancel();
    speaking.current = true;
    setStatus("speaking");
    setInterim("");
    const utterance = new SpeechSynthesisUtterance(text.slice(0, 1500));
    utterance.rate = 1;
    let finished = false;
    const done = () => {
      if (finished || sequence !== speechSequence.current) return;
      finished = true;
      clearTimeout(speechTimer.current);
      speaking.current = false;
      if (!mounted.current) return;
      setStatus(wanted.current ? "starting" : "off");
      if (wanted.current) timer.current = setTimeout(boot, 450);
    };
    utterance.onend = done;
    utterance.onerror = done;
    window.speechSynthesis.speak(utterance);
    speechTimer.current = setTimeout(() => {
      window.speechSynthesis.cancel();
      done();
    }, 45000);
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stop();
    };
  }, []);
  return {
    supported: !!Constructor,
    status,
    interim,
    error,
    start,
    stop,
    speak,
  };
}
