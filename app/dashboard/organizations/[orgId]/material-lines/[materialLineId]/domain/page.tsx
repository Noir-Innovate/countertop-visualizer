"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface Props {
  params: Promise<{ orgId: string; materialLineId: string }>;
}

interface MaterialLine {
  id: string;
  name: string;
  slug: string;
  custom_domain: string | null;
  custom_domain_verified: boolean;
}

interface DomainStatus {
  configured: boolean;
  domain: string | null;
  verified: boolean;
  status: string;
  dnsRecords?: { type: string; name: string; value: string }[];
}

export default function DomainSettingsPage({ params }: Props) {
  const { orgId, materialLineId } = use(params);
  const router = useRouter();
  const [materialLine, setMaterialLine] = useState<MaterialLine | null>(null);
  const [loading, setLoading] = useState(true);
  const [domain, setDomain] = useState("");
  const [domainStatus, setDomainStatus] = useState<DomainStatus | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMaterialLine = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("material_lines")
        .select("id, name, slug, custom_domain, custom_domain_verified")
        .eq("id", materialLineId)
        .single();

      if (data) {
        setMaterialLine(data);
        if (data.custom_domain) {
          setDomain(data.custom_domain);
          checkDomainStatus();
        }
      }
      setLoading(false);
    };

    fetchMaterialLine();
  }, [materialLineId]);

  const checkDomainStatus = async () => {
    setChecking(true);
    try {
      const response = await fetch(
        `/api/domains/status?materialLineId=${materialLineId}`
      );
      const data = await response.json();
      setDomainStatus(data);

      // Refresh material line data if verification status changed
      if (
        data.verified &&
        materialLine &&
        !materialLine.custom_domain_verified
      ) {
        const supabase = createClient();
        const { data: updatedMaterialLine } = await supabase
          .from("material_lines")
          .select("id, name, slug, custom_domain, custom_domain_verified")
          .eq("id", materialLineId)
          .single();
        if (updatedMaterialLine) {
          setMaterialLine(updatedMaterialLine);
        }
      }
    } catch {
      console.error("Failed to check domain status");
    } finally {
      setChecking(false);
    }
  };

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setAdding(true);

    try {
      const response = await fetch("/api/domains/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materialLineId, domain }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to add domain");
        return;
      }

      setDomainStatus({
        configured: true,
        domain,
        verified: false,
        status: "pending",
        dnsRecords: data.dnsRecords,
      });

      // Refresh material line data
      const supabase = createClient();
      const { data: updatedMaterialLine } = await supabase
        .from("material_lines")
        .select("id, name, slug, custom_domain, custom_domain_verified")
        .eq("id", materialLineId)
        .single();
      if (updatedMaterialLine) {
        setMaterialLine(updatedMaterialLine);
      }

      router.refresh();
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveDomain = async () => {
    if (!confirm("Are you sure you want to remove this custom domain?")) {
      return;
    }

    setError(null);
    setRemoving(true);

    try {
      const response = await fetch("/api/domains/remove", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materialLineId }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to remove domain");
        return;
      }

      setDomain("");
      setDomainStatus(null);
      setMaterialLine((prev) =>
        prev
          ? { ...prev, custom_domain: null, custom_domain_verified: false }
          : null
      );
      router.refresh();
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setRemoving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-200 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-slate-200 rounded w-1/2 mb-8"></div>
          <div className="bg-white rounded-xl p-6">
            <div className="h-10 bg-slate-200 rounded mb-4"></div>
            <div className="h-10 bg-slate-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!materialLine) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 text-center">
        <p className="text-slate-600">Material line not found</p>
      </div>
    );
  }

  const appDomain =
    process.env.NEXT_PUBLIC_APP_DOMAIN || "countertopvisualizer.com";

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
          <Link href="/dashboard" className="hover:text-slate-700">
            Dashboard
          </Link>
          <span>/</span>
          <Link
            href={`/dashboard/organizations/${orgId}`}
            className="hover:text-slate-700"
          >
            Organization
          </Link>
          <span>/</span>
          <Link
            href={`/dashboard/organizations/${orgId}/material-lines/${materialLineId}`}
            className="hover:text-slate-700"
          >
            {materialLine.name}
          </Link>
          <span>/</span>
          <span>Domain</span>
        </div>
        <h1 className="text-3xl font-bold text-slate-900">Custom Domain</h1>
        <p className="text-slate-600 mt-1">
          Connect your own domain to this material line
        </p>
      </div>

      {/* Current Domain Info */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          Default Domain
        </h2>
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 bg-green-100 text-green-700 text-sm font-medium rounded-full">
            Active
          </span>
          <a
            href={`https://${materialLine.slug}.${appDomain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-700"
          >
            {materialLine.slug}.{appDomain}
          </a>
        </div>
        <p className="text-sm text-slate-500 mt-2">
          This is your default subdomain. It will always work, even if you add a
          custom domain.
        </p>
      </div>

      {/* Custom Domain Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          Custom Domain
        </h2>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {materialLine.custom_domain ? (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <span
                className={`px-3 py-1 text-sm font-medium rounded-full ${
                  materialLine.custom_domain_verified
                    ? "bg-green-100 text-green-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {materialLine.custom_domain_verified
                  ? "Active"
                  : "Pending Verification"}
              </span>
              <span className="text-slate-900 font-medium">
                {materialLine.custom_domain}
              </span>
            </div>

            {!materialLine.custom_domain_verified && (
              <div className="bg-slate-50 rounded-lg p-4 mb-4">
                <h3 className="font-medium text-slate-900 mb-2">
                  DNS Configuration Required
                </h3>
                <p className="text-sm text-slate-600 mb-4">
                  Add the following DNS record at your domain registrar:
                </p>
                <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-slate-600">
                          Type
                        </th>
                        <th className="px-4 py-2 text-left text-slate-600">
                          Name
                        </th>
                        <th className="px-4 py-2 text-left text-slate-600">
                          Value
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {domainStatus?.dnsRecords &&
                      domainStatus.dnsRecords.length > 0 ? (
                        domainStatus.dnsRecords.map((record, index) => (
                          <tr key={index}>
                            <td className="px-4 py-2 font-mono">
                              {record.type}
                            </td>
                            <td className="px-4 py-2 font-mono">
                              {record.name === "@" ? "@" : record.name}
                            </td>
                            <td className="px-4 py-2 font-mono">
                              {record.value}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="px-4 py-2 font-mono">CNAME</td>
                          <td className="px-4 py-2 font-mono">
                            {materialLine.custom_domain.split(".")[0]}
                          </td>
                          <td className="px-4 py-2 font-mono">
                            cname.vercel-dns.com
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <button
                  onClick={checkDomainStatus}
                  disabled={checking}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {checking ? "Checking..." : "Check DNS Status"}
                </button>
              </div>
            )}

            <button
              onClick={handleRemoveDomain}
              disabled={removing}
              className="text-red-600 hover:text-red-700 text-sm font-medium"
            >
              {removing ? "Removing..." : "Remove Custom Domain"}
            </button>
          </div>
        ) : (
          <form onSubmit={handleAddDomain}>
            <div className="mb-4">
              <label
                htmlFor="domain"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Domain
              </label>
              <input
                id="domain"
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value.toLowerCase())}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="visualiser.yourdomain.com"
                required
              />
              <p className="mt-1 text-sm text-slate-500">
                Enter the full domain you want to use (e.g.,
                visualiser.accentcountertops.com)
              </p>
            </div>
            <button
              type="submit"
              disabled={adding || !domain}
              className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {adding ? "Adding Domain..." : "Add Custom Domain"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
