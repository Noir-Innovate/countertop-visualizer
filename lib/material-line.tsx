"use client";

import { createContext, useContext, ReactNode } from "react";

export interface MaterialLineConfig {
  id: string;
  organizationId: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  backgroundColor: string;
  supabaseFolder: string;
}

const MaterialLineContext = createContext<MaterialLineConfig | null>(null);

interface MaterialLineProviderProps {
  materialLine: MaterialLineConfig | null;
  children: ReactNode;
}

export function MaterialLineProvider({
  materialLine,
  children,
}: MaterialLineProviderProps) {
  return (
    <MaterialLineContext.Provider value={materialLine}>
      {children}
    </MaterialLineContext.Provider>
  );
}

export function useMaterialLine() {
  const context = useContext(MaterialLineContext);
  return context;
}

// Default material line config for development/localhost
export const DEFAULT_MATERIAL_LINE_CONFIG: MaterialLineConfig = {
  id: "default",
  organizationId: "default",
  slug: "default",
  name: "Countertop Visualizer",
  logoUrl: "/AccentCountertopsLogo.png",
  primaryColor: "#2563eb",
  backgroundColor: "#ffffff",
  supabaseFolder: "accent-countertops",
};
