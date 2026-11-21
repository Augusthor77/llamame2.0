import type { SpeechDialect } from '../types/senavoz';

const QUESTION_WORDS =
  /^(qué|cómo|cuándo|dónde|quién|quiénes|cuál|cuáles|cuánto|cuánta|cuántos|cuántas|por qué|para qué|quien|quienes|cual|cuales|cuanto|cuantos|cuantas)\b/i;

export function punctuateSpanish(input: string, isFinal: boolean): string {
  let t = ` ${input} `
    .replace(/\s+punto y coma\b/gi, ';')
    .replace(/\s+dos puntos\b/gi, ':')
    .replace(/\s+(?:signo de )?interrogaci[oó]n\b/gi, '?')
    .replace(/\s+(?:signo de )?exclamaci[oó]n\b/gi, '!')
    .replace(/\s+coma\b/gi, ',')
    .replace(/\s+punto\b/gi, '.')
    .trim();

  if (!t) return '';
  if (isFinal && !/[.?!;:]$/.test(t)) {
    t += QUESTION_WORDS.test(t) ? '?' : '.';
  }

  const parts = t.match(/[^.?!]+[.?!]*/g) || [t];
  return parts
    .map((segment) => {
      let s = segment.trim();
      if (!s) return '';
      const isQuestion = /\?$/.test(s) || (isFinal && QUESTION_WORDS.test(s));
      const isExclamation = /!$/.test(s);
      s = s.replace(/^(\S)/, (char) => char.toUpperCase());
      if (isQuestion && s[0] !== '¿') {
        s = `¿${s.replace(/^¿/, '')}`;
      } else if (isExclamation && s[0] !== '¡') {
        s = `¡${s}`;
      }
      return s;
    })
    .join(' ');
}

export interface BrowserSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      0: { transcript: string };
    };
  };
}

export function getSpeechRecognitionConstructor(): (new () => BrowserSpeechRecognition) | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: new () => BrowserSpeechRecognition;
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

export function speakText(text: string, dialect: SpeechDialect, rate = 1): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = dialect;
    utterance.rate = Math.max(0.7, Math.min(1.4, rate));
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  } catch {
    // Ignore speech synthesis errors on restricted browsers
  }
}

export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export function generateRoomCode(length = 4): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return result;
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
