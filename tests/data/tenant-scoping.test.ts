import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertTenantScoping,
  TenantScopingError,
  resolveTenantAccess,
} from "#data/scoping";

describe("Tenant Scoping & Access Resolution (ADRs 0001, 0003)", () => {
  describe("TenantScopingError", () => {
    it("instantiates with default message and correct name", () => {
      const error = new TenantScopingError();
      assert.equal(error.name, "TenantScopingError");
      assert.equal(
        error.message,
        "Cross-tenant operation rejected: Tenant context mismatch.",
      );
      assert.ok(error instanceof Error);
      assert.ok(error instanceof TenantScopingError);
    });

    it("accepts a custom error message", () => {
      const customMessage = "Custom security violation";
      const error = new TenantScopingError(customMessage);
      assert.equal(error.name, "TenantScopingError");
      assert.equal(error.message, customMessage);
    });
  });

  describe("assertTenantScoping (ADR 0003: Dual Verification)", () => {
    const validOrgId = "org_11111111-1111-4111-a111-111111111111";
    const mismatchedOrgId = "org_22222222-2222-4222-a222-222222222222";

    it("passes when active context org id matches target org id", () => {
      const context = {
        currentOrg: { id: validOrgId },
      };

      assert.doesNotThrow(() => {
        assertTenantScoping(context, validOrgId);
      });
    });

    it("throws typed TenantScopingError when target org id does not match active org id", () => {
      const context = {
        currentOrg: { id: validOrgId },
      };

      assert.throws(
        () => {
          assertTenantScoping(context, mismatchedOrgId);
        },
        (err: unknown) => {
          assert.ok(err instanceof TenantScopingError);
          assert.equal(err.name, "TenantScopingError");
          assert.match(
            err.message,
            /Active context org \(org_11111111-1111-4111-a111-111111111111\) does not match target org \(org_22222222-2222-4222-a222-222222222222\)/,
          );
          return true;
        },
      );
    });

    it("throws TenantScopingError when currentOrg is null", () => {
      const context = {
        currentOrg: null,
      };

      assert.throws(
        () => {
          assertTenantScoping(context, validOrgId);
        },
        (err: unknown) => {
          assert.ok(err instanceof TenantScopingError);
          assert.match(
            err.message,
            /Active context org \(undefined\) does not match target org/,
          );
          return true;
        },
      );
    });

    it("throws TenantScopingError when currentOrg is undefined", () => {
      const context = {
        currentOrg: undefined,
      };

      assert.throws(
        () => {
          assertTenantScoping(context, validOrgId);
        },
        (err: unknown) => {
          assert.ok(err instanceof TenantScopingError);
          return true;
        },
      );
    });

    it("throws TenantScopingError when context has no currentOrg property", () => {
      const context = {};

      assert.throws(
        () => {
          assertTenantScoping(context, validOrgId);
        },
        (err: unknown) => {
          assert.ok(err instanceof TenantScopingError);
          return true;
        },
      );
    });
  });

  describe("resolveTenantAccess (ADR 0001: Zero-Knowledge Enumeration Defense)", () => {
    it("returns 'allow' when user is an active member, regardless of public directory setting", () => {
      // Member of private tenant
      assert.equal(resolveTenantAccess(true, false), "allow");
      // Member of public tenant
      assert.equal(resolveTenantAccess(true, true), "allow");
    });

    it("returns 'forbidden' when user is NOT a member but tenant has opt-in public directory", () => {
      // Opt-in public directory -> displays 403 Access Denied
      assert.equal(resolveTenantAccess(false, true), "forbidden");
    });

    it("returns 'not_found' when user is NOT a member and tenant is private (zero-knowledge defense)", () => {
      // Private tenant -> displays 404 Not Found to prevent tenant enumeration
      assert.equal(resolveTenantAccess(false, false), "not_found");
    });
  });
});
