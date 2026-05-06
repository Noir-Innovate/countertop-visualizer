"use client";

import { ReactNode } from "react";
import { MaterialLineProvider, MaterialLineConfig } from "@/lib/material-line";

interface MaterialLineProviderWrapperProps {
  materialLine: MaterialLineConfig;
  children: ReactNode;
}

export function MaterialLineProviderWrapper({
  materialLine,
  children,
}: MaterialLineProviderWrapperProps) {
  return (
    <MaterialLineProvider materialLine={materialLine}>
      {children}
    </MaterialLineProvider>
  );
}
