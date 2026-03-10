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
  kitchenImages?: Array<{
    id: string;
    filename: string;
    title: string | null;
    order: number;
  }>;
  freeResourceEnabled?: boolean;
  freeResourceTitle?: string | null;
  freeResourceDescription?: string | null;
  freeResourceEmailSubject?: string | null;
  freeResourceEmailBody?: string | null;
  freeResourceCtaLabel?: string | null;
  freeResourceFileUrl?: string | null;
  freeResourceFileName?: string | null;
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
  id: "c1b73c87-4c12-44e3-9e49-c8618793cb60",
  organizationId: "default",
  slug: "default",
  name: "Countertop Visualizer",
  logoUrl: "/AccentCountertopsLogo.png",
  primaryColor: "#2563eb",
  backgroundColor: "#ffffff",
  supabaseFolder: "test/test-line",
  kitchenImages: [],
  freeResourceEnabled: false,
  freeResourceTitle: null,
  freeResourceDescription: null,
  freeResourceEmailSubject: null,
  freeResourceEmailBody: null,
  freeResourceCtaLabel: null,
  freeResourceFileUrl: null,
  freeResourceFileName: null,
};
