import test from "node:test";
import assert from "node:assert/strict";
import { shouldShowOrgSwitcher } from "@/lib/nav-visibility";

test("org switcher shows for a super admin", () => {
  // Super admins are loaded with every org tagged role "super_admin".
  const orgs = [
    { role: "super_admin" },
    { role: "super_admin" },
  ];
  assert.equal(shouldShowOrgSwitcher({ is_super_admin: true }, orgs), true);
});

test("org switcher shows for a super admin even with no memberships listed", () => {
  // Defensive: a super admin with an empty org list still has nothing to
  // switch between, so it stays hidden (length gate wins).
  assert.equal(shouldShowOrgSwitcher({ is_super_admin: true }, []), false);
});

test("org switcher shows for an admin of multiple organizations", () => {
  const orgs = [{ role: "admin" }, { role: "admin" }];
  assert.equal(shouldShowOrgSwitcher({ is_super_admin: false }, orgs), true);
});

test("org switcher shows for an owner of a single organization", () => {
  assert.equal(shouldShowOrgSwitcher(null, [{ role: "owner" }]), true);
});

test("org switcher shows when a user has a mix of sales and admin roles", () => {
  const orgs = [{ role: "sales_person" }, { role: "admin" }];
  assert.equal(shouldShowOrgSwitcher(null, orgs), true);
});

test("org switcher is hidden for a salesperson-only user", () => {
  const orgs = [{ role: "sales_person" }, { role: "sales_person" }];
  assert.equal(shouldShowOrgSwitcher({ is_super_admin: false }, orgs), false);
});

test("org switcher is hidden when there are no organizations", () => {
  assert.equal(shouldShowOrgSwitcher(null, []), false);
});
