import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Copy,
  Download,
  FileText,
  Mic,
  Play,
  Search,
  Sparkles,
  Trash2,
  UserCheck,
  Video,
  Volume2,
} from 'lucide-react';
import type {
  AccessibilitySettings,
  CallSessionRecord,
  QuickPhrase,
  SpeechDialect,
  UserProfile,
  UserRole,
} from '../types/senavoz';
import { formatDuration, generateRoomCode, speakText } from '../utils/speech';
import { summarizeSessionAI } from '../services/apiClient';

interface DashboardOverviewProps {
  profile: UserProfile;
  onUpdateProfile: (next: UserProfile) => void;
  settings: AccessibilitySettings;
  sessions: CallSessionRecord[];
  onUpdateSession: (updated: CallSessionRecord) => void;
  onDeleteSession: (id: string) => void;
  quickPhrases: QuickPhrase[];
  inCall: boolean;
  isConnecting: boolean;
  lobbyError: string;
  onCreateRoom: (code: string, presetTitle: string) => void;
  onJoinRoom: (code: string) => void;
  onOpenActiveCall: () => void;
}

const ROOM_PRESETS = [
  { id: 'open', title: 'Charla abierta', desc: 'Conversación cotidiana entre 2 o 3 personas.' },
  { id: 'medical', title: 'Cita o trámite', desc: 'Atención clara con ritmo pausado y subtítulos.' },
  { id: 'team', title: 'Reunión de estudio', desc: 'Coordinación con transcripción exportable.' },
];

const DIALECT_OPTIONS: Array<{ value: SpeechDialect; label: string }> = [
  { value: 'es-CO', label: 'Español (Colombia)' },
  { value: 'es-ES', label: 'Español (España)' },
  { value: 'es-MX', label: 'Español (México)' },
  { value: 'es-AR', label: 'Español (Argentina)' },
  { value: 'en-US', label: 'English (US)' },
];

