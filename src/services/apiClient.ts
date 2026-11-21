import type { SessionSummary, UserRole } from '../types/senavoz';

export interface HealthResponse {
  ok: boolean;
  geminiConfigured: boolean;
  externalApis: string[];
}

export interface TranslationResponse {
  translatedText: string;
  from: string;
  to: string;
  match: number | null;
  provider: string;
}

export interface DictionaryResponse {
  title: string;
  description: string;
  extract: string;
  example: string;
  url: string;
  provider: string;
}

async function parseJsonOrThrow<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(data.error || `Error del servidor (${response.status})`);
  }
  return data;
}

export async function fetchApiHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health');
  return parseJsonOrThrow<HealthResponse>(res);
}

export async function translateExternalText(
  q: string,
  from: 'es' | 'en' | 'pt' | 'fr',
  to: 'es' | 'en' | 'pt' | 'fr'
): Promise<TranslationResponse> {
  const params = new URLSearchParams({ q, from, to });
  const res = await fetch(`/api/external/translate?${params.toString()}`);
  return parseJsonOrThrow<TranslationResponse>(res);
}

export async function lookupExternalTerm(term: string, lang: 'es' | 'en'): Promise<DictionaryResponse> {
  const params = new URLSearchParams({ term, lang });
  const res = await fetch(`/api/external/dictionary?${params.toString()}`);
  return parseJsonOrThrow<DictionaryResponse>(res);
}

export async function assistTextWithAI(
  mode: 'simplify' | 'clarify',
  text: string,
  role?: UserRole
): Promise<string> {
  const res = await fetch('/api/ai/assist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, text, role }),
  });
  const data = await parseJsonOrThrow<{ result: string }>(res);
  return data.result;
}

export async function fetchSmartRepliesAI(
  messages: Array<{ sender: string; text: string }>,
  role: UserRole
): Promise<string[]> {
  const res = await fetch('/api/ai/assist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'replies', messages, role }),
  });
  const data = await parseJsonOrThrow<{ replies: string[] }>(res);
  return data.replies;
}

export async function summarizeSessionAI(
  messages: Array<{ sender: string; text: string }>,
  role: UserRole
): Promise<SessionSummary> {
  const res = await fetch('/api/ai/assist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'summarize', messages, role }),
  });
  return parseJsonOrThrow<SessionSummary>(res);
}
