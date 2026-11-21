import { useCallback, useEffect, useRef, useState } from 'react';
import Peer, { type DataConnection, type MediaConnection } from 'peerjs';
import type {
  AccessibilitySettings,
  CallMessage,
  CallSessionRecord,
  RemoteParticipant,
  UserProfile,
  UserRole,
} from '../types/senavoz';
import {
  getSpeechRecognitionConstructor,
  punctuateSpanish,
  speakText,
  stopSpeaking,
  type BrowserSpeechRecognition,
} from '../utils/speech';
import { translateExternalText } from '../services/apiClient';

const PEER_PREFIX = 'senavoz-';
const MAX_OTHERS = 2;

interface InternalPeerEntry {
  id: string;
  conn: DataConnection | null;
  call: MediaConnection | null;
  role: UserRole | '';
  name: string;
  stream: MediaStream | null;
  hasVideo: boolean;
  isTyping: boolean;
}

interface IncomingPayload {
  k?: string;
  r?: string;
  n?: string;
  ids?: unknown;
  t?: string;
  f?: number;
  v?: boolean;
}

interface UsePeerCallOptions {
  profile: UserProfile;
  settings: AccessibilitySettings;
  onSessionComplete: (record: CallSessionRecord) => void;
  onEnterCall?: () => void;
}

function roleWord(role: UserRole | ''): string {
  if (role === 'sorda') return 'persona sorda';
  if (role === 'oyente') return 'oyente';
  return 'participante';
}

function formatPeerLabel(p: { name: string; role: UserRole | '' }): string {
  const word = roleWord(p.role);
  if (p.name) return `${p.name} (${word})`;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function shortPeerName(p: { name: string; role: UserRole | '' }): string {
  if (p.name) return p.name;
  if (p.role === 'sorda') return 'Persona sorda';
  if (p.role === 'oyente') return 'Oyente';
  return 'Participante';
}

function createBlankStream(): MediaStream {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 120;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0A141F';
    ctx.fillRect(0, 0, 160, 120);
  }
  return canvas.captureStream(1);
}

