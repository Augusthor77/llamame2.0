import { Video, Plus, Sun, Moon } from 'lucide-react';
import type { AccessibilitySettings, DashboardTab } from '../types/senavoz';

interface TopBarProps {
  activeTab: DashboardTab;
  inCall: boolean;
  roomCode: string;
  theme: AccessibilitySettings['theme'];
  onToggleTheme: () => void;
  onQuickCreateRoom: () => void;
  onGoToCall: () => void;
}

const TAB_TITLES: Record<DashboardTab, string> = {
  overview: 'Panel principal',
  call: 'Sala en vivo',
  assist: 'Diccionario y traducción',
  settings: 'Frases y accesibilidad',
};

export function TopBar({
  activeTab,
  inCall,
  roomCode,
  theme,
  onToggleTheme,
  onQuickCreateRoom,
  onGoToCall,
}: TopBarProps) {
  return (
    <header className="flex items-center justify-between gap-6 border-b border-[#D3DBE3] dark:border-[#26384D] bg-white dark:bg-[#142233] px-4 sm:px-6 h-14 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="lg:hidden font-['Plus_Jakarta_Sans'] text-base font-bold text-[#10243A] dark:text-[#EAF0F6] whitespace-nowrap shrink-0">
          SeñaVoz
        </span>
        <span className="lg:hidden text-[#566677] dark:text-[#93A3B5]" aria-hidden="true">
          /
        </span>
        <div className="flex items-center gap-2 text-sm text-[#566677] dark:text-[#93A3B5] min-w-0">
          <span className="hidden lg:inline whitespace-nowrap shrink-0">SeñaVoz</span>
          <span className="hidden lg:inline" aria-hidden="true">
            /
          </span>
          <span className="font-semibold text-[#10243A] dark:text-[#EAF0F6] truncate">
            {TAB_TITLES[activeTab]}
          </span>
          {inCall && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-xs tabular-nums text-[#1B4F8A] dark:text-[#8FBBF2] whitespace-nowrap shrink-0">
                Sala {roomCode.toUpperCase()}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          className="lg:hidden flex h-10 w-10 items-center justify-center rounded-lg border border-[#D3DBE3] dark:border-[#26384D] text-[#10243A] dark:text-[#EAF0F6]"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        {inCall ? (
          <button
            type="button"
            onClick={onGoToCall}
            className="inline-flex items-center gap-2 rounded-lg bg-[#1B4F8A] dark:bg-[#8FBBF2] px-4 py-2 text-sm font-semibold text-white dark:text-[#0C1520] hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 min-h-[40px]"
          >
            <Video className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Volver a la sala</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onQuickCreateRoom}
            className="inline-flex items-center gap-2 rounded-lg bg-[#1B4F8A] dark:bg-[#8FBBF2] px-4 py-2 text-sm font-semibold text-white dark:text-[#0C1520] hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 min-h-[40px]"
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Crear sala</span>
          </button>
        )}
      </div>
    </header>
  );
}
