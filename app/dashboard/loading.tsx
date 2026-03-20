export default function DashboardLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="h-9 w-48 bg-slate-200 rounded animate-pulse mb-2" />
          <div className="h-5 w-96 bg-slate-200 rounded animate-pulse" />
        </div>
        <div className="h-10 w-48 bg-slate-200 rounded animate-pulse" />
      </div>

      {/* Organizations Skeleton */}
      <div className="space-y-6">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-slate-200">
              <div className="h-6 w-48 bg-slate-200 rounded animate-pulse mb-2" />
              <div className="h-4 w-32 bg-slate-200 rounded animate-pulse" />
            </div>
            <div className="px-6 py-4">
              <div className="space-y-3">
                {[1, 2, 3].map((j) => (
                  <div
                    key={j}
                    className="h-16 bg-slate-50 rounded animate-pulse"
                  />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
