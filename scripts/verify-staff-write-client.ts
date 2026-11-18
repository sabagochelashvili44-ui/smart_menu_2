/**
 * Smoke checks for staff write client helpers (no network).
 * Run: npx tsx --tsconfig tsconfig.json scripts/verify-staff-write-client.ts
 */
import assert from "node:assert/strict";
import {
  hasUsableServiceRoleKey,
  staffWriteErrorMessage,
} from "../src/lib/staff-write-shared";

const rls = staffWriteErrorMessage(
  { message: 'new row violates row level security policy for table "restaurant_staff"' },
  "user",
);
assert.match(rls, /owner session|SERVICE_ROLE/i);

const rlsService = staffWriteErrorMessage(
  { message: "new row violates row level security policy" },
  "service",
);
assert.match(rlsService, /SERVICE_ROLE|policy/i);

const plain = staffWriteErrorMessage({ message: "duplicate key" }, "service");
assert.equal(plain, "duplicate key");

// Env-dependent; just ensure it returns boolean without throw.
assert.equal(typeof hasUsableServiceRoleKey(), "boolean");

console.log("verify-staff-write-client: ok");
