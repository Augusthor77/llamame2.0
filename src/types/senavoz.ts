export type UserRole = 'sorda' | 'oyente';

export type DashboardTab = 'overview' | 'call' | 'assist' | 'settings';

export type SpeechDialect = 'es-CO' | 'es-ES' | 'es-MX' | 'es-AR' | 'en-US';

export type TranslationTarget = 'none' | 'en' | 'pt' | 'fr';

export interface UserProfile {
  name: string;
  role: UserRole | '';
  dialect: SpeechDialect;
}

export interface AccessibilitySettings {
  captionSize: number;
  ttsRate: number;
  voiceEnabled: boolean;
  visualFlashAlerts: boolean;
  autoTranslateTo: TranslationTarget;
  theme: 'light' | 'dark';
}

export interface QuickPhrase {
  id: string;
  label: string;
  text: string;
  category: 'cortesia' | 'ritmo' | 'ayuda' | 'personal';
}

export interface CallMessage {
  id: string;
  mine: boolean;
  sender: string;
  kind: 'txt' | 'voice' | 'ping';
  text: string;
  translatedText?: string;
  timestamp: string;
}

export interface SessionSummary {
  summary: string;
  keyPoints: string[];
  actionItems: string[];
}

export interface CallSessionRecord {
  id: string;
  roomCode: string;
  presetTitle: string;
  roleUsed: UserRole;
  participants: string[];
  startedAt: string;
  durationSeconds: number;
  messages: CallMessage[];
  aiSummary?: SessionSummary;
}

export interface RemoteParticipant {
  id: string;
  name: string;
  role: UserRole | '';
  stream: MediaStream | null;
  hasVideo: boolean;
  isTyping?: boolean;
}
