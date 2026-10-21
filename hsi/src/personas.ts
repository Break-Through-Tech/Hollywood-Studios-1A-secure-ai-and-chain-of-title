import { createContext, useContext } from 'react';

export interface Persona {
  key: string;
  label: string;
  icon: string;
  justification: string;
}

export const personas: Persona[] = [
  {
    key: 'creators',
    label: 'Creators',
    icon: 'https://www.hollywoodstudios.ai/images/icon-creators.png',
    justification:
      'HSI gives you AI-powered script analysis, genre benchmarking, and audience insights — so you can refine your vision with data that Hollywood insiders rely on, from first draft to final cut.',
  },
  {
    key: 'producers',
    label: 'Producers',
    icon: 'https://www.hollywoodstudios.ai/images/icon-producers.png',
    justification:
      'HSI delivers greenlight scoring, talent-market intelligence, and real-time comp analysis across your entire slate — giving you the confidence to invest in projects that perform.',
  },
  {
    key: 'professionals',
    label: 'Professionals',
    icon: 'https://www.hollywoodstudios.ai/images/icon-professionals.png',
    justification:
      'HSI equips you with casting intel, market trend tracking, and IP valuation tools — everything you need to make faster, smarter decisions in a fast-moving industry.',
  },
  {
    key: 'investors',
    label: 'Investors',
    icon: 'https://www.hollywoodstudios.ai/images/icon-investors.png',
    justification:
      'HSI provides projected ROI modeling, franchise potential scoring, and portfolio-level risk analysis — so you can back content with the same precision you bring to any asset class.',
  },
];

export interface PersonaContextValue {
  selected: Persona | null;
  setSelected: (p: Persona) => void;
  pickerOpen: boolean;
  openPicker: () => void;
  closePicker: () => void;
}

export const PersonaContext = createContext<PersonaContextValue | null>(null);

export function usePersona() {
  const ctx = useContext(PersonaContext);
  if (!ctx) throw new Error('usePersona must be used within PersonaProvider');
  return ctx;
}
