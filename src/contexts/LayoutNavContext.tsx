import React, { createContext, useContext } from 'react';

export interface LayoutNavContextType {
  toggleNavSidebar: () => void;
  closeNavSidebar: () => void;
  /** True on `/pos` — nav drawer is overlay-only until opened */
  isPosOverlayNav: boolean;
}

const LayoutNavContext = createContext<LayoutNavContextType | null>(null);

export const LayoutNavProvider: React.FC<{
  value: LayoutNavContextType;
  children: React.ReactNode;
}> = ({ value, children }) => (
  <LayoutNavContext.Provider value={value}>{children}</LayoutNavContext.Provider>
);

export const useLayoutNav = (): LayoutNavContextType => {
  const ctx = useContext(LayoutNavContext);
  if (!ctx) {
    throw new Error('useLayoutNav must be used within Layout');
  }
  return ctx;
};
