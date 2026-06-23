import { createServiceClient } from "@/lib/supabase/server";
import AddSalespersonButton from "./AddSalespersonButton";
import RemoveSalespersonButton from "./RemoveSalespersonButton";

interface Props {
  orgId: string;
  materialLineId: string;
}

interface MemberRow {
  profile_id: string;
  role: string;
  profiles:
    | { id: string; full_name: string | null; email: string | null }
    | { id: string; full_name: string | null; email: string | null }[]
    | null;
}

function profileOf(member: MemberRow) {
  return Array.isArray(member.profiles)
    ? member.profiles[0] ?? null
    : member.profiles;
}

export default async function LineSalespeople({ orgId, materialLineId }: Props) {
  // Service role: rendered for owners/admins/super_admins. Mirrors the GET in
  // app/api/organizations/[orgId]/material-lines/[materialLineId]/salespeople.
  const service = await createServiceClient();

  const { data: assignmentRows } = await service
    .from("salesperson_line_assignments")
    .select("profile_id")
    .eq("organization_id", orgId)
    .eq("material_line_id", materialLineId);

  const assignedProfileIds = new Set(
    (assignmentRows || []).map((r) => r.profile_id),
  );

  const { data: memberRows } = await service
    .from("organization_members")
    .select("profile_id, role, profiles(id, full_name, email)")
    .eq("organization_id", orgId)
    .eq("role", "sales_person");

  const members = (memberRows || []) as MemberRow[];

  const assigned = members
    .filter((m) => assignedProfileIds.has(m.profile_id))
    .map((m) => {
      const p = profileOf(m);
      return {
        profileId: m.profile_id,
        fullName: p?.full_name || null,
        email: p?.email || null,
      };
    });

  const { data: invitationRows } = await service
    .from("organization_invitations")
    .select("id, email")
    .eq("organization_id", orgId)
    .eq("role", "sales_person")
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .contains("assigned_material_line_ids", [materialLineId]);

  const pending = (invitationRows || []).map((inv) => ({
    id: inv.id,
    email: inv.email as string,
  }));

  const isEmpty = assigned.length === 0 && pending.length === 0;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Salespeople</h2>
          <p className="text-sm text-slate-600 mt-1">
            Salespeople assigned to this line.
          </p>
        </div>
        <AddSalespersonButton orgId={orgId} materialLineId={materialLineId} />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isEmpty ? (
          <div className="px-6 py-10 text-center text-sm text-slate-500">
            No salespeople assigned yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left font-medium text-slate-600 px-4 py-2">
                    Name
                  </th>
                  <th className="text-left font-medium text-slate-600 px-4 py-2">
                    Email
                  </th>
                  <th className="text-left font-medium text-slate-600 px-4 py-2">
                    Status
                  </th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assigned.map((s) => (
                  <tr key={s.profileId} className="hover:bg-slate-50">
                    <td className="px-4 py-2 text-slate-900">
                      {s.fullName || "—"}
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {s.email || "—"}
                    </td>
                    <td className="px-4 py-2">
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-50 text-green-700">
                        Active
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <RemoveSalespersonButton
                        orgId={orgId}
                        materialLineId={materialLineId}
                        profileId={s.profileId}
                        name={s.fullName || s.email || "this salesperson"}
                      />
                    </td>
                  </tr>
                ))}
                {pending.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 text-slate-400">—</td>
                    <td className="px-4 py-2 text-slate-600">{p.email}</td>
                    <td className="px-4 py-2">
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-50 text-amber-700">
                        Pending
                      </span>
                    </td>
                    <td className="px-4 py-2" />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
