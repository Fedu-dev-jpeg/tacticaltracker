import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260715142100_harden_role_visibility.sql"),
  "utf8",
);

describe("role visibility hardening", () => {
  it("keeps elevated role assignments behind explicit admin-only policies", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.current_user_is_admin()");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.current_user_role()");
    expect(migration).toContain('CREATE POLICY "Users read own role assignment"');
    expect(migration).toContain('CREATE POLICY "Admins read all role assignments"');
    expect(migration).toContain("USING (public.current_user_is_admin())");
    expect(migration).not.toMatch(/ON public\.user_roles[\s\S]*FOR SELECT[\s\S]*USING\s*\(\s*true\s*\)/i);
  });

  it("prevents non-admin has_role callers from probing other users", () => {
    expect(migration).toContain("WHEN _user_id = auth.uid() OR public.current_user_is_admin()");
    expect(migration).toContain("ELSE false");
    expect(migration).toContain("REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon");
  });
});
