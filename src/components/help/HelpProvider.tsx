import React, { createContext, useContext, useState, useCallback } from 'react';

export interface HelpTargetData {
  id: string;
  title: string;
  description: string;
  category?: string;
  placement?: string;
  actions?: string[];
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
