import {
  BookOpen,
  LayoutDashboard,
  SlidersHorizontal,
  Sun,
  Moon,
  Video,
} from 'lucide-react';
import type { AccessibilitySettings, DashboardTab, UserProfile } from '../types/senavoz';

interface SidebarProps {
  activeTab: DashboardTab;
  onSelectTab: (tab: DashboardTab) => void;
  inCall: boolean;
  roomCode: string;
  profile: UserProfile;
  theme: AccessibilitySettings['theme'];
  onToggleTheme: () => void;
}

const NAV_ITEMS: Array<{
  id: DashboardTab;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: 'overview', label: 'Panel principal', icon: LayoutDashboard },
  { id: 'call', label: 'Sala en vivo', icon: Video },
  { id: 'assist', label: 'Diccionario y traducción', icon: BookOpen },
  { id: 'settings', label: 'Frases y accesibilidad', icon: SlidersHorizontal },
];

export function Sidebar({
  activeTab,
  onSelectTab,
  inCall,
  roomCode,
  profile,
  theme,
  onToggleTheme,
}: SidebarProps) {
  const initials = (profile.name || 'SV')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  const roleText =
    profile.role === 'sorda'
      ? 'Persona sorda'
      : profile.role === 'oyente'
        ? 'Oyente'
        : 'Sin rol definido';

  return (
    <>
      <aside className="hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:justify-between border-r border-[#D3DBE3] dark:border-[#26384D] bg-white dark:bg-[#142233] px-4 py-6">
        <div className="space-y-8">
          <div className="px-2">
            <span className="font-['Plus_Jakarta_Sans'] text-xl font-bold tracking-tight text-[#10243A] dark:text-[#EAF0F6]">
              SeñaVoz
            </span>
            <p className="mt-1 text-xs text-[#566677] dark:text-[#93A3B5]">
              Comunicación accesible
            </p>
          </div>

          <nav aria-label="Navegación principal" className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-[#1B4F8A] text-white dark:bg-[#8FBBF2] dark:text-[#0C1520]'
                      : 'text-[#10243A] dark:text-[#EAF0F6] hover:bg-[#F4F6F8] dark:hover:bg-[#1D2F45]'
                  }`}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.id === 'call' && inCall && (
                    <span className="font-mono text-xs tabular-nums opacity-90 shrink-0">
                      {roomCode.toUpperCase()}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="space-y-4 pt-6 border-t border-[#D3DBE3] dark:border-[#26384D]">
          <div className="flex items-center gap-3 px-2">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#1B4F8A]/10 text-sm font-bold text-[#1B4F8A] dark:bg-[#8FBBF2]/15 dark:text-[#8FBBF2]"
              aria-hidden="true"
            >
              {initials || 'SV'}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#10243A] dark:text-[#EAF0F6]">
                {profile.name || 'Invitado'}
              </p>
              <p className="truncate text-xs text-[#566677] dark:text-[#93A3B5]">
                {roleText} · {profile.dialect}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onToggleTheme}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-[#D3DBE3] dark:border-[#26384D] px-3 py-2 text-xs font-medium text-[#10243A] dark:text-[#EAF0F6] hover:bg-[#F4F6F8] dark:hover:bg-[#1D2F45] transition-colors whitespace-nowrap"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Cambiar a modo claro</span>
              </>
            ) : (
              <>
                <Moon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Cambiar a modo oscuro</span>
              </>
            )}
          </button>
        </div>
      </aside>

      <nav
        aria-label="Navegación móvil"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-[#D3DBE3] dark:border-[#26384D] bg-white dark:bg-[#142233] px-2 py-1.5"
      >
        <div className="grid grid-cols-4 gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const shortLabel =
              item.id === 'overview'
                ? 'Panel'
                : item.id === 'call'
                  ? 'Sala'
                  : item.id === 'assist'
                    ? 'Idiomas'
                    : 'Ajustes';
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`flex flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 px-1 text-[11px] font-medium min-h-[44px] whitespace-nowrap ${
                  isActive
                    ? 'bg-[#1B4F8A] text-white dark:bg-[#8FBBF2] dark:text-[#0C1520]'
                    : 'text-[#566677] dark:text-[#93A3B5]'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate max-w-full">{shortLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