export function usePeerCall({
  profile,
  settings,
  onSessionComplete,
  onEnterCall,
}: UsePeerCallOptions) {
  const [inCall, setInCall] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [presetTitle, setPresetTitle] = useState('Sala abierta');
  const [statusText, setStatusText] = useState('');
  const [lobbyError, setLobbyError] = useState('');
  const [captionText, setCaptionText] = useState('');
  const [captionTranslation, setCaptionTranslation] = useState('');
  const [messages, setMessages] = useState<CallMessage[]>([]);
  const [participants, setParticipants] = useState<RemoteParticipant[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [cameraMuted, setCameraMuted] = useState(false);
  const [listening, setListening] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [visualAlertPulse, setVisualAlertPulse] = useState(false);

  const peerRef = useRef<Peer | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersMapRef = useRef<Record<string, InternalPeerEntry>>({});
  const recRef = useRef<BrowserSpeechRecognition | null>(null);
  const listeningRef = useRef(false);
  const lastCapRef = useRef(0);
  const startedAtRef = useRef<string>('');
  const messagesRef = useRef<CallMessage[]>([]);
  const participantsHistoryRef = useRef<Set<string>>(new Set());
  const settingsRef = useRef(settings);
  const profileRef = useRef(profile);
  const isHostRef = useRef(false);
  const roomCodeRef = useRef('');
  const presetTitleRef = useRef('Sala abierta');
  const audioCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const triggerVisualAlert = useCallback(() => {
    if (!settingsRef.current.visualFlashAlerts) return;
    setVisualAlertPulse(true);
    window.setTimeout(() => setVisualAlertPulse(false), 900);
  }, []);

  const syncParticipantsState = useCallback(() => {
    const list: RemoteParticipant[] = Object.values(peersMapRef.current).map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      stream: p.stream,
      hasVideo: p.hasVideo,
      isTyping: p.isTyping,
    }));
    setParticipants(list);
    const activeNames = list.filter((p) => p.role).map((p) => formatPeerLabel(p));
    if (activeNames.length > 0) {
      setStatusText(`En la sala: ${activeNames.join(', ')}.`);
    }
  }, []);

  const appendMessage = useCallback(
    (mine: boolean, sender: string, kind: CallMessage['kind'], text: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const entry: CallMessage = {
        id,
        mine,
        sender,
        kind,
        text,
        timestamp: new Date().toLocaleTimeString('es-CO', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };

      setMessages((prev) => [...prev, entry]);

      if (!mine) {
        triggerVisualAlert();
      }

      const targetLang = settingsRef.current.autoTranslateTo;
      if (targetLang !== 'none' && kind !== 'ping' && text.trim().length > 1) {
        const sourceLang = profileRef.current.dialect.startsWith('en') ? 'en' : 'es';
        if (sourceLang !== targetLang) {
          translateExternalText(text.slice(0, 350), sourceLang, targetLang)
            .then((res) => {
              setMessages((prev) =>
                prev.map((m) => (m.id === id ? { ...m, translatedText: res.translatedText } : m))
              );
            })
            .catch(() => {
              // Keep original message if translation fails
            });
        }
      }
    },
    [triggerVisualAlert]
  );

  const sendAll = useCallback((payload: Record<string, unknown>) => {
    Object.values(peersMapRef.current).forEach((entry) => {
      if (entry.conn && entry.conn.open) {
        entry.conn.send(payload);
      }
    });
  }, []);

  const removePeer = useCallback(
    (peerId: string) => {
      const entry = peersMapRef.current[peerId];
      if (!entry) return;
      try {
        entry.conn?.close();
      } catch {
        // ignore
      }
      try {
        entry.call?.close();
      } catch {
        // ignore
      }
      delete peersMapRef.current[peerId];
      setStatusText(`${entry.name || 'La otra persona'} salió de la sala.`);
      syncParticipantsState();
    },
    [syncParticipantsState]
  );

  const getOrCreatePeerEntry = useCallback(
    (peerId: string): InternalPeerEntry => {
      if (peersMapRef.current[peerId]) return peersMapRef.current[peerId];
      const created: InternalPeerEntry = {
        id: peerId,
        conn: null,
        call: null,
        role: '',
        name: '',
        stream: null,
        hasVideo: false,
        isTyping: false,
      };
      peersMapRef.current[peerId] = created;
      syncParticipantsState();
      return created;
    },
    [syncParticipantsState]
  );

  const attachCall = useCallback(
    (mediaConn: MediaConnection) => {
      const entry = getOrCreatePeerEntry(mediaConn.peer);
      entry.call = mediaConn;
      mediaConn.on('stream', (remoteStream) => {
        entry.stream = remoteStream;
        entry.hasVideo = true;
        syncParticipantsState();
      });
      mediaConn.on('close', () => removePeer(mediaConn.peer));
    },
    [getOrCreatePeerEntry, removePeer, syncParticipantsState]
  );

  const cleanupCallResources = useCallback(() => {
    Object.keys(peersMapRef.current).forEach((id) => {
      try {
        peersMapRef.current[id].conn?.close();
        peersMapRef.current[id].call?.close();
      } catch {
        // ignore
      }
    });
    peersMapRef.current = {};

    try {
      peerRef.current?.destroy();
    } catch {
      // ignore
    }
    peerRef.current = null;

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);

    if (audioCleanupRef.current) {
      audioCleanupRef.current();
      audioCleanupRef.current = null;
    }
    setAudioLevel(0);

    listeningRef.current = false;
    setListening(false);
    try {
      recRef.current?.stop();
    } catch {
      // ignore
    }
    recRef.current = null;

    stopSpeaking();
    setParticipants([]);
    setCaptionText('');
    setCaptionTranslation('');
    setCameraMuted(false);
    setInCall(false);
    setIsConnecting(false);
  }, []);

  const attachConnRef = useRef<(conn: DataConnection) => void>(() => {});

  const connectToPeer = useCallback(
    (targetPeerId: string) => {
      const peer = peerRef.current;
      if (!peer || peersMapRef.current[targetPeerId]) return;
      if (Object.keys(peersMapRef.current).length >= MAX_OTHERS) return;

      const conn = peer.connect(targetPeerId, { reliable: true });
      attachConnRef.current(conn);
      const call = peer.call(targetPeerId, localStreamRef.current || createBlankStream());
      attachCall(call);
    },
    [attachCall]
  );

  const attachConn = useCallback(
    (conn: DataConnection) => {
      const entry = getOrCreatePeerEntry(conn.peer);
      entry.conn = conn;

      conn.on('open', () => {
        conn.send({
          k: 'hello',
          r: profileRef.current.role,
          n: profileRef.current.name,
        });
        if (isHostRef.current) {
          const otherIds = Object.keys(peersMapRef.current).filter((id) => id !== conn.peer);
          conn.send({ k: 'peers', ids: otherIds });
        }
      });

      conn.on('data', (raw) => {
        const x = raw as IncomingPayload | null;
        if (!x) return;

        if (x.k === 'hello' && (x.r === 'sorda' || x.r === 'oyente')) {
          entry.role = x.r;
          entry.name = String(x.n || '').slice(0, 20);
          participantsHistoryRef.current.add(formatPeerLabel(entry));
          syncParticipantsState();
          return;
        }

        if (x.k === 'peers' && Array.isArray(x.ids)) {
          x.ids.slice(0, MAX_OTHERS).forEach((id) => {
            if (typeof id === 'string' && !peersMapRef.current[id]) {
              connectToPeer(id);
            }
          });
          return;
        }

        if (x.k === 'full') {
          setLobbyError('La sala ya tiene 3 personas.');
          cleanupCallResources();
          return;
        }

        if (x.k === 'typing') {
          entry.isTyping = Boolean(x.v);
          syncParticipantsState();
          return;
        }

        if (x.k === 'ping') {
          const senderName = shortPeerName(entry);
          const pingText = typeof x.t === 'string' && x.t ? x.t.slice(0, 140) : 'Solicitó tu atención';
          appendMessage(false, senderName, 'ping', pingText);
          setCaptionText(`${senderName}: ${pingText}`);
          triggerVisualAlert();
          return;
        }

        if (typeof x.t !== 'string') return;
        const cleanText = x.t.slice(0, 500);

        if (x.k === 'cap' && profileRef.current.role === 'sorda') {
          const prefix = Object.keys(peersMapRef.current).length > 1 ? `${shortPeerName(entry)}: ` : '';
          setCaptionText(prefix + cleanText);
          if (settingsRef.current.autoTranslateTo !== 'none' && x.f) {
            const target = settingsRef.current.autoTranslateTo;
            const source = profileRef.current.dialect.startsWith('en') ? 'en' : 'es';
            if (source !== target) {
              translateExternalText(cleanText, source, target)
                .then((res) => setCaptionTranslation(res.translatedText))
                .catch(() => {});
            }
          }
          if (x.f) {
            appendMessage(false, `${shortPeerName(entry)} (voz)`, 'voice', cleanText);
          }
        } else if (x.k === 'txt') {
          appendMessage(false, formatPeerLabel(entry), 'txt', cleanText);
          if (entry.role === 'sorda' && settingsRef.current.voiceEnabled) {
            speakText(cleanText, profileRef.current.dialect, settingsRef.current.ttsRate);
          }
        }
      });

      conn.on('close', () => removePeer(conn.peer));
    },
    [
      appendMessage,
      cleanupCallResources,
      connectToPeer,
      getOrCreatePeerEntry,
      removePeer,
      syncParticipantsState,
      triggerVisualAlert,
    ]
  );

  useEffect(() => {
    attachConnRef.current = attachConn;
  }, [attachConn]);

  const startSpeechRecognition = useCallback(() => {
    const SR = getSpeechRecognitionConstructor();
    if (!SR) {
      setStatusText('Los subtítulos de voz funcionan en Chrome o Edge.');
      listeningRef.current = false;
      setListening(false);
      return;
    }

    try {
      recRef.current?.stop();
    } catch {
      // ignore
    }

    const recognition = new SR();
    recognition.lang = profileRef.current.dialect;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript.trim();
        if (result.isFinal) {
          if (transcript) {
            const finalText = punctuateSpanish(transcript, true).slice(0, 500);
            setCaptionText(finalText);
            appendMessage(true, 'Tú (voz)', 'voice', finalText);
            sendAll({ k: 'cap', t: finalText, f: 1 });
          }
        } else {
          interim += `${transcript} `;
        }
      }

      const trimmedInterim = interim.trim();
      if (trimmedInterim && Date.now() - lastCapRef.current > 280) {
        lastCapRef.current = Date.now();
        const punctuated = punctuateSpanish(trimmedInterim, false).slice(0, 500);
        setCaptionText(punctuated);
        sendAll({ k: 'cap', t: punctuated, f: 0 });
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        listeningRef.current = false;
        setListening(false);
        setStatusText('Falta el permiso del micrófono para subtitular tu voz.');
      }
    };

    recognition.onend = () => {
      if (listeningRef.current) {
        try {
          recognition.start();
        } catch {
          // ignore restart error
        }
      }
    };

    recRef.current = recognition;
    try {
      recognition.start();
    } catch {
      // ignore
    }
  }, [appendMessage, sendAll]);

  const setupAudioMeter = useCallback((micStream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(micStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const buffer = new Uint8Array(analyser.frequencyBinCount);
      let rafId = 0;

      const tick = () => {
        analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i];
        const avg = sum / buffer.length;
        setAudioLevel(Math.min(100, Math.round((avg / 90) * 100)));
        rafId = window.requestAnimationFrame(tick);
      };
      rafId = window.requestAnimationFrame(tick);

      audioCleanupRef.current = () => {
        window.cancelAnimationFrame(rafId);
        micStream.getTracks().forEach((t) => t.stop());
        ctx.close().catch(() => {});
      };
    } catch {
      // Ignore if AudioContext is blocked
    }
  }, []);

  const enterRoom = useCallback(
    async (rawCode: string, host: boolean, title = 'Sala abierta') => {
      if (!profileRef.current.role) {
        setLobbyError('Primero elige si eres persona sorda u oyente.');
        return;
      }

      const cleanCode = rawCode.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanCode.length < 3) {
        setLobbyError('Escribe un código de al menos 3 letras o números.');
        return;
      }

      setLobbyError('');
      setIsConnecting(true);
      isHostRef.current = host;
      roomCodeRef.current = cleanCode;
      presetTitleRef.current = title;
      setIsHost(host);
      setRoomCode(cleanCode);
      setPresetTitle(title);
      setMessages([]);
      setElapsedSeconds(0);
      startedAtRef.current = new Date().toISOString();
      participantsHistoryRef.current = new Set();

      let camWarning = '';
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          const media = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' },
            audio: false,
          });
          localStreamRef.current = media;
          setLocalStream(media);
        } catch (err) {
          const name = err instanceof Error ? err.name : 'error';
          camWarning = `No pudimos abrir tu cámara (${name}). Puedes continuar con texto y subtítulos.`;
        }

        if (profileRef.current.role === 'oyente') {
          try {
            const mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            setupAudioMeter(mic);
          } catch {
            // Optional audio meter
          }
        }
      } else {
        camWarning = 'Este navegador no permite abrir la cámara sin conexión segura (HTTPS).';
      }

      const peer = host ? new Peer(PEER_PREFIX + cleanCode) : new Peer();
      peerRef.current = peer;

      peer.on('error', (err) => {
        if (err.type === 'unavailable-id') {
          setLobbyError('Ese código ya está en uso. Genera otro código.');
          cleanupCallResources();
        } else if (err.type === 'peer-unavailable') {
          setLobbyError('No existe una sala activa con ese código.');
          cleanupCallResources();
        } else {
          setStatusText(`Problema de conexión: ${err.type}`);
        }
      });

      peer.on('connection', (conn) => {
        if (!peersMapRef.current[conn.peer] && Object.keys(peersMapRef.current).length >= MAX_OTHERS) {
          conn.on('open', () => {
            conn.send({ k: 'full' });
            window.setTimeout(() => {
              try {
                conn.close();
              } catch {
                // ignore
              }
            }, 350);
          });
          return;
        }
        attachConn(conn);
      });

      peer.on('call', (mediaConn) => {
        if (!peersMapRef.current[mediaConn.peer] && Object.keys(peersMapRef.current).length >= MAX_OTHERS) {
          return;
        }
        mediaConn.answer(localStreamRef.current || createBlankStream());
        attachCall(mediaConn);
      });

      peer.on('open', () => {
        setInCall(true);
        setIsConnecting(false);
        setStatusText(camWarning || 'Sala conectada y lista.');
        onEnterCall?.();

        if (!host) {
          const hostId = PEER_PREFIX + cleanCode;
          attachConn(peer.connect(hostId, { reliable: true }));
          attachCall(peer.call(hostId, localStreamRef.current || createBlankStream()));
        }

        if (profileRef.current.role === 'oyente' && getSpeechRecognitionConstructor()) {
          listeningRef.current = true;
          setListening(true);
          startSpeechRecognition();
        }
      });
    },
    [attachCall, attachConn, cleanupCallResources, onEnterCall, setupAudioMeter, startSpeechRecognition]
  );

  const leaveRoom = useCallback(() => {
    const endedDuration = elapsedSeconds;
    const recordedMessages = [...messagesRef.current];
    const recordedParticipants = Array.from(participantsHistoryRef.current);

    if (inCall && profileRef.current.role) {
      onSessionComplete({
        id: `session-${Date.now()}`,
        roomCode: roomCodeRef.current.toUpperCase(),
        presetTitle: presetTitleRef.current,
        roleUsed: profileRef.current.role,
        participants: recordedParticipants,
        startedAt: startedAtRef.current || new Date().toISOString(),
        durationSeconds: endedDuration,
        messages: recordedMessages,
      });
    }

    cleanupCallResources();
    setStatusText('');
  }, [cleanupCallResources, elapsedSeconds, inCall, onSessionComplete]);

  useEffect(() => {
    if (!inCall) return;
    const timer = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [inCall]);

  useEffect(() => {
    return () => {
      cleanupCallResources();
    };
  }, [cleanupCallResources]);

  const toggleListening = useCallback(() => {
    if (!getSpeechRecognitionConstructor()) {
      setStatusText('Los subtítulos de voz funcionan en Chrome o Edge.');
      return;
    }
    const next = !listeningRef.current;
    listeningRef.current = next;
    setListening(next);
    if (next) {
      setStatusText('Subtitulando tu voz. Di "coma", "punto" o "interrogación" para puntuar.');
      startSpeechRecognition();
    } else {
      setStatusText('Subtítulos de voz pausados.');
      try {
        recRef.current?.stop();
      } catch {
        // ignore
      }
    }
  }, [startSpeechRecognition]);

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const nextMuted = !cameraMuted;
    stream.getVideoTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setCameraMuted(nextMuted);
  }, [cameraMuted]);

  const sendChatMessage = useCallback(
    (text: string) => {
      const clean = text.trim().slice(0, 500);
      if (!clean) return;
      appendMessage(true, 'Tú', 'txt', clean);
      sendAll({ k: 'txt', t: clean });
      sendAll({ k: 'typing', v: false });
    },
    [appendMessage, sendAll]
  );

  const sendAttentionPing = useCallback(
    (note = 'Solicita tu atención visual') => {
      appendMessage(true, 'Tú', 'ping', note);
      sendAll({ k: 'ping', t: note });
    },
    [appendMessage, sendAll]
  );

  const notifyTyping = useCallback(
    (isTyping: boolean) => {
      sendAll({ k: 'typing', v: isTyping });
    },
    [sendAll]
  );

  return {
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
    setLobbyError,
    enterRoom,
    leaveRoom,
    toggleListening,
    toggleCamera,
    sendChatMessage,
    sendAttentionPing,
    notifyTyping,
  };
}
