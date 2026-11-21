import { useEffect, useRef, useState } from 'react';
import {
  BellRing,
  BookOpen,
  Camera,
  CameraOff,
  Check,
  Copy,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  PhoneOff,
  Send,
  Sparkles,
  Volume2,
  VolumeX,
  Wand2,
} from 'lucide-react';
import type {
  AccessibilitySettings,
  CallMessage,
  QuickPhrase,
  RemoteParticipant,
  UserProfile,
} from '../types/senavoz';
import { formatDuration, generateRoomCode } from '../utils/speech';
import {
  assistTextWithAI,
  fetchSmartRepliesAI,
  lookupExternalTerm,
  type DictionaryResponse,
} from '../services/apiClient';

interface RemoteTileProps {
  participant: RemoteParticipant;
}

function RemoteVideoTile({ participant }: RemoteTileProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current && participant.stream) {
      videoRef.current.srcObject = participant.stream;
    }
  }, [participant.stream]);

  const roleLabel =
    participant.role === 'sorda'
      ? 'Persona sorda'
      : participant.role === 'oyente'
        ? 'Oyente'
        : 'Participante';

  return (
    <div className="relative h-full w-full min-h-0 min-w-0 bg-[#0A141F] overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="h-full w-full object-cover"
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 py-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-white truncate">
          {participant.name || roleLabel}
        </span>
        <span className="text-[11px] text-white/80 whitespace-nowrap shrink-0">
          {participant.isTyping ? 'Escribiendo…' : roleLabel}
        </span>
      </div>
    </div>
  );
}

interface LiveCallViewProps {
  profile: UserProfile;
  settings: AccessibilitySettings;
  onUpdateSettings: (next: AccessibilitySettings) => void;
  quickPhrases: QuickPhrase[];
  inCall: boolean;
  isConnecting: boolean;
  isHost: boolean;
  roomCode: string;
  presetTitle: string;
  statusText: string;
  lobbyError: string;
  captionText: string;
  captionTranslation: string;
  messages: CallMessage[];
  participants: RemoteParticipant[];
  localStream: MediaStream | null;
  cameraMuted: boolean;
  listening: boolean;
  audioLevel: number;
  elapsedSeconds: number;
  visualAlertPulse: boolean;
  onCreateRoom: (code: string, presetTitle: string) => void;
  onJoinRoom: (code: string) => void;
  onLeaveRoom: () => void;
  onToggleListening: () => void;
  onToggleCamera: () => void;
  onSendMessage: (text: string) => void;
  onSendAttentionPing: (note?: string) => void;
  onNotifyTyping: (isTyping: boolean) => void;
}

