import { useEffect, useState } from 'react';
import type {
  AccessibilitySettings,
  CallSessionRecord,
  DashboardTab,
  QuickPhrase,
  UserProfile,
} from './types/senavoz';
import {
  DEFAULT_PROFILE,
  DEFAULT_QUICK_PHRASES,
  DEFAULT_SETTINGS,
  useLocalStorage,
} from './hooks/useLocalStorage';
import { usePeerCall } from './hooks/usePeerCall';
import { generateRoomCode } from './utils/speech';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { DashboardOverview } from './components/DashboardOverview';
import { LiveCallView } from './components/LiveCallView';
import { ExternalToolsView } from './components/ExternalToolsView';
import { AccessibilitySettingsView } from './components/AccessibilitySettingsView';

export default function App() {
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [profile, setProfile] = useLocalStorage<UserProfile>('senavoz_profile_v2', DEFAULT_PROFILE);
  const [settings, setSettings] = useLocalStorage<AccessibilitySettings>(
    'senavoz_settings_v2',
    DEFAULT_SETTINGS
  );
  const [quickPhrases, setQuickPhrases] = useLocalStorage<QuickPhrase[]>(
    'senavoz_phrases_v2',
    DEFAULT_QUICK_PHRASES
  );
  const [sessions, setSessions] = useLocalStorage<CallSessionRecord[]>(
    'senavoz_sessions_v2',
    []
  );

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [settings.theme]);

  const peerCall = usePeerCall({
    profile,
    settings,
    onEnterCall: () => setActiveTab('call'),
    onSessionComplete: (record) => {
      setSessions((prev) => [record, ...prev].slice(0, 30));
      setActiveTab('overview');
    },
  });

  const handleToggleTheme = () => {
    setSettings((prev) => ({
      ...prev,
      theme: prev.theme === 'dark' ? 'light' : 'dark',
    }));
  };

  const handleCreateRoom = (code: string, presetTitle: string) => {
    if (!profile.role) {
      peerCall.setLobbyError('Primero elige si eres persona sorda u oyente.');
      setActiveTab('overview');
      return;
    }
    peerCall.enterRoom(code, true, presetTitle);
  };

  const handleJoinRoom = (code: string) => {
    if (!profile.role) {
      peerCall.setLobbyError('Primero elige si eres persona sorda u oyente.');
      setActiveTab('overview');
      return;
    }
    peerCall.enterRoom(code, false, 'Sala compartida');
  };

  const handleAddQuickPhrase = (label: string, text: string) => {
    const item: QuickPhrase = {
      id: `qp-${Date.now()}`,
      label: label.slice(0, 28),
      text: text.slice(0, 200),
      category: 'personal',
    };
    setQuickPhrases((prev) => [...prev, item]);
  };

  const handleUpdateSession = (updated: CallSessionRecord) => {
    setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  };

  const handleDeleteSession = (id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-[#F4F6F8] text-[#10243A] dark:bg-[#0C1520] dark:text-[#EAF0F6]">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        inCall={peerCall.inCall}
        roomCode={peerCall.roomCode}
        profile={profile}
        theme={settings.theme}
        onToggleTheme={handleToggleTheme}
      />

      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <TopBar
          activeTab={activeTab}
          inCall={peerCall.inCall}
          roomCode={peerCall.roomCode}
          theme={settings.theme}
          onToggleTheme={handleToggleTheme}
          onQuickCreateRoom={() => handleCreateRoom(generateRoomCode(4), 'Sala abierta')}
          onGoToCall={() => setActiveTab('call')}
        />

        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
          {activeTab === 'overview' && (
            <DashboardOverview
              profile={profile}
              onUpdateProfile={(next) => {
                setProfile(next);
                if (next.role) peerCall.setLobbyError('');
              }}
              settings={settings}
              sessions={sessions}
              onUpdateSession={handleUpdateSession}
              onDeleteSession={handleDeleteSession}
              quickPhrases={quickPhrases}
              inCall={peerCall.inCall}
              isConnecting={peerCall.isConnecting}
              lobbyError={peerCall.lobbyError}
              onCreateRoom={handleCreateRoom}
              onJoinRoom={handleJoinRoom}
              onOpenActiveCall={() => setActiveTab('call')}
            />
          )}

          {activeTab === 'call' && (
            <LiveCallView
              profile={profile}
              settings={settings}
              onUpdateSettings={setSettings}
              quickPhrases={quickPhrases}
              inCall={peerCall.inCall}
              isConnecting={peerCall.isConnecting}
              isHost={peerCall.isHost}
              roomCode={peerCall.roomCode}
              presetTitle={peerCall.presetTitle}
              statusText={peerCall.statusText}
              lobbyError={peerCall.lobbyError}
              captionText={peerCall.captionText}
              captionTranslation={peerCall.captionTranslation}
              messages={peerCall.messages}
              participants={peerCall.participants}
              localStream={peerCall.localStream}
              cameraMuted={peerCall.cameraMuted}
              listening={peerCall.listening}
              audioLevel={peerCall.audioLevel}
              elapsedSeconds={peerCall.elapsedSeconds}
              visualAlertPulse={peerCall.visualAlertPulse}
              onCreateRoom={handleCreateRoom}
              onJoinRoom={handleJoinRoom}
              onLeaveRoom={peerCall.leaveRoom}
              onToggleListening={peerCall.toggleListening}
              onToggleCamera={peerCall.toggleCamera}
              onSendMessage={peerCall.sendChatMessage}
              onSendAttentionPing={peerCall.sendAttentionPing}
              onNotifyTyping={peerCall.notifyTyping}
            />
          )}

          {activeTab === 'assist' && (
            <ExternalToolsView
              profile={profile}
              settings={settings}
              onAddQuickPhrase={handleAddQuickPhrase}
              existingPhrases={quickPhrases}
            />
          )}

          {activeTab === 'settings' && (
            <AccessibilitySettingsView
              profile={profile}
              settings={settings}
              onUpdateSettings={setSettings}
              quickPhrases={quickPhrases}
              onUpdateQuickPhrases={setQuickPhrases}
            />
          )}
        </main>
      </div>
    </div>
  );
}
