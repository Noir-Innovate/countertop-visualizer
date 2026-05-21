import { Suspense } from "react";
import AdminRevenueClient from "./AdminRevenueClient";

export const dynamic = "force-dynamic";

export default function AdminRevenuePage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-9 bg-slate-200 rounded w-48 mb-2" />
            <div className="h-4 bg-slate-200 rounded w-72 mb-8" />
            <div className="h-64 bg-slate-200 rounded" />
          </div>
        </div>
      }
    >
      <AdminRevenueClient />
    </Suspense>
  );
}
