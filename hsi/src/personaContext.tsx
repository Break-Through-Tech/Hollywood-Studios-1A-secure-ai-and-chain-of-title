import { useState, useCallback, type ReactNode } from 'react';
import { personas, PersonaContext, type Persona } from './personas';

const STORAGE_KEY = 'hsi-persona-selected';

export function PersonaProvider({ children }: { children: ReactNode }) {
  const stored = localStorage.getItem(STORAGE_KEY);
  const initial = stored ? personas.find((p) => p.key === stored) ?? null : null;

  const [selected, setSelectedState] = useState<Persona | null>(initial);
  const [pickerOpen, setPickerOpen] = useState(false);

  const setSelected = useCallback((p: Persona) => {
    localStorage.setItem(STORAGE_KEY, p.key);
    setSelectedState(p);
  }, []);

  const openPicker = useCallback(() => setPickerOpen(true), []);
  const closePicker = useCallback(() => setPickerOpen(false), []);

  return (
    <PersonaContext.Provider value={{ selected, setSelected, pickerOpen, openPicker, closePicker }}>
      {children}
    </PersonaContext.Provider>
  );
}