export function DashboardOverview({
  profile,
  onUpdateProfile,
  settings,
  sessions,
  onUpdateSession,
  onDeleteSession,
  quickPhrases,
  inCall,
  isConnecting,
  lobbyError,
  onCreateRoom,
  onJoinRoom,
  onOpenActiveCall,
}: DashboardOverviewProps) {
  const [joinCode, setJoinCode] = useState('');
  const [selectedPreset, setSelectedPreset] = useState(ROOM_PRESETS[0].title);
  const [historyFilter, setHistoryFilter] = useState<'all' | UserRole>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [summarizingId, setSummarizingId] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Pre-flight camera/audio tester state
  const [testCamActive, setTestCamActive] = useState(false);
  const [testCamError, setTestCamError] = useState('');
  const testVideoRef = useRef<HTMLVideoElement | null>(null);
  const testStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sala = params.get('sala');
    if (sala) {
      setJoinCode(sala.toUpperCase());
    }
  }, []);

  useEffect(() => {
    return () => {
      if (testStreamRef.current) {
        testStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const toggleCameraPreview = async () => {
    if (testCamActive) {
      testStreamRef.current?.getTracks().forEach((t) => t.stop());
      testStreamRef.current = null;
      if (testVideoRef.current) testVideoRef.current.srcObject = null;
      setTestCamActive(false);
      setTestCamError('');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setTestCamError('Tu navegador no permite abrir la cámara en este contexto.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      testStreamRef.current = stream;
      setTestCamActive(true);
      setTestCamError('');
      window.setTimeout(() => {
        if (testVideoRef.current) {
          testVideoRef.current.srcObject = stream;
        }
      }, 40);
    } catch (err) {
      const name = err instanceof Error ? err.name : 'permiso denegado';
      setTestCamError(`No se pudo activar la cámara (${name}).`);
    }
  };

  const handleTestVoice = () => {
    speakText(
      `Hola ${profile.name || ''}, esta es una prueba de voz clara en SeñaVoz.`,
      profile.dialect,
      settings.ttsRate
    );
  };

  const filteredSessions = sessions.filter((s) => {
    if (historyFilter !== 'all' && s.roleUsed !== historyFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.roomCode.toLowerCase().includes(q) ||
      s.presetTitle.toLowerCase().includes(q) ||
      s.participants.some((p) => p.toLowerCase().includes(q)) ||
      s.messages.some((m) => m.text.toLowerCase().includes(q))
    );
  });

  const activeSessionDetail =
    sessions.find((s) => s.id === selectedSessionId) || filteredSessions[0] || null;

  const totalMessages = sessions.reduce((acc, s) => acc + s.messages.length, 0);
  const totalSeconds = sessions.reduce((acc, s) => acc + s.durationSeconds, 0);

  const handleGenerateSummary = async (session: CallSessionRecord) => {
    if (session.messages.length === 0) {
      setSummaryError('Esta sesión no tiene mensajes registrados para resumir.');
      return;
    }
    setSummarizingId(session.id);
    setSummaryError('');
    try {
      const result = await summarizeSessionAI(
        session.messages.map((m) => ({ sender: m.sender, text: m.text })),
        session.roleUsed
      );
      onUpdateSession({ ...session, aiSummary: result });
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'No se pudo generar el resumen.');
    } finally {
      setSummarizingId(null);
    }
  };

  const handleExportTxt = (session: CallSessionRecord) => {
    const lines = [
      `SeñaVoz — Transcripción de sala ${session.roomCode}`,
      `Motivo: ${session.presetTitle}`,
      `Fecha: ${new Date(session.startedAt).toLocaleString('es-CO')}`,
      `Duración: ${formatDuration(session.durationSeconds)}`,
      '',
      ...session.messages.map(
        (m) => `[${m.timestamp}] ${m.sender}: ${m.text}${m.translatedText ? ` (${m.translatedText})` : ''}`
      ),
    ];
    if (session.aiSummary?.summary) {
      lines.push('', '--- Resumen ---', session.aiSummary.summary);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `senavoz-${session.roomCode.toLowerCase()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyTranscript = async (session: CallSessionRecord) => {
    const text = session.messages.map((m) => `${m.sender}: ${m.text}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(session.id);
      window.setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // ignore clipboard restriction
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-20 lg:pb-10">
      {/* Encabezado y resumen de estado */}
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#10243A] dark:text-[#EAF0F6] text-balance">
            Centro de comunicación accesible
          </h1>
          <p className="mt-1.5 text-sm sm:text-base text-[#566677] dark:text-[#93A3B5]">
            Configura tu rol, verifica tu cámara antes de entrar y gestiona salas de hasta 3 personas con subtítulos, voz e historial inteligente.
          </p>
        </div>
        {inCall && (
          <button
            type="button"
            onClick={onOpenActiveCall}
            className="inline-flex items-center gap-2 rounded-lg bg-[#16A34A] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 whitespace-nowrap shrink-0 min-h-[42px]"
          >
            <Video className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Ir a la llamada activa</span>
          </button>
        )}
      </section>

      {/* Franja de métricas en tiempo real (tabular-nums) */}
      <section aria-label="Resumen de actividad" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-[#D3DBE3] dark:border-[#26384D] bg-white dark:bg-[#142233] p-4">
          <p className="text-xs font-medium text-[#566677] dark:text-[#93A3B5]">Sesiones guardadas</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-[#10243A] dark:text-[#EAF0F6]">
            {sessions.length}
          </p>
        </div>
        <div className="rounded-xl border border-[#D3DBE3] dark:border-[#26384D] bg-white dark:bg-[#142233] p-4">
          <p className="text-xs font-medium text-[#566677] dark:text-[#93A3B5]">Mensajes y subtítulos</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-[#10243A] dark:text-[#EAF0F6]">
            {totalMessages}
          </p>
        </div>
        <div className="rounded-xl border border-[#D3DBE3] dark:border-[#26384D] bg-white dark:bg-[#142233] p-4">
          <p className="text-xs font-medium text-[#566677] dark:text-[#93A3B5]">Tiempo acumulado</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-[#10243A] dark:text-[#EAF0F6]">
            {formatDuration(totalSeconds)}
          </p>
        </div>
        <div className="rounded-xl border border-[#D3DBE3] dark:border-[#26384D] bg-white dark:bg-[#142233] p-4">
          <p className="text-xs font-medium text-[#566677] dark:text-[#93A3B5]">Frases rápidas activas</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-[#10243A] dark:text-[#EAF0F6]">
            {quickPhrases.length}
          </p>
        </div>
      </section>

      {/* Bloque principal: Perfil + Lanzador de Salas + Verificador de Cámara */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Columna izquierda: Perfil y Salas */}
        <div className="lg:col-span-7 rounded-xl border border-[#D3DBE3] dark:border-[#26384D] bg-white dark:bg-[#142233] p-5 sm:p-6 flex flex-col justify-between gap-6">
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-bold text-[#10243A] dark:text-[#EAF0F6]">
                Tu perfil e inicio de sala
              </h2>
              <p className="mt-0.5 text-sm text-[#566677] dark:text-[#93A3B5]">
                Elige cómo participas hoy para adaptar automáticamente subtítulos y síntesis de voz.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="dash-name"
                  className="block text-xs font-semibold text-[#566677] dark:text-[#93A3B5] mb-1.5"
                >
                  Tu nombre
                </label>
                <input
                  id="dash-name"
                  type="text"
                  maxLength={20}
                  value={profile.name}
                  onChange={(e) => onUpdateProfile({ ...profile, name: e.target.value })}
                  placeholder="Ej. Camila, Mateo"
                  className="w-full rounded-lg border border-[#D3DBE3] dark:border-[#26384D] bg-[#F4F6F8] dark:bg-[#0C1520] px-3.5 py-2.5 text-sm text-[#10243A] dark:text-[#EAF0F6]"
                />
              </div>

              <div>
                <label
                  htmlFor="dash-dialect"
                  className="block text-xs font-semibold text-[#566677] dark:text-[#93A3B5] mb-1.5"
                >
                  Variante de voz y dictado
                </label>
                <select
                  id="dash-dialect"
                  value={profile.dialect}
                  onChange={(e) =>
                    onUpdateProfile({ ...profile, dialect: e.target.value as SpeechDialect })
                  }
                  className="w-full rounded-lg border border-[#D3DBE3] dark:border-[#26384D] bg-[#F4F6F8] dark:bg-[#0C1520] px-3.5 py-2.5 text-sm text-[#10243A] dark:text-[#EAF0F6]"
                >
                  {DIALECT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <span className="block text-xs font-semibold text-[#566677] dark:text-[#93A3B5] mb-2">
                ¿Quién eres en esta sesión?
              </span>
              <div className="grid grid-cols-2 gap-3" role="group" aria-label="Rol en la llamada">
                <button
                  type="button"
                  aria-pressed={profile.role === 'sorda'}
                  onClick={() => onUpdateProfile({ ...profile, role: 'sorda' })}
                  className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold transition-colors min-h-[44px] whitespace-nowrap ${
                    profile.role === 'sorda'
                      ? 'border-[#1B4F8A] bg-[#1B4F8A] text-white dark:border-[#8FBBF2] dark:bg-[#8FBBF2] dark:text-[#0C1520]'
                      : 'border-[#D3DBE3] dark:border-[#26384D] text-[#10243A] dark:text-[#EAF0F6] hover:bg-[#F4F6F8] dark:hover:bg-[#1D2F45]'
                  }`}
                >
                  <UserCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Soy persona sorda</span>
                </button>
                <button
                  type="button"
                  aria-pressed={profile.role === 'oyente'}
                  onClick={() => onUpdateProfile({ ...profile, role: 'oyente' })}
                  className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold transition-colors min-h-[44px] whitespace-nowrap ${
                    profile.role === 'oyente'
                      ? 'border-[#1B4F8A] bg-[#1B4F8A] text-white dark:border-[#8FBBF2] dark:bg-[#8FBBF2] dark:text-[#0C1520]'
                      : 'border-[#D3DBE3] dark:border-[#26384D] text-[#10243A] dark:text-[#EAF0F6] hover:bg-[#F4F6F8] dark:hover:bg-[#1D2F45]'
                  }`}
                >
                  <Mic className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Soy oyente</span>
                </button>
              </div>
            </div>

            <div>
              <span className="block text-xs font-semibold text-[#566677] dark:text-[#93A3B5] mb-2">
                Contexto de la sala
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {ROOM_PRESETS.map((preset) => {
                  const active = selectedPreset === preset.title;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setSelectedPreset(preset.title)}
                      className={`text-left rounded-lg border p-3 transition-colors ${
                        active
                          ? 'border-[#1B4F8A] bg-[#1B4F8A]/8 dark:border-[#8FBBF2] dark:bg-[#8FBBF2]/10'
                          : 'border-[#D3DBE3] dark:border-[#26384D] hover:bg-[#F4F6F8] dark:hover:bg-[#1D2F45]'
                      }`}
                    >
                      <p className="text-sm font-semibold text-[#10243A] dark:text-[#EAF0F6]">
                        {preset.title}
                      </p>
                      <p className="mt-1 text-xs text-[#566677] dark:text-[#93A3B5] leading-snug">
                        {preset.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-[#D3DBE3] dark:border-[#26384D] space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                disabled={isConnecting || inCall}
                onClick={() => onCreateRoom(generateRoomCode(4), selectedPreset)}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#1B4F8A] dark:bg-[#8FBBF2] px-5 py-2.5 text-sm font-semibold text-white dark:text-[#0C1520] hover:opacity-90 disabled:opacity-50 min-h-[44px] whitespace-nowrap"
              >
                <Video className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{isConnecting ? 'Conectando sala…' : 'Crear nueva sala'}</span>
              </button>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  onJoinRoom(joinCode);
                }}
                className="flex flex-1 gap-2"
              >
                <input
                  type="text"
                  maxLength={12}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="Código (ej. A7K2)"
                  aria-label="Código de la sala"
                  className="flex-1 min-w-0 rounded-lg border border-[#D3DBE3] dark:border-[#26384D] bg-[#F4F6F8] dark:bg-[#0C1520] px-3.5 py-2.5 font-mono text-sm uppercase tracking-wider text-[#10243A] dark:text-[#EAF0F6]"
                />
                <button
                  type="submit"
                  disabled={isConnecting || inCall}
                  className="rounded-lg border border-[#1B4F8A] dark:border-[#8FBBF2] px-4 py-2.5 text-sm font-semibold text-[#1B4F8A] dark:text-[#8FBBF2] hover:bg-[#1B4F8A]/10 dark:hover:bg-[#8FBBF2]/10 disabled:opacity-50 min-h-[44px] whitespace-nowrap shrink-0"
                >
                  Entrar
                </button>
              </form>
            </div>

            {lobbyError && (
              <p role="alert" className="text-sm font-medium text-[#DC2626] dark:text-red-400">
                {lobbyError}
              </p>
            )}
          </div>
        </div>

        {/* Columna derecha: Verificador de cámara y audio previo */}
        <div className="lg:col-span-5 rounded-xl border border-[#D3DBE3] dark:border-[#26384D] bg-white dark:bg-[#142233] p-5 sm:p-6 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-[#10243A] dark:text-[#EAF0F6]">
                Prueba previa de equipo
              </h2>
              <span className="text-xs text-[#566677] dark:text-[#93A3B5]">
                {testCamActive ? 'Cámara activa' : 'En espera'}
              </span>
            </div>
            <p className="text-sm text-[#566677] dark:text-[#93A3B5]">
              Asegúrate de tener buena iluminación para lengua de señas o lectura labial antes de unirte.
            </p>

            <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-[#0A141F] border border-[#D3DBE3] dark:border-[#26384D] flex items-center justify-center">
              {testCamActive ? (
                <video
                  ref={testVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-cover scale-x-[-1]"
                />
              ) : (
                <div className="text-center px-6 py-8 text-[#93A3B5]">
                  <Camera className="mx-auto h-8 w-8 mb-2 opacity-80" aria-hidden="true" />
                  <p className="text-sm">Activa la vista previa para comprobar tu encuadre</p>
                </div>
              )}
            </div>

            {testCamError && (
              <p className="text-xs font-medium text-[#D97706]">{testCamError}</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={toggleCameraPreview}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-[#D3DBE3] dark:border-[#26384D] px-3.5 py-2.5 text-sm font-semibold text-[#10243A] dark:text-[#EAF0F6] hover:bg-[#F4F6F8] dark:hover:bg-[#1D2F45] min-h-[42px] whitespace-nowrap"
            >
              <Camera className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{testCamActive ? 'Detener cámara' : 'Probar cámara'}</span>
            </button>

            <button
              type="button"
              onClick={handleTestVoice}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-[#D3DBE3] dark:border-[#26384D] px-3.5 py-2.5 text-sm font-semibold text-[#10243A] dark:text-[#EAF0F6] hover:bg-[#F4F6F8] dark:hover:bg-[#1D2F45] min-h-[42px] whitespace-nowrap"
            >
              <Volume2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Probar voz ({settings.ttsRate.toFixed(1)}x)</span>
            </button>
          </div>
        </div>
      </section>

      {/* Historial de sesiones y resúmenes */}
      <section className="rounded-xl border border-[#D3DBE3] dark:border-[#26384D] bg-white dark:bg-[#142233] p-5 sm:p-6 space-y-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#10243A] dark:text-[#EAF0F6]">
              Historial de sesiones y transcripciones
            </h2>
            <p className="text-sm text-[#566677] dark:text-[#93A3B5]">
              Revisa conversaciones pasadas, genera resúmenes con inteligencia artificial o descarga la transcripción.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#566677]"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar sala o palabra…"
                aria-label="Buscar en historial"
                className="rounded-lg border border-[#D3DBE3] dark:border-[#26384D] bg-[#F4F6F8] dark:bg-[#0C1520] pl-9 pr-3 py-2 text-sm text-[#10243A] dark:text-[#EAF0F6] w-48 sm:w-56"
              />
            </div>

            <div className="flex items-center gap-1 rounded-lg bg-[#F4F6F8] dark:bg-[#0C1520] p-1">
              {(
                [
                  { id: 'all', label: 'Todas' },
                  { id: 'sorda', label: 'Sorda' },
                  { id: 'oyente', label: 'Oyente' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setHistoryFilter(tab.id)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    historyFilter === tab.id
                      ? 'bg-white dark:bg-[#142233] text-[#10243A] dark:text-[#EAF0F6] shadow-sm'
                      : 'text-[#566677] dark:text-[#93A3B5]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filteredSessions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#D3DBE3] dark:border-[#26384D] px-6 py-10 text-center">
            <FileText className="mx-auto h-8 w-8 text-[#566677] dark:text-[#93A3B5] mb-2" aria-hidden="true" />
            <p className="text-sm font-semibold text-[#10243A] dark:text-[#EAF0F6]">
              {sessions.length === 0
                ? 'Aún no hay sesiones guardadas'
                : 'Ninguna sesión coincide con tu filtro'}
            </p>
            <p className="mt-1 text-sm text-[#566677] dark:text-[#93A3B5]">
              Cuando termines una videollamada en SeñaVoz, su transcripción aparecerá aquí automáticamente.
            </p>
            {sessions.length === 0 && (
              <button
                type="button"
                onClick={() => onCreateRoom(generateRoomCode(4), selectedPreset)}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#1B4F8A] dark:bg-[#8FBBF2] px-4 py-2 text-sm font-semibold text-white dark:text-[#0C1520]"
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                <span>Iniciar primera sala</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 divide-y divide-[#D3DBE3] dark:divide-[#26384D] border border-[#D3DBE3] dark:border-[#26384D] rounded-lg overflow-hidden">
              {filteredSessions.map((session) => {
                const selected = activeSessionDetail?.id === session.id;
                return (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => setSelectedSessionId(session.id)}
                    className={`w-full text-left px-4 py-3.5 transition-colors ${
                      selected
                        ? 'bg-[#1B4F8A]/8 dark:bg-[#8FBBF2]/12'
                        : 'hover:bg-[#F4F6F8] dark:hover:bg-[#1D2F45]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm font-bold text-[#10243A] dark:text-[#EAF0F6]">
                        Sala {session.roomCode}
                      </span>
                      <span className="font-mono text-xs tabular-nums text-[#566677] dark:text-[#93A3B5]">
                        {formatDuration(session.durationSeconds)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm font-medium text-[#10243A] dark:text-[#EAF0F6] truncate">
                      {session.presetTitle}
                    </p>
                    <p className="mt-1 text-xs text-[#566677] dark:text-[#93A3B5]">
                      {new Date(session.startedAt).toLocaleDateString('es-CO')} ·{' '}
                      {session.roleUsed === 'sorda' ? 'Persona sorda' : 'Oyente'} ·{' '}
                      <span className="tabular-nums">{session.messages.length}</span> mensajes
                    </p>
                  </button>
                );
              })}
            </div>

            {activeSessionDetail && (
              <div className="lg:col-span-7 flex flex-col justify-between gap-4 border border-[#D3DBE3] dark:border-[#26384D] rounded-lg p-4 sm:p-5 bg-[#F4F6F8]/60 dark:bg-[#0C1520]/60">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-[#10243A] dark:text-[#EAF0F6]">
                        Sala {activeSessionDetail.roomCode} — {activeSessionDetail.presetTitle}
                      </h3>
                      <p className="text-xs text-[#566677] dark:text-[#93A3B5]">
                        {new Date(activeSessionDetail.startedAt).toLocaleString('es-CO')} ·{' '}
                        {activeSessionDetail.participants.length > 0
                          ? `Con: ${activeSessionDetail.participants.join(', ')}`
                          : 'Sesión individual'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleGenerateSummary(activeSessionDetail)}
                        disabled={summarizingId === activeSessionDetail.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#1B4F8A] dark:bg-[#8FBBF2] px-3 py-1.5 text-xs font-semibold text-white dark:text-[#0C1520] hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
                      >
                        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>
                          {summarizingId === activeSessionDetail.id
                            ? 'Resumiendo…'
                            : activeSessionDetail.aiSummary
                              ? 'Regenerar resumen'
                              : 'Resumir con IA'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopyTranscript(activeSessionDetail)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#D3DBE3] dark:border-[#26384D] bg-white dark:bg-[#142233] px-3 py-1.5 text-xs font-semibold text-[#10243A] dark:text-[#EAF0F6] whitespace-nowrap"
                      >
                        {copiedId === activeSessionDetail.id ? (
                          <Check className="h-3.5 w-3.5 text-[#16A34A]" aria-hidden="true" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        <span>{copiedId === activeSessionDetail.id ? 'Copiado' : 'Copiar'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleExportTxt(activeSessionDetail)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#D3DBE3] dark:border-[#26384D] bg-white dark:bg-[#142233] px-3 py-1.5 text-xs font-semibold text-[#10243A] dark:text-[#EAF0F6] whitespace-nowrap"
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Exportar .txt</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onDeleteSession(activeSessionDetail.id)}
                        aria-label="Eliminar sesión"
                        className="inline-flex items-center justify-center rounded-lg border border-[#D3DBE3] dark:border-[#26384D] bg-white dark:bg-[#142233] p-1.5 text-[#DC2626] hover:bg-red-50 dark:hover:bg-red-950/30"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {summaryError && (
                    <p className="text-xs font-medium text-[#DC2626] dark:text-red-400">
                      {summaryError}
                    </p>
                  )}

                  {activeSessionDetail.aiSummary && (
                    <div className="rounded-lg border border-[#D3DBE3] dark:border-[#26384D] bg-white dark:bg-[#142233] p-4 space-y-2.5">
                      <p className="text-xs font-bold text-[#1B4F8A] dark:text-[#8FBBF2]">
                        Resumen de conversación
                      </p>
                      <p className="text-sm text-[#10243A] dark:text-[#EAF0F6]">
                        {activeSessionDetail.aiSummary.summary}
                      </p>
                      {activeSessionDetail.aiSummary.keyPoints.length > 0 && (
                        <ul className="list-disc pl-5 text-xs text-[#566677] dark:text-[#93A3B5] space-y-1">
                          {activeSessionDetail.aiSummary.keyPoints.map((point, idx) => (
                            <li key={idx}>{point}</li>
                          ))}
                        </ul>
                      )}
                      {activeSessionDetail.aiSummary.actionItems.length > 0 && (
                        <div className="pt-1 border-t border-[#D3DBE3] dark:border-[#26384D]">
                          <p className="text-xs font-semibold text-[#10243A] dark:text-[#EAF0F6] mb-1">
                            Acuerdos o pasos siguientes:
                          </p>
                          <ul className="list-disc pl-5 text-xs text-[#566677] dark:text-[#93A3B5] space-y-1">
                            {activeSessionDetail.aiSummary.actionItems.map((item, idx) => (
                              <li key={idx}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                    {activeSessionDetail.messages.length === 0 ? (
                      <p className="text-xs text-[#566677] dark:text-[#93A3B5]">
                        No hubo mensajes escritos ni subtitulados en esta sesión.
                      </p>
                    ) : (
                      activeSessionDetail.messages.map((msg) => (
                        <div
                          key={msg.id}
                          className="rounded-lg border border-[#D3DBE3] dark:border-[#26384D] bg-white dark:bg-[#142233] px-3 py-2 text-sm"
                        >
                          <div className="flex items-center justify-between gap-2 text-xs text-[#566677] dark:text-[#93A3B5]">
                            <span className="font-semibold text-[#10243A] dark:text-[#EAF0F6]">
                              {msg.sender}
                            </span>
                            <span className="font-mono tabular-nums">{msg.timestamp}</span>
                          </div>
                          <p className="mt-0.5 text-[#10243A] dark:text-[#EAF0F6]">{msg.text}</p>
                          {msg.translatedText && (
                            <p className="mt-1 text-xs italic text-[#1B4F8A] dark:text-[#8FBBF2]">
                              Traducción: {msg.translatedText}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
