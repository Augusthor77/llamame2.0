import { useState } from 'react';
import {
  ArrowLeftRight,
  BookOpen,
  ExternalLink,
  Languages,
  Plus,
  Search,
  Sparkles,
  Volume2,
} from 'lucide-react';
import type { AccessibilitySettings, QuickPhrase, UserProfile } from '../types/senavoz';
import {
  assistTextWithAI,
  lookupExternalTerm,
  translateExternalText,
  type DictionaryResponse,
  type TranslationResponse,
} from '../services/apiClient';
import { speakText } from '../utils/speech';

interface ExternalToolsViewProps {
  profile: UserProfile;
  settings: AccessibilitySettings;
  onAddQuickPhrase: (label: string, text: string) => void;
  existingPhrases: QuickPhrase[];
}

const SUGGESTED_TERMS = [
  'Lengua de señas',
  'Subtitulado',
  'Accesibilidad',
  'Telemedicina',
  'Fonoaudiología',
];

const LANG_OPTIONS = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
  { code: 'pt', label: 'Português' },
  { code: 'fr', label: 'Français' },
] as const;

export function ExternalToolsView({
  profile,
  settings,
  onAddQuickPhrase,
  existingPhrases,
}: ExternalToolsViewProps) {
  // Traductor externo (MyMemory API)
  const [sourceText, setSourceText] = useState('');
  const [fromLang, setFromLang] = useState<'es' | 'en' | 'pt' | 'fr'>('es');
  const [toLang, setToLang] = useState<'es' | 'en' | 'pt' | 'fr'>('en');
  const [translation, setTranslation] = useState<TranslationResponse | null>(null);
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState('');
  const [savedNotice, setSavedNotice] = useState('');

  // Diccionario externo (Wikipedia ES / Free Dictionary API)
  const [dictTerm, setDictTerm] = useState('');
  const [dictLang, setDictLang] = useState<'es' | 'en'>('es');
  const [dictResult, setDictResult] = useState<DictionaryResponse | null>(null);
  const [dictLoading, setDictLoading] = useState(false);
  const [dictError, setDictError] = useState('');

  // Adaptador a Lectura Fácil (Gemini API)
  const [adaptInput, setAdaptInput] = useState('');
  const [adaptMode, setAdaptMode] = useState<'simplify' | 'clarify'>('simplify');
  const [adaptOutput, setAdaptOutput] = useState('');
  const [adapting, setAdapting] = useState(false);
  const [adaptError, setAdaptError] = useState('');

  const handleTranslate = async () => {
    if (!sourceText.trim()) return;
    setTranslating(true);
    setTranslateError('');
    try {
      const res = await translateExternalText(sourceText.trim(), fromLang, toLang);
      setTranslation(res);
    } catch (err) {
      setTranslateError(err instanceof Error ? err.message : 'No se pudo traducir.');
    } finally {
      setTranslating(false);
    }
  };

  const handleSwapLanguages = () => {
    setFromLang(toLang);
    setToLang(fromLang);
    if (translation?.translatedText) {
      setSourceText(translation.translatedText);
      setTranslation(null);
    }
  };

  const handleSaveAsPhrase = () => {
    const textToSave = translation?.translatedText || sourceText.trim();
    if (!textToSave) return;
    const label = textToSave.slice(0, 22) + (textToSave.length > 22 ? '…' : '');
    onAddQuickPhrase(label, textToSave);
    setSavedNotice('Guardada en tus frases rápidas.');
    window.setTimeout(() => setSavedNotice(''), 2500);
  };

  const handleSearchDictionary = async (termOverride?: string) => {
    const term = (termOverride ?? dictTerm).trim();
    if (!term) return;
    if (termOverride) setDictTerm(termOverride);
    setDictLoading(true);
    setDictError('');
    try {
      const res = await lookupExternalTerm(term, dictLang);
      setDictResult(res);
    } catch (err) {
      setDictResult(null);
      setDictError(err instanceof Error ? err.message : 'Error al consultar término.');
    } finally {
      setDictLoading(false);
    }
  };

  const handleAdaptText = async () => {
    if (!adaptInput.trim()) return;
    setAdapting(true);
    setAdaptError('');
    try {
      const res = await assistTextWithAI(adaptMode, adaptInput, profile.role || 'sorda');
      setAdaptOutput(res);
    } catch (err) {
      setAdaptError(err instanceof Error ? err.message : 'Error al adaptar el texto.');
    } finally {
      setAdapting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-20 lg:pb-10">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#10243A] dark:text-[#EAF0F6]">
          Diccionario, traducción y lectura fácil
        </h1>
        <p className="mt-1 text-sm sm:text-base text-[#566677] dark:text-[#93A3B5]">
          Herramientas conectadas en vivo a APIs externas de traducción y consulta conceptual para apoyar cada llamada.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Traductor externo MyMemory */}
        <section className="rounded-xl border border-[#D3DBE3] dark:border-[#26384D] bg-white dark:bg-[#142233] p-5 sm:p-6 flex flex-col justify-between gap-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Languages className="h-5 w-5 text-[#1B4F8A] dark:text-[#8FBBF2]" aria-hidden="true" />
                <h2 className="text-lg font-bold text-[#10243A] dark:text-[#EAF0F6]">
                  Traductor multilingüe
                </h2>
              </div>
              <span className="text-xs text-[#566677] dark:text-[#93A3B5]">MyMemory API</span>
            </div>

            <div className="flex items-center gap-2">
              <select
                aria-label="Idioma de origen"
                value={fromLang}
                onChange={(e) => setFromLang(e.target.value as 'es' | 'en' | 'pt' | 'fr')}
                className="flex-1 rounded-lg border border-[#D3DBE3] dark:border-[#26384D] bg-[#F4F6F8] dark:bg-[#0C1520] px-3 py-2 text-sm text-[#10243A] dark:text-[#EAF0F6]"
              >
                {LANG_OPTIONS.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleSwapLanguages}
                aria-label="Intercambiar idiomas"
                className="rounded-lg border border-[#D3DBE3] dark:border-[#26384D] p-2 text-[#10243A] dark:text-[#EAF0F6] hover:bg-[#F4F6F8] dark:hover:bg-[#1D2F45]"
              >
                <ArrowLeftRight className="h-4 w-4" />
              </button>

              <select
                aria-label="Idioma de destino"
                value={toLang}
                onChange={(e) => setToLang(e.target.value as 'es' | 'en' | 'pt' | 'fr')}
                className="flex-1 rounded-lg border border-[#D3DBE3] dark:border-[#26384D] bg-[#F4F6F8] dark:bg-[#0C1520] px-3 py-2 text-sm text-[#10243A] dark:text-[#EAF0F6]"
              >
                {LANG_OPTIONS.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>

            <textarea
              rows={3}
              maxLength={400}
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              placeholder="Escribe una frase para traducirla y tenerla lista para tus videollamadas…"
              className="w-full rounded-lg border border-[#D3DBE3] dark:border-[#26384D] bg-[#F4F6F8] dark:bg-[#0C1520] p-3 text-sm text-[#10243A] dark:text-[#EAF0F6]"
            />

            {translateError && (
              <p className="text-xs font-medium text-[#DC2626] dark:text-red-400">
                {translateError}
              </p>
            )}

            {translation && (
              <div className="rounded-lg border border-[#D3DBE3] dark:border-[#26384D] bg-[#F4F6F8] dark:bg-[#0C1520] p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs text-[#566677] dark:text-[#93A3B5]">
                  <span>Resultado ({translation.provider})</span>
                  {translation.match !== null && (
                    <span className="font-mono tabular-nums">
                      Coincidencia {Math.round(translation.match * 100)}%
                    </span>
                  )}
                </div>
                <p className="text-base font-medium text-[#10243A] dark:text-[#EAF0F6]">
                  {translation.translatedText}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      speakText(
                        translation.translatedText,
                        toLang === 'en' ? 'en-US' : profile.dialect,
                        settings.ttsRate
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#D3DBE3] dark:border-[#26384D] bg-white dark:bg-[#142233] px-3 py-1.5 text-xs font-semibold text-[#10243A] dark:text-[#EAF0F6]"
                  >
                    <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Escuchar</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveAsPhrase}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#D3DBE3] dark:border-[#26384D] bg-white dark:bg-[#142233] px-3 py-1.5 text-xs font-semibold text-[#10243A] dark:text-[#EAF0F6]"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Guardar como frase rápida</span>
                  </button>
                </div>
                {savedNotice && (
                  <p className="text-xs font-medium text-[#16A34A]">{savedNotice}</p>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={translating || !sourceText.trim() || fromLang === toLang}
            onClick={handleTranslate}
            className="w-full rounded-lg bg-[#1B4F8A] dark:bg-[#8FBBF2] px-4 py-2.5 text-sm font-semibold text-white dark:text-[#0C1520] hover:opacity-90 disabled:opacity-50 min-h-[42px]"
          >
            {translating ? 'Traduciendo…' : 'Traducir ahora'}
          </button>
        </section>

        {/* Diccionario externo Wikipedia ES / Free Dictionary */}
        <section className="rounded-xl border border-[#D3DBE3] dark:border-[#26384D] bg-white dark:bg-[#142233] p-5 sm:p-6 flex flex-col justify-between gap-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-[#1B4F8A] dark:text-[#8FBBF2]" aria-hidden="true" />
                <h2 className="text-lg font-bold text-[#10243A] dark:text-[#EAF0F6]">
                  Diccionario de consulta rápida
                </h2>
              </div>
              <div className="flex items-center gap-1 rounded-lg bg-[#F4F6F8] dark:bg-[#0C1520] p-1">
                <button
                  type="button"
                  onClick={() => setDictLang('es')}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                    dictLang === 'es'
                      ? 'bg-white dark:bg-[#142233] text-[#10243A] dark:text-[#EAF0F6]'
                      : 'text-[#566677] dark:text-[#93A3B5]'
                  }`}
                >
                  ES
                </button>
                <button
                  type="button"
                  onClick={() => setDictLang('en')}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                    dictLang === 'en'
                      ? 'bg-white dark:bg-[#142233] text-[#10243A] dark:text-[#EAF0F6]'
                      : 'text-[#566677] dark:text-[#93A3B5]'
                  }`}
                >
                  EN
                </button>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSearchDictionary();
              }}
              className="flex gap-2"
            >
              <div className="relative flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#566677]"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  maxLength={80}
                  value={dictTerm}
                  onChange={(e) => setDictTerm(e.target.value)}
                  placeholder="Ej. Telemedicina, Fonoaudiología, Accessibility…"
                  aria-label="Buscar término"
                  className="w-full rounded-lg border border-[#D3DBE3] dark:border-[#26384D] bg-[#F4F6F8] dark:bg-[#0C1520] pl-9 pr-3 py-2.5 text-sm text-[#10243A] dark:text-[#EAF0F6]"
                />
              </div>
              <button
                type="submit"
                disabled={dictLoading || !dictTerm.trim()}
                className="rounded-lg bg-[#1B4F8A] dark:bg-[#8FBBF2] px-4 py-2.5 text-sm font-semibold text-white dark:text-[#0C1520] disabled:opacity-50 whitespace-nowrap"
              >
                {dictLoading ? 'Buscando…' : 'Buscar'}
              </button>
            </form>

            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_TERMS.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => {
                    setDictLang('es');
                    handleSearchDictionary(term);
                  }}
                  className="rounded-lg border border-[#D3DBE3] dark:border-[#26384D] px-2.5 py-1 text-xs text-[#566677] dark:text-[#93A3B5] hover:text-[#10243A] dark:hover:text-[#EAF0F6]"
                >
                  {term}
                </button>
              ))}
            </div>

            {dictError && (
              <p className="text-xs font-medium text-[#DC2626] dark:text-red-400">{dictError}</p>
            )}

            {dictResult ? (
              <div className="rounded-lg border border-[#D3DBE3] dark:border-[#26384D] bg-[#F4F6F8] dark:bg-[#0C1520] p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-[#10243A] dark:text-[#EAF0F6]">
                      {dictResult.title}
                    </h3>
                    {dictResult.description && (
                      <p className="text-xs text-[#566677] dark:text-[#93A3B5]">
                        {dictResult.description} · {dictResult.provider}
                      </p>
                    )}
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-[#10243A] dark:text-[#EAF0F6]">
                  {dictResult.extract}
                </p>
                {dictResult.example && (
                  <p className="text-xs italic text-[#566677] dark:text-[#93A3B5]">
                    Ejemplo: "{dictResult.example}"
                  </p>
                )}
                {dictResult.url && (
                  <a
                    href={dictResult.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#1B4F8A] dark:text-[#8FBBF2] hover:underline pt-1"
                  >
                    <span>Ver ficha completa</span>
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                )}
              </div>
            ) : (
              <p className="text-xs text-[#566677] dark:text-[#93A3B5] pt-2">
                Consulta definiciones en español (Wikipedia REST API) o inglés (Free Dictionary API) sin salir de SeñaVoz. Tus frases guardadas actuales: {existingPhrases.length}.
              </p>
            )}
          </div>
        </section>
      </div>

      {/* Adaptador a Lectura Fácil / Clarificador */}
      <section className="rounded-xl border border-[#D3DBE3] dark:border-[#26384D] bg-white dark:bg-[#142233] p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#1B4F8A] dark:text-[#8FBBF2]" aria-hidden="true" />
            <div>
              <h2 className="text-lg font-bold text-[#10243A] dark:text-[#EAF0F6]">
                Adaptador de texto accesible
              </h2>
              <p className="text-xs text-[#566677] dark:text-[#93A3B5]">
                Simplifica mensajes largos a Lectura Fácil o redacta notas rápidas con naturalidad.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-[#F4F6F8] dark:bg-[#0C1520] p-1 self-start">
            <button
              type="button"
              onClick={() => setAdaptMode('simplify')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                adaptMode === 'simplify'
                  ? 'bg-white dark:bg-[#142233] text-[#10243A] dark:text-[#EAF0F6]'
                  : 'text-[#566677] dark:text-[#93A3B5]'
              }`}
            >
              Lectura fácil
            </button>
            <button
              type="button"
              onClick={() => setAdaptMode('clarify')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                adaptMode === 'clarify'
                  ? 'bg-white dark:bg-[#142233] text-[#10243A] dark:text-[#EAF0F6]'
                  : 'text-[#566677] dark:text-[#93A3B5]'
              }`}
            >
              Clarificar borrador
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <textarea
            rows={4}
            maxLength={1200}
            value={adaptInput}
            onChange={(e) => setAdaptInput(e.target.value)}
            placeholder={
              adaptMode === 'simplify'
                ? 'Pega aquí un texto médico, administrativo o complejo para simplificarlo…'
                : 'Escribe una nota breve o telegráfica (ej. "mañana cita 9 confirmar dirección por favor")…'
            }
            className="w-full rounded-lg border border-[#D3DBE3] dark:border-[#26384D] bg-[#F4F6F8] dark:bg-[#0C1520] p-3 text-sm text-[#10243A] dark:text-[#EAF0F6]"
          />

          <div className="rounded-lg border border-[#D3DBE3] dark:border-[#26384D] bg-[#F4F6F8] dark:bg-[#0C1520] p-3 flex flex-col justify-between">
            <p className="text-sm text-[#10243A] dark:text-[#EAF0F6] whitespace-pre-wrap">
              {adaptOutput || 'Aquí aparecerá el texto adaptado listo para leer o enviar en sala.'}
            </p>
            {adaptOutput && (
              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => speakText(adaptOutput, profile.dialect, settings.ttsRate)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#D3DBE3] dark:border-[#26384D] bg-white dark:bg-[#142233] px-3 py-1.5 text-xs font-semibold text-[#10243A] dark:text-[#EAF0F6]"
                >
                  <Volume2 className="h-3.5 w-3.5" />
                  <span>Escuchar</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onAddQuickPhrase(
                      adaptOutput.slice(0, 22) + (adaptOutput.length > 22 ? '…' : ''),
                      adaptOutput
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#D3DBE3] dark:border-[#26384D] bg-white dark:bg-[#142233] px-3 py-1.5 text-xs font-semibold text-[#10243A] dark:text-[#EAF0F6]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Añadir a frases</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {adaptError && (
          <p className="text-xs font-medium text-[#DC2626] dark:text-red-400">{adaptError}</p>
        )}

        <button
          type="button"
          disabled={adapting || !adaptInput.trim()}
          onClick={handleAdaptText}
          className="inline-flex items-center gap-2 rounded-lg bg-[#1B4F8A] dark:bg-[#8FBBF2] px-5 py-2.5 text-sm font-semibold text-white dark:text-[#0C1520] hover:opacity-90 disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          <span>{adapting ? 'Procesando…' : 'Generar versión accesible'}</span>
        </button>
      </section>
    </div>
  );
}
