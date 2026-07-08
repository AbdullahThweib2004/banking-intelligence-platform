import React, { createContext, useContext, useState, useCallback } from 'react';

// section: a whole page region (a card group, a table + its chrome).
// item: one selectable unit inside a section (a single card, a table row).
// action: a specific control (a button, an icon, a clickable chip).
// Scope only sets the *default* priority (see helpTargeting.ts) — an
// explicit `priority` on a target always overrides it.
export type HelpTargetScope = 'section' | 'item' | 'action';
export type HelpTargetPlacement = 'left' | 'right' | 'auto';

export interface HelpTargetData {
  id: string;
  title: string;
  description: string;
  /** Short one-line action/help text, shown above the full description. */
  hint?: string;
  category?: string;
  placement?: HelpTargetPlacement;
  actions?: string[];
  /** Explicit ranking used when multiple registered targets overlap under the pointer. Higher wins. */
  priority?: number;
  /** Coarse classification used to derive a default priority when none is given. */
  scope?: HelpTargetScope;
  /** Registered for context/nesting only — never itself hoverable/selectable. */
  disableSelect?: boolean;
  element: HTMLElement;
}

interface HelpContextType {
  isHelpMode: boolean;
  setHelpMode: (active: boolean) => void;
  registerTarget: (target: HelpTargetData) => () => void;
  targets: Record<string, HelpTargetData>;
  selectedTargetId: string | null;
  setSelectedTargetId: (id: string | null) => void;
}

const HelpContext = createContext<HelpContextType | undefined>(undefined);

export const HelpProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isHelpMode, setHelpModeState] = useState(false);
  const [targets, setTargets] = useState<Record<string, HelpTargetData>>({});
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);

  const setHelpMode = useCallback((active: boolean) => {
    setHelpModeState(active);
    if (!active) {
      setSelectedTargetId(null);
    }
  }, []);

  const registerTarget = useCallback((target: HelpTargetData) => {
    setTargets((prev) => ({
      ...prev,
      [target.id]: target,
    }));

    return () => {
      setTargets((prev) => {
        const next = { ...prev };
        delete next[target.id];
        return next;
      });
    };
  }, []);

  return (
    <HelpContext.Provider
      value={{
        isHelpMode,
        setHelpMode,
        registerTarget,
        targets,
        selectedTargetId,
        setSelectedTargetId,
      }}
    >
      {children}
    </HelpContext.Provider>
  );
};

export const useHelp = () => {
  const context = useContext(HelpContext);
  if (!context) {
    throw new Error('useHelp must be used within a HelpProvider');
  }
  return context;
};
