import { useState } from 'react';
import { Plus, RotateCcw, Trash2, Volume2 } from 'lucide-react';
import type {
  AccessibilitySettings,
  QuickPhrase,
  TranslationTarget,
  UserProfile,
} from '../types/senavoz';
import { DEFAULT_QUICK_PHRASES } from '../hooks/useLocalStorage';
import { speakText } from '../utils/speech';

interface AccessibilitySettingsViewProps {
  profile: UserProfile;
  settings: AccessibilitySettings;
  onUpdateSettings: (next: AccessibilitySettings) => void;
  quickPhrases: QuickPhrase[];
  onUpdateQuickPhrases: (next: QuickPhrase[]) => void;
}

export function AccessibilitySettingsView({
  profile,
  settings,
  onUpdateSettings,
  quickPhrases,
  onUpdateQuickPhrases,
}: AccessibilitySettingsViewProps) {
  const [newLabel, setNewLabel] = useState('');
  const [newText, setNewText] = useState('');
  const [newCategory, setNewCategory] = useState<QuickPhrase['category']>('personal');

  const handleAddPhrase = () => {
    if (!newLabel.trim() || !newText.trim()) return;
    const item: QuickPhrase = {
      id: `qp-${Date.now()}`,
      label: newLabel.trim().slice(0, 28),
      text: newText.trim().slice(0, 200),
      category: newCategory,
    };
    onUpdateQuickPhrases([...quickPhrases, item]);
    setNewLabel('');
    setNewText('');
  };

  const handleRemovePhrase = (id: string) => {
    onUpdateQuickPhrases(quickPhrases.filter((p) => p.id !== id));
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-20 lg:pb-10">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#10243A] dark:text-[#EAF0F6]">
          Frases rápidas y accesibilidad
        </h1>
        <p className="mt-1 text-sm sm:text-base text-[#566677] dark:text-[#93A3B5]">
          Personaliza el tamaño de lectura, alertas visuales, traducción automática y tu tablero de botones rápidos.
        </p>
      </div>

      {/* Configuración visual y auditiva */}
      <section className="rounded-xl border border-[#D3DBE3] dark:border-[#26384D] bg-white dark:bg-[#142233] p-5 sm:p-6 space-y-6">
        <h2 className="text-lg font-bold text-[#10243A] dark:text-[#EAF0F6]">
          Subtítulos, voz y alertas
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label
                htmlFor="cap-size-range"
                className="text-sm font-semibold text-[#10243A] dark:text-[#EAF0F6]"
              >
                Tamaño de subtítulos
              </label>
              <span className="font-mono text-sm tabular-nums text-[#1B4F8A] dark:text-[#8FBBF2]">
                {settings.captionSize} px
              </span>
            </div>
            <input
              id="cap-size-range"
              type="range"
              min={16}
              max={44}
              step={2}
              value={settings.captionSize}
              onChange={(e) =>
                onUpdateSettings({ ...settings, captionSize: Number(e.target.value) })
              }
              className="w-full accent-[#1B4F8A]"
            />
            <div className="rounded-lg border border-[#D3DBE3] dark:border-[#26384D] bg-[#F4F6F8] dark:bg-[#0C1520] p-3">
              <p
                style={{ fontSize: `${settings.captionSize}px` }}
                className="leading-snug text-[#10243A] dark:text-[#EAF0F6]"
              >
                Vista previa: ¿Cómo estás hoy?
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="tts-rate-range"
                  className="text-sm font-semibold text-[#10243A] dark:text-[#EAF0F6]"
                >
                  Velocidad de síntesis de voz
                </label>
                <span className="font-mono text-sm tabular-nums text-[#1B4F8A] dark:text-[#8FBBF2]">
                  {settings.ttsRate.toFixed(1)}x
                </span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  id="tts-rate-range"
                  type="range"
                  min={0.7}
                  max={1.4}
                  step={0.1}
                  value={settings.ttsRate}
                  onChange={(e) =>
                    onUpdateSettings({ ...settings, ttsRate: Number(e.target.value) })
                  }
                  className="flex-1 accent-[#1B4F8A]"
                />
                <button
                  type="button"
                  onClick={() =>
                    speakText(
                      'Prueba de velocidad de lectura en SeñaVoz.',
                      profile.dialect,
                      settings.ttsRate
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#D3DBE3] dark:border-[#26384D] px-3 py-1.5 text-xs font-semibold text-[#10243A] dark:text-[#EAF0F6] whitespace-nowrap"
                >
                  <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Escuchar</span>
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="auto-translate-select"
                className="block text-sm font-semibold text-[#10243A] dark:text-[#EAF0F6] mb-1.5"
              >
                Traducción automática en sala (API externa)
              </label>
              <select
                id="auto-translate-select"
                value={settings.autoTranslateTo}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    autoTranslateTo: e.target.value as TranslationTarget,
                  })
                }
                className="w-full rounded-lg border border-[#D3DBE3] dark:border-[#26384D] bg-[#F4F6F8] dark:bg-[#0C1520] px-3 py-2.5 text-sm text-[#10243A] dark:text-[#EAF0F6]"
              >
                <option value="none">Desactivada (solo idioma original)</option>
                <option value="en">Traducir mensajes al Inglés (EN)</option>
                <option value="pt">Traducir mensajes al Portugués (PT)</option>
                <option value="fr">Traducir mensajes al Francés (FR)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#D3DBE3] dark:border-[#26384D]">
          <label className="flex items-start gap-3 rounded-lg border border-[#D3DBE3] dark:border-[#26384D] p-3.5 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.visualFlashAlerts}
              onChange={(e) =>
                onUpdateSettings({ ...settings, visualFlashAlerts: e.target.checked })
              }
              className="mt-0.5 h-4 w-4 accent-[#1B4F8A]"
            />
            <div>
              <span className="block text-sm font-semibold text-[#10243A] dark:text-[#EAF0F6]">
                Destello visual en avisos y mensajes
              </span>
              <span className="block text-xs text-[#566677] dark:text-[#93A3B5]">
                Resalta el borde de la pantalla cuando llega un mensaje o alguien pide atención.
              </span>
            </div>
          </label>

          <label className="flex items-start gap-3 rounded-lg border border-[#D3DBE3] dark:border-[#26384D] p-3.5 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.theme === 'dark'}
              onChange={(e) =>
                onUpdateSettings({ ...settings, theme: e.target.checked ? 'dark' : 'light' })
              }
              className="mt-0.5 h-4 w-4 accent-[#1B4F8A]"
            />
            <div>
              <span className="block text-sm font-semibold text-[#10243A] dark:text-[#EAF0F6]">
                Tema oscuro de alto confort
              </span>
              <span className="block text-xs text-[#566677] dark:text-[#93A3B5]">
                Reduce el brillo de pantalla en llamadas prolongadas o ambientes con poca luz.
              </span>
            </div>
          </label>
        </div>
      </section>

      {/* Gestor de frases rápidas */}
      <section className="rounded-xl border border-[#D3DBE3] dark:border-[#26384D] bg-white dark:bg-[#142233] p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#10243A] dark:text-[#EAF0F6]">
              Tablero de frases rápidas
            </h2>
            <p className="text-sm text-[#566677] dark:text-[#93A3B5]">
              Aparecen como botones de un solo toque durante la videollamada.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onUpdateQuickPhrases(DEFAULT_QUICK_PHRASES)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#D3DBE3] dark:border-[#26384D] px-3 py-2 text-xs font-semibold text-[#10243A] dark:text-[#EAF0F6]"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Restaurar predeterminadas</span>
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAddPhrase();
          }}
          className="grid grid-cols-1 sm:grid-cols-12 gap-3"
        >
          <input
            type="text"
            maxLength={28}
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Etiqueta corta (ej. Soy alérgico)"
            aria-label="Etiqueta del botón"
            className="sm:col-span-3 rounded-lg border border-[#D3DBE3] dark:border-[#26384D] bg-[#F4F6F8] dark:bg-[#0C1520] px-3 py-2 text-sm text-[#10243A] dark:text-[#EAF0F6]"
          />
          <input
            type="text"
            maxLength={200}
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Mensaje completo que se enviará y leerá en voz alta…"
            aria-label="Texto completo de la frase"
            className="sm:col-span-5 rounded-lg border border-[#D3DBE3] dark:border-[#26384D] bg-[#F4F6F8] dark:bg-[#0C1520] px-3 py-2 text-sm text-[#10243A] dark:text-[#EAF0F6]"
          />
          <select
            aria-label="Categoría"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value as QuickPhrase['category'])}
            className="sm:col-span-2 rounded-lg border border-[#D3DBE3] dark:border-[#26384D] bg-[#F4F6F8] dark:bg-[#0C1520] px-3 py-2 text-sm text-[#10243A] dark:text-[#EAF0F6]"
          >
            <option value="personal">Personal</option>
            <option value="cortesia">Cortesía</option>
            <option value="ritmo">Ritmo</option>
            <option value="ayuda">Ayuda</option>
          </select>
          <button
            type="submit"
            disabled={!newLabel.trim() || !newText.trim()}
            className="sm:col-span-2 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#1B4F8A] dark:bg-[#8FBBF2] px-4 py-2 text-sm font-semibold text-white dark:text-[#0C1520] disabled:opacity-50 whitespace-nowrap"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Agregar</span>
          </button>
        </form>

        <div className="divide-y divide-[#D3DBE3] dark:divide-[#26384D] border border-[#D3DBE3] dark:border-[#26384D] rounded-lg overflow-hidden">
          {quickPhrases.map((phrase) => (
            <div
              key={phrase.id}
              className="flex items-center justify-between gap-4 px-4 py-3 bg-[#F4F6F8]/40 dark:bg-[#0C1520]/40"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#10243A] dark:text-[#EAF0F6]">
                  {phrase.label}{' '}
                  <span className="text-xs font-normal text-[#566677] dark:text-[#93A3B5]">
                    · {phrase.category}
                  </span>
                </p>
                <p className="text-xs text-[#566677] dark:text-[#93A3B5] truncate">{phrase.text}</p>
              </div>
              <button
                type="button"
                onClick={() => handleRemovePhrase(phrase.id)}
                aria-label={`Eliminar frase ${phrase.label}`}
                className="rounded-lg border border-[#D3DBE3] dark:border-[#26384D] p-2 text-[#DC2626] hover:bg-red-50 dark:hover:bg-red-950/30 shrink-0"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
