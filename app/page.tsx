"use client";

import { useMaterialLine } from "@/lib/material-line";
import SalesHome from "@/components/home/SalesHome";
import WhitelabelHome from "@/components/home/WhitelabelHome";

export default function Home() {
  const materialLine = useMaterialLine();
  // Default config (set by lib/material-line-server.ts when no whitelabel
   // headers are present) uses organizationId: "default" / slug: "default".
   // Treat that as the public/non-whitelabeled case → show the sales letter.
  const isPublic =
    !materialLine ||
    materialLine.organizationId === "default" ||
    materialLine.slug === "default";
  return isPublic ? <SalesHome /> : <WhitelabelHome />;
}
