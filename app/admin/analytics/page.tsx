import { Suspense } from "react";
import AdminAnalyticsClient from "./AdminAnalyticsClient";

export default function AdminAnalyticsPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-9 bg-slate-200 rounded w-48 mb-2" />
            <div className="h-4 bg-slate-200 rounded w-72 mb-8" />
            <div className="h-24 bg-slate-200 rounded mb-6" />
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-28 bg-slate-200 rounded" />
              ))}
            </div>
          </div>
        </div>
      }
    >
      <AdminAnalyticsClient />
    </Suspense>
  );
}