export function LiveCallView({
  profile,
  settings,
  onUpdateSettings,
  quickPhrases,
  inCall,
  isConnecting,
  isHost,
  roomCode,
  presetTitle,
  statusText,
  lobbyError,
  captionText,
  captionTranslation,
  messages,
  participants,
  localStream,
  cameraMuted,
  listening,
  audioLevel,
  elapsedSeconds,
  visualAlertPulse,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
  onToggleListening,
  onToggleCamera,
  onSendMessage,
  onSendAttentionPing,
  onNotifyTyping,
}: LiveCallViewProps) {
  const [draft, setDraft] = useState('');
  const [quickJoinCode, setQuickJoinCode] = useState('');
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [smartReplies, setSmartReplies] = useState<string[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [clarifying, setClarifying] = useState(false);
  const [simplifiedCaption, setSimplifiedCaption] = useState('');
  const [simplifyingCaption, setSimplifyingCaption] = useState(false);
  const [aiError, setAiError] = useState('');
  const [termQuery, setTermQuery] = useState('');
  const [termResult, setTermResult] = useState<DictionaryResponse | null>(null);
  const [termError, setTermError] = useState('');
  const [lookingUpTerm, setLookingUpTerm] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const typingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, inCall]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    setSimplifiedCaption('');
  }, [captionText]);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const visibleVideoPeers = participants.filter((p) => p.hasVideo);

  const handleCopyInvite = async () => {
    const url = `${window.location.origin}/?sala=${roomCode.toUpperCase()}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedInvite(true);
      window.setTimeout(() => setCopiedInvite(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleToggleFullscreen = () => {
    try {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else {
        (stageContainerRef.current || document.documentElement)
          .requestFullscreen({ navigationUI: 'hide' })
          .catch(() => {});
      }
    } catch {
      // ignore
    }
  };

  const handleDraftChange = (val: string) => {
    setDraft(val);
    onNotifyTyping(val.trim().length > 0);
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => {
      onNotifyTyping(false);
    }, 1500);
  };

  const handleSend = () => {
    if (!draft.trim()) return;
    onSendMessage(draft);
    setDraft('');
  };

  const handleClarifyDraft = async () => {
    if (!draft.trim()) return;
    setClarifying(true);
    setAiError('');
    try {
      const improved = await assistTextWithAI(
        'clarify',
        draft,
        profile.role || 'sorda'
      );
      if (improved) setDraft(improved);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'No se pudo clarificar el borrador.');
    } finally {
      setClarifying(false);
    }
  };

  const handleSimplifyCaption = async () => {
    if (!captionText.trim()) return;
    setSimplifyingCaption(true);
    setAiError('');
    try {
      const simple = await assistTextWithAI(
        'simplify',
        captionText,
        profile.role || 'sorda'
      );
      setSimplifiedCaption(simple);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'No se pudo simplificar el subtítulo.');
    } finally {
      setSimplifyingCaption(false);
    }
  };

  const handleLoadSmartReplies = async () => {
    if (messages.length === 0) {
      setAiError('Espera o escribe al menos un mensaje para sugerir respuestas.');
      return;
    }
    setLoadingReplies(true);
    setAiError('');
    try {
      const replies = await fetchSmartRepliesAI(
        messages.slice(-8).map((m) => ({ sender: m.sender, text: m.text })),
        profile.role || 'sorda'
      );
      setSmartReplies(replies);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'No se pudieron sugerir respuestas.');
    } finally {
      setLoadingReplies(false);
    }
  };

  const handleLookupTerm = async (termToSearch?: string) => {
    const clean = (termToSearch ?? termQuery).trim();
    if (!clean) return;
    setLookingUpTerm(true);
    setTermError('');
    try {
      const res = await lookupExternalTerm(clean, profile.dialect.startsWith('en') ? 'en' : 'es');
      setTermResult(res);
    } catch (err) {
      setTermResult(null);
      setTermError(err instanceof Error ? err.message : 'No se encontró el término.');
    } finally {
      setLookingUpTerm(false);
    }
  };

  if (!inCall) {
    return (
      <div className="mx-auto max-w-2xl py-8 pb-24">
        <div className="rounded-xl border border-[#D3DBE3] dark:border-[#26384D] bg-white dark:bg-[#142233] p-6 sm:p-8 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-[#10243A] dark:text-[#EAF0F6]">
              No hay una videollamada activa
            </h1>
            <p className="mt-1.5 text-sm text-[#566677] dark:text-[#93A3B5]">
              Crea una sala nueva en un clic o ingresa un código compartido para conectarte en tiempo real.
            </p>
          </div>

          {!profile.role && (
            <div className="rounded-lg border border-[#F2B632] bg-[#F2B632]/10 p-4 text-sm text-[#10243A] dark:text-[#EAF0F6]">
              Antes de entrar, selecciona tu rol en el Panel principal o directamente aquí:
              <div className="mt-3 flex gap-2">
                <span className="text-xs text-[#566677] dark:text-[#93A3B5]">
                  Ve a Panel principal para elegir "Soy persona sorda" o "Soy oyente".
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              disabled={isConnecting}
              onClick={() => onCreateRoom(generateRoomCode(4), 'Sala rápida')}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#1B4F8A] dark:bg-[#8FBBF2] px-5 py-2.5 text-sm font-semibold text-white dark:text-[#0C1520] hover:opacity-90 disabled:opacity-50 min-h-[44px] whitespace-nowrap"
            >
              <span>{isConnecting ? 'Conectando…' : 'Crear sala ahora'}</span>
            </button>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                onJoinRoom(quickJoinCode);
              }}
              className="flex flex-1 gap-2"
            >
              <input
                type="text"
                maxLength={12}
                value={quickJoinCode}
                onChange={(e) => setQuickJoinCode(e.target.value.toUpperCase())}
                placeholder="Código de sala"
                aria-label="Código de sala"
                className="flex-1 min-w-0 rounded-lg border border-[#D3DBE3] dark:border-[#26384D] bg-[#F4F6F8] dark:bg-[#0C1520] px-3.5 py-2.5 font-mono text-sm uppercase tracking-wider text-[#10243A] dark:text-[#EAF0F6]"
              />
              <button
                type="submit"
                disabled={isConnecting}
                className="rounded-lg border border-[#1B4F8A] dark:border-[#8FBBF2] px-4 py-2.5 text-sm font-semibold text-[#1B4F8A] dark:text-[#8FBBF2] min-h-[44px] whitespace-nowrap"
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
    );
  }

  return (
    <div
      ref={stageContainerRef}
      className={`mx-auto max-w-6xl space-y-4 pb-24 lg:pb-8 rounded-xl transition-shadow duration-200 ${
        visualAlertPulse ? 'ring-4 ring-[#F2B632]' : ''
      }`}
    >
      {/* Cabecera de sala activa */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#D3DBE3] dark:border-[#26384D] bg-white dark:bg-[#142233] px-4 py-3">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <span className="font-mono text-sm font-bold text-[#1B4F8A] dark:text-[#8FBBF2]">
            SALA {roomCode.toUpperCase()}
          </span>
          <span className="text-[#566677] dark:text-[#93A3B5]" aria-hidden="true">
            ·
          </span>
          <span className="text-sm font-medium text-[#10243A] dark:text-[#EAF0F6] truncate">
            {presetTitle}
          </span>
          <span className="text-[#566677] dark:text-[#93A3B5]" aria-hidden="true">
            ·
          </span>
          <span className="font-mono text-xs tabular-nums text-[#566677] dark:text-[#93A3B5]">
            {formatDuration(elapsedSeconds)}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopyInvite}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#D3DBE3] dark:border-[#26384D] px-3 py-1.5 text-xs font-semibold text-[#10243A] dark:text-[#EAF0F6] hover:bg-[#F4F6F8] dark:hover:bg-[#1D2F45] whitespace-nowrap min-h-[36px]"
          >
            {copiedInvite ? (
              <Check className="h-3.5 w-3.5 text-[#16A34A]" aria-hidden="true" />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span>{copiedInvite ? 'Enlace copiado' : 'Copiar invitación'}</span>
          </button>

          <button
            type="button"
            onClick={handleToggleFullscreen}
            aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#D3DBE3] dark:border-[#26384D] px-3 py-1.5 text-xs font-semibold text-[#10243A] dark:text-[#EAF0F6] hover:bg-[#F4F6F8] dark:hover:bg-[#1D2F45] whitespace-nowrap min-h-[36px]"
          >
            {isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">
              {isFullscreen ? 'Salir pantalla' : 'Pantalla completa'}
            </span>
          </button>

          <button
            type="button"
            onClick={onLeaveRoom}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#DC2626] px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 whitespace-nowrap min-h-[36px]"
          >
            <PhoneOff className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Salir y guardar</span>
          </button>
        </div>
      </div>

      {/* Layout principal de videollamada: Escenario + Chat lateral */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Columna izquierda: Video, Subtítulos, Controles, Frases rápidas */}
        <div className="lg:col-span-7 flex flex-col gap-3">
          {/* Escenario de video */}
          <div className="relative h-[240px] sm:h-[320px] rounded-xl overflow-hidden border border-[#D3DBE3] dark:border-[#26384D] bg-[#0A141F]">
            {visibleVideoPeers.length > 0 ? (
              <div
                className="grid h-full w-full gap-0.5"
                style={{
                  gridTemplateColumns: `repeat(${visibleVideoPeers.length}, minmax(0, 1fr))`,
                }}
              >
                {visibleVideoPeers.map((peer) => (
                  <RemoteVideoTile key={peer.id} participant={peer} />
                ))}
              </div>
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center text-[#C9D6E3]">
                {participants.length > 0 ? (
                  <p className="text-sm">Conectando señal de video…</p>
                ) : isHost ? (
                  <>
                    <p className="text-sm">Esperando a las demás personas. Comparte el código:</p>
                    <p className="mt-2 font-mono text-3xl font-bold tracking-[0.18em] text-[#F2B632]">
                      {roomCode.toUpperCase()}
                    </p>
                  </>
                ) : (
                  <p className="text-sm">No hay nadie más conectado en la sala todavía.</p>
                )}
              </div>
            )}

            {/* Auto-vista local */}
            {localStream && (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`absolute top-3 right-3 z-10 h-24 sm:h-28 aspect-[3/4] rounded-lg border-2 border-[#F2B632] bg-black object-cover scale-x-[-1] ${
                  cameraMuted ? 'opacity-40' : 'opacity-100'
                }`}
              />
            )}

            {/* Indicador visual de voz activa para personas sordas */}
            {profile.role === 'oyente' && listening && (
              <div
                aria-label="Nivel de voz detectado"
                className="absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-md bg-black/75 px-2.5 py-1.5"
              >
                <Mic className="h-3.5 w-3.5 text-[#F2B632]" aria-hidden="true" />
                <div className="h-1.5 w-20 rounded-full bg-white/20 overflow-hidden">
                  <div
                    className="h-full bg-[#F2B632] transition-all duration-75"
                    style={{ width: `${audioLevel}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Panel de subtítulos en vivo */}
          <div className="rounded-xl border border-[#D3DBE3] dark:border-[#26384D] bg-white dark:bg-[#142233] p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#566677] dark:text-[#93A3B5]">
                Subtítulos en vivo
              </span>
              {captionText && (
                <button
                  type="button"
                  onClick={handleSimplifyCaption}
                  disabled={simplifyingCaption}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#1B4F8A] dark:text-[#8FBBF2] hover:underline whitespace-nowrap"
                >
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{simplifyingCaption ? 'Adaptando…' : 'Lectura fácil'}</span>
                </button>
              )}
            </div>

            <div
              aria-live="polite"
              style={{ fontSize: `${settings.captionSize}px` }}
              className="min-h-[3.2em] max-h-[5.5em] overflow-y-auto leading-snug text-[#10243A] dark:text-[#EAF0F6]"
            >
              {captionText || (
                <span className="text-sm text-[#566677] dark:text-[#93A3B5]">
                  Aquí aparecerán los subtítulos de voz en tiempo real y avisos visuales.
                </span>
              )}
            </div>

            {captionTranslation && (
              <p className="text-sm italic text-[#1B4F8A] dark:text-[#8FBBF2] pt-1 border-t border-[#D3DBE3] dark:border-[#26384D]">
                Traducción: {captionTranslation}
              </p>
            )}

            {simplifiedCaption && (
              <div className="rounded-lg bg-[#F4F6F8] dark:bg-[#0C1520] p-2.5 text-sm text-[#10243A] dark:text-[#EAF0F6]">
                <span className="text-xs font-semibold text-[#1B4F8A] dark:text-[#8FBBF2] block mb-0.5">
                  Versión en lectura fácil:
                </span>
                {simplifiedCaption}
              </div>
            )}
          </div>

          {/* Barra de controles de llamada */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#D3DBE3] dark:border-[#26384D] bg-white dark:bg-[#142233] p-3">
            {profile.role !== 'sorda' && (
              <button
                type="button"
                aria-pressed={listening}
                onClick={onToggleListening}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold min-h-[40px] whitespace-nowrap ${
                  listening
                    ? 'border-[#1B4F8A] bg-[#1B4F8A] text-white dark:border-[#8FBBF2] dark:bg-[#8FBBF2] dark:text-[#0C1520]'
                    : 'border-[#D3DBE3] dark:border-[#26384D] text-[#10243A] dark:text-[#EAF0F6]'
                }`}
              >
                {listening ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                <span>{listening ? 'Pausar subtítulos' : 'Subtitular mi voz'}</span>
              </button>
            )}

            {profile.role !== 'sorda' && (
              <button
                type="button"
                aria-pressed={settings.voiceEnabled}
                onClick={() =>
                  onUpdateSettings({ ...settings, voiceEnabled: !settings.voiceEnabled })
                }
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold min-h-[40px] whitespace-nowrap ${
                  settings.voiceEnabled
                    ? 'border-[#1B4F8A] bg-[#1B4F8A] text-white dark:border-[#8FBBF2] dark:bg-[#8FBBF2] dark:text-[#0C1520]'
                    : 'border-[#D3DBE3] dark:border-[#26384D] text-[#10243A] dark:text-[#EAF0F6]'
                }`}
              >
                {settings.voiceEnabled ? (
                  <Volume2 className="h-4 w-4" />
                ) : (
                  <VolumeX className="h-4 w-4" />
                )}
                <span>{settings.voiceEnabled ? 'Texto + voz' : 'Solo texto'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onToggleCamera}
              disabled={!localStream}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#D3DBE3] dark:border-[#26384D] px-3 py-2 text-xs font-semibold text-[#10243A] dark:text-[#EAF0F6] disabled:opacity-50 min-h-[40px] whitespace-nowrap"
            >
              {cameraMuted ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
              <span>{cameraMuted ? 'Activar cámara' : 'Pausar cámara'}</span>
            </button>

            <button
              type="button"
              onClick={() => onSendAttentionPing('Solicita tu atención visual')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#F2B632] bg-[#F2B632]/15 px-3 py-2 text-xs font-semibold text-[#10243A] dark:text-[#EAF0F6] min-h-[40px] whitespace-nowrap"
            >
              <BellRing className="h-4 w-4 text-[#D97706]" aria-hidden="true" />
              <span>Pedir atención</span>
            </button>

            <div className="flex items-center gap-1 ml-auto">
              <button
                type="button"
                aria-label="Reducir tamaño de subtítulos"
                onClick={() =>
                  onUpdateSettings({
                    ...settings,
                    captionSize: Math.max(16, settings.captionSize - 4),
                  })
                }
                className="rounded-lg border border-[#D3DBE3] dark:border-[#26384D] px-3 py-2 text-xs font-bold text-[#10243A] dark:text-[#EAF0F6] min-h-[40px]"
              >
                A−
              </button>
              <button
                type="button"
                aria-label="Aumentar tamaño de subtítulos"
                onClick={() =>
                  onUpdateSettings({
                    ...settings,
                    captionSize: Math.min(44, settings.captionSize + 4),
                  })
                }
                className="rounded-lg border border-[#D3DBE3] dark:border-[#26384D] px-3 py-2 text-xs font-bold text-[#10243A] dark:text-[#EAF0F6] min-h-[40px]"
              >
                A+
              </button>
            </div>
          </div>

          {/* Tablero interactivo de frases rápidas */}
          <div className="rounded-xl border border-[#D3DBE3] dark:border-[#26384D] bg-white dark:bg-[#142233] p-3.5 space-y-2">
            <p className="text-xs font-semibold text-[#566677] dark:text-[#93A3B5]">
              Frases rápidas (1 toque para enviar)
            </p>
            <div className="flex flex-wrap gap-2">
              {quickPhrases.map((phrase) => (
                <button
                  key={phrase.id}
                  type="button"
                  onClick={() => onSendMessage(phrase.text)}
                  className="rounded-lg border border-[#D3DBE3] dark:border-[#26384D] bg-[#F4F6F8] dark:bg-[#0C1520] px-3 py-1.5 text-xs font-semibold text-[#10243A] dark:text-[#EAF0F6] hover:border-[#1B4F8A] dark:hover:border-[#8FBBF2] transition-colors whitespace-nowrap min-h-[36px]"
                >
                  {phrase.label}
                </button>
              ))}
            </div>
          </div>

          {statusText && (
            <p className="text-xs text-[#566677] dark:text-[#93A3B5] px-1">{statusText}</p>
          )}
        </div>

        {/* Columna derecha: Chat en vivo, Asistente IA y Consulta rápida de diccionario */}
        <div className="lg:col-span-5 flex flex-col rounded-xl border border-[#D3DBE3] dark:border-[#26384D] bg-white dark:bg-[#142233] overflow-hidden min-h-[440px]">
          <div className="border-b border-[#D3DBE3] dark:border-[#26384D] px-4 py-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-[#10243A] dark:text-[#EAF0F6]">
              Conversación y asistencia
            </h2>
            <button
              type="button"
              onClick={handleLoadSmartReplies}
              disabled={loadingReplies || messages.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#D3DBE3] dark:border-[#26384D] px-2.5 py-1.5 text-xs font-semibold text-[#1B4F8A] dark:text-[#8FBBF2] disabled:opacity-50 whitespace-nowrap"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{loadingReplies ? 'Pensando…' : 'Sugerir respuestas'}</span>
            </button>
          </div>

          {/* Lista de mensajes */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2.5 max-h-[340px]" aria-live="polite">
            {messages.length === 0 ? (
              <p className="text-sm text-[#566677] dark:text-[#93A3B5] text-center py-8">
                Escribe un mensaje o usa una frase rápida para comenzar la conversación.
              </p>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`max-w-[90%] rounded-lg border px-3 py-2 text-sm ${
                    msg.mine
                      ? 'ml-auto border-[#1B4F8A] dark:border-[#8FBBF2] bg-[#1B4F8A]/8 dark:bg-[#8FBBF2]/12'
                      : msg.kind === 'ping'
                        ? 'border-[#F2B632] bg-[#F2B632]/15'
                        : 'border-[#D3DBE3] dark:border-[#26384D] bg-[#F4F6F8] dark:bg-[#0C1520]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 text-[11px] text-[#566677] dark:text-[#93A3B5]">
                    <span className="font-semibold">{msg.sender}</span>
                    <span className="font-mono tabular-nums">{msg.timestamp}</span>
                  </div>
                  <p className="mt-0.5 text-[#10243A] dark:text-[#EAF0F6] leading-snug">
                    {msg.text}
                  </p>
                  {msg.translatedText && (
                    <p className="mt-1 text-xs italic text-[#1B4F8A] dark:text-[#8FBBF2]">
                      {msg.translatedText}
                    </p>
                  )}
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>

          {/* Sugerencias rápidas de Gemini */}
          {smartReplies.length > 0 && (
            <div className="border-t border-[#D3DBE3] dark:border-[#26384D] px-3 py-2 bg-[#F4F6F8] dark:bg-[#0C1520] space-y-1.5">
              <p className="text-[11px] font-semibold text-[#566677] dark:text-[#93A3B5]">
                Respuestas sugeridas:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {smartReplies.map((reply, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      onSendMessage(reply);
                      setSmartReplies([]);
                    }}
                    className="rounded-lg border border-[#1B4F8A] dark:border-[#8FBBF2] bg-white dark:bg-[#142233] px-2.5 py-1 text-xs font-medium text-[#10243A] dark:text-[#EAF0F6] text-left hover:bg-[#1B4F8A]/10"
                  >
                    {reply}
                  </button>
                ))}
              </div>
            </div>
          )}

          {aiError && (
            <p className="px-4 py-1.5 text-xs font-medium text-[#DC2626] dark:text-red-400 border-t border-[#D3DBE3] dark:border-[#26384D]">
              {aiError}
            </p>
          )}

          {/* Barra de envío y clarificación */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="border-t border-[#D3DBE3] dark:border-[#26384D] p-3 space-y-2"
          >
            <div className="flex gap-2">
              <input
                type="text"
                maxLength={500}
                value={draft}
                onChange={(e) => handleDraftChange(e.target.value)}
                placeholder="Escribe un mensaje…"
                aria-label="Escribe un mensaje"
                className="flex-1 min-w-0 rounded-lg border border-[#D3DBE3] dark:border-[#26384D] bg-[#F4F6F8] dark:bg-[#0C1520] px-3 py-2 text-sm text-[#10243A] dark:text-[#EAF0F6]"
              />
              <button
                type="button"
                onClick={handleClarifyDraft}
                disabled={clarifying || !draft.trim()}
                title="Mejorar redacción con IA"
                className="inline-flex items-center gap-1 rounded-lg border border-[#D3DBE3] dark:border-[#26384D] px-3 py-2 text-xs font-semibold text-[#10243A] dark:text-[#EAF0F6] disabled:opacity-40 whitespace-nowrap min-h-[40px]"
              >
                <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">{clarifying ? '…' : 'Clarificar'}</span>
              </button>
              <button
                type="submit"
                disabled={!draft.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#1B4F8A] dark:bg-[#8FBBF2] px-4 py-2 text-sm font-semibold text-white dark:text-[#0C1520] disabled:opacity-40 whitespace-nowrap min-h-[40px]"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                <span>Enviar</span>
              </button>
            </div>
          </form>

          {/* Mini consulta de diccionario externo dentro de la llamada */}
          <div className="border-t border-[#D3DBE3] dark:border-[#26384D] bg-[#F4F6F8]/60 dark:bg-[#0C1520]/60 p-3 space-y-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleLookupTerm();
              }}
              className="flex items-center gap-2"
            >
              <BookOpen className="h-4 w-4 text-[#566677] shrink-0" aria-hidden="true" />
              <input
                type="text"
                maxLength={80}
                value={termQuery}
                onChange={(e) => setTermQuery(e.target.value)}
                placeholder="Consultar palabra desconocida…"
                aria-label="Consultar palabra en diccionario externo"
                className="flex-1 min-w-0 rounded-lg border border-[#D3DBE3] dark:border-[#26384D] bg-white dark:bg-[#142233] px-2.5 py-1.5 text-xs text-[#10243A] dark:text-[#EAF0F6]"
              />
              <button
                type="submit"
                disabled={lookingUpTerm || !termQuery.trim()}
                className="rounded-lg border border-[#D3DBE3] dark:border-[#26384D] bg-white dark:bg-[#142233] px-3 py-1.5 text-xs font-semibold text-[#10243A] dark:text-[#EAF0F6] whitespace-nowrap"
              >
                {lookingUpTerm ? 'Buscando…' : 'Definir'}
              </button>
            </form>

            {termError && <p className="text-xs text-[#DC2626] dark:text-red-400">{termError}</p>}
            {termResult && (
              <div className="rounded-lg border border-[#D3DBE3] dark:border-[#26384D] bg-white dark:bg-[#142233] p-2.5 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-[#10243A] dark:text-[#EAF0F6]">
                    {termResult.title}
                  </span>
                  <span className="text-[#566677] dark:text-[#93A3B5]">{termResult.provider}</span>
                </div>
                <p className="text-[#566677] dark:text-[#93A3B5] line-clamp-3">
                  {termResult.extract}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
