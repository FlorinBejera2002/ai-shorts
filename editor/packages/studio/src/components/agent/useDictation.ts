// Browser dictation for the composer. Nothing reaches the agent until the user presses Send.
import type { StudioLocale } from "../../i18n/dictionary";
import { useRef, useState } from "react";
import { useMountEffect } from "../../hooks/useMountEffect";

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

const DICTATION_LANGUAGE: Record<StudioLocale, string> = {
  en: "en-US",
  ro: "ro-RO",
  es: "es-ES",
};

type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

export function useDictation(locale: StudioLocale, append: (text: string) => void) {
  const recognition = useRef<Recognition | null>(null);
  const [listening, setListening] = useState(false);
  const [failed, setFailed] = useState(false);
  const speech = typeof window === "undefined" ? undefined : (window as SpeechWindow);
  const Constructor = speech?.SpeechRecognition ?? speech?.webkitSpeechRecognition;

  useMountEffect(() => () => recognition.current?.abort());

  function toggle() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    if (!Constructor) return;
    const instance = new Constructor();
    instance.lang = DICTATION_LANGUAGE[locale];
    instance.interimResults = false;
    instance.continuous = false;
    instance.onresult = (event) =>
      append(
        Array.from(event.results)
          .map((result) => result[0].transcript)
          .join(" "),
      );
    instance.onerror = () => {
      setListening(false);
      setFailed(true);
    };
    instance.onend = () => setListening(false);
    recognition.current = instance;
    setFailed(false);
    try {
      instance.start();
      setListening(true);
    } catch {
      setFailed(true);
    }
  }

  return { supported: Boolean(Constructor), listening, failed, toggle };
}
