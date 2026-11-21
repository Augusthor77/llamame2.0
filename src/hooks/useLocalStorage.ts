import { useState, useEffect, type Dispatch, type SetStateAction } from 'react';
import type { AccessibilitySettings, QuickPhrase, UserProfile } from '../types/senavoz';

export function useLocalStorage<T>(key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;
    try {
      const saved = window.localStorage.getItem(key);
      if (saved !== null) {
        return JSON.parse(saved) as T;
      }
    } catch {
      // Fallback to initialValue if storage is malformed
    }
    return initialValue;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore quota errors
    }
  }, [key, value]);

  return [value, setValue];
}

export const DEFAULT_PROFILE: UserProfile = {
  name: '',
  role: '',
  dialect: 'es-CO',
};

export const DEFAULT_SETTINGS: AccessibilitySettings = {
  captionSize: 22,
  ttsRate: 1.0,
  voiceEnabled: true,
  visualFlashAlerts: true,
  autoTranslateTo: 'none',
  theme: 'light',
};

export const DEFAULT_QUICK_PHRASES: QuickPhrase[] = [
  {
    id: 'qp-1',
    label: 'Repite despacio',
    text: 'Por favor, ¿puedes repetir más despacio?',
    category: 'ritmo',
  },
  {
    id: 'qp-2',
    label: 'Un momento',
    text: 'Un momento por favor, ya te respondo.',
    category: 'cortesia',
  },
  {
    id: 'qp-3',
    label: 'Sí, entiendo',
    text: 'Sí, te entiendo perfectamente. Continúa.',
    category: 'cortesia',
  },
  {
    id: 'qp-4',
    label: 'Escríbelo aquí',
    text: '¿Puedes escribir esa palabra en el chat para leerla mejor?',
    category: 'ayuda',
  },
  {
    id: 'qp-5',
    label: 'Mira la cámara',
    text: 'Por favor acércate un poco más a la cámara para ver tus señas o labios.',
    category: 'ayuda',
  },
  {
    id: 'qp-6',
    label: 'Gracias',
    text: 'Muchas gracias por tu paciencia y claridad.',
    category: 'cortesia',
  },
];
