import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeEmail,
  isValidEmail,
  isValidInvitationRole,
  generateInvitationToken,
  isInvitationActive,
  getInvitationStatus,
} from "#invitations/utils";
import { assertTenantScoping, TenantScopingError } from "#data/scoping";

describe("Token-Based Invitation Engine (ADR 0002 & ADR 0003)", () => {
  describe("Email Normalization & Validation", () => {
    it("trims whitespace and converts emails to lowercase", () => {
      assert.equal(
        normalizeEmail("  Alice.Smith@AcmeCorp.COM  "),
        "alice.smith@acmecorp.com",
      );
      assert.equal(
        normalizeEmail("\tBob+dev@EXAMPLE.org\n"),
        "bob+dev@example.org",
      );
    });

    it("returns empty string for non-string input", () => {
      // @ts-expect-error testing runtime resilience
      assert.equal(normalizeEmail(null), "");
      // @ts-expect-error testing runtime resilience
      assert.equal(normalizeEmail(undefined), "");
      // @ts-expect-error testing runtime resilience
      assert.equal(normalizeEmail(12345), "");
    });

    it("accepts valid RFC-compliant email addresses", () => {
      const validEmails = [
        "developer@tenantflow.io",
        "first.last@company.com",
        "user+filter@domain.co.uk",
        "name_tag-123@sub.sub.domain.org",
        "admin@123domain.net",
      ];

      for (const email of validEmails) {
        assert.equal(isValidEmail(email), true, `Expected valid: ${email}`);
      }
    });

    it("rejects invalid, malformed, or hostile email strings", () => {
      const invalidEmails = [
        "",
        "   ",
        "plainaddress",
        "@missing-user.com",
        "missing-at-sign.com",
        "missing.domain@.com",
        "user@localhost", // requires TLD
        "user@domain..com",
        "user name@domain.com",
        "user@domain com",
        "user@domain@another.com",
        "a".repeat(250) + "@domain.com", // exceeds 254 limit
      ];

      for (const email of invalidEmails) {
        assert.equal(isValidEmail(email), false, `Expected invalid: ${email}`);
      }
    });
  });

  describe("Invitation Role Validation", () => {
    it("allows 'member' and 'admin' as valid invitation roles", () => {
      assert.equal(isValidInvitationRole("member"), true);
      assert.equal(isValidInvitationRole("admin"), true);
    });

    it("rejects 'owner' role per ADR 0002 (ownership transfer is not an open invite)", () => {
      assert.equal(isValidInvitationRole("owner"), false);
    });

    it("rejects unknown, empty, or malicious role inputs", () => {
      assert.equal(isValidInvitationRole("superuser"), false);
      assert.equal(isValidInvitationRole("guest"), false);
      assert.equal(isValidInvitationRole(""), false);
      assert.equal(isValidInvitationRole(null), false);
      assert.equal(isValidInvitationRole(undefined), false);
      assert.equal(isValidInvitationRole(42), false);
    });
  });

  describe("Cryptographic Token Generation", () => {
    it("generates 43-character URL-safe base64url tokens (256 bits entropy)", () => {
      const token = generateInvitationToken();
      assert.equal(typeof token, "string");
      assert.equal(token.length, 43, "32 bytes base64url encoded must be 43 chars");
      // base64url allows A-Z, a-z, 0-9, '-', '_' without '=' padding
      assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    });

    it("generates tokens without URL-unsafe characters (+, /, =)", () => {
      for (let i = 0; i < 50; i++) {
        const token = generateInvitationToken();
        assert.equal(token.includes("+"), false, "Token must not contain '+'");
        assert.equal(token.includes("/"), false, "Token must not contain '/'");
        assert.equal(token.includes("="), false, "Token must not contain '='");
      }
    });

    it("generates unique tokens on repeated calls", () => {
      const tokenSet = new Set<string>();
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        tokenSet.add(generateInvitationToken());
      }

      assert.equal(tokenSet.size, iterations, "Every generated token must be globally unique");
    });
  });

  describe("Invitation Status Derivation & Activity Check", () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const pastDate = new Date(Date.now() - 1000 * 60 * 60).toISOString();
    const nowIso = new Date().toISOString();

    it("marks an unaccepted, unrevoked future invitation as pending and active", () => {
      const invite = {
        accepted_at: null,
        revoked_at: null,
        expires_at: futureDate,
      };

      assert.equal(getInvitationStatus(invite), "pending");
      assert.equal(isInvitationActive(invite), true);
    });

    it("marks an invitation as accepted when accepted_at is present", () => {
      const invite = {
        accepted_at: nowIso,
        revoked_at: null,
        expires_at: futureDate,
      };

      assert.equal(getInvitationStatus(invite), "accepted");
      assert.equal(isInvitationActive(invite), false);
    });

    it("marks an invitation as revoked when revoked_at is present", () => {
      const invite = {
        accepted_at: null,
        revoked_at: nowIso,
        expires_at: futureDate,
      };

      assert.equal(getInvitationStatus(invite), "revoked");
      assert.equal(isInvitationActive(invite), false);
    });

    it("marks an invitation as expired when expires_at is in the past", () => {
      const invite = {
        accepted_at: null,
        revoked_at: null,
        expires_at: pastDate,
      };

      assert.equal(getInvitationStatus(invite), "expired");
      assert.equal(isInvitationActive(invite), false);
    });

    it("prioritizes accepted status over revoked and expired", () => {
      const invite = {
        accepted_at: nowIso,
        revoked_at: pastDate,
        expires_at: pastDate,
      };

      assert.equal(getInvitationStatus(invite), "accepted");
      assert.equal(isInvitationActive(invite), false);
    });

    it("prioritizes revoked status over expired", () => {
      const invite = {
        accepted_at: null,
        revoked_at: pastDate,
        expires_at: pastDate,
      };

      assert.equal(getInvitationStatus(invite), "revoked");
      assert.equal(isInvitationActive(invite), false);
    });
  });

  describe("Dual Verification Scoping for Invitation Operations (ADR 0003)", () => {
    const validOrgId = "org_aaaa1111-1111-4111-a111-111111111111";
    const crossTenantOrgId = "org_bbbb2222-2222-4222-a222-222222222222";

    it("passes assertion when active context organization matches target organization", () => {
      const context = {
        currentOrg: { id: validOrgId },
      };

      assert.doesNotThrow(() => {
        assertTenantScoping(context, validOrgId);
      });
    });

    it("throws TenantScopingError when caller targets a different tenant orgId", () => {
      const context = {
        currentOrg: { id: validOrgId },
      };

      assert.throws(
        () => {
          assertTenantScoping(context, crossTenantOrgId);
        },
        (err: unknown) => {
          assert.ok(err instanceof TenantScopingError);
          assert.match(
            err.message,
            /Active context org \(org_aaaa1111-1111-4111-a111-111111111111\) does not match target org \(org_bbbb2222-2222-4222-a222-222222222222\)/,
          );
          return true;
        },
      );
    });
  });
});
