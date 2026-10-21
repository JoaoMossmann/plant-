import { test } from "node:test";
import assert from "node:assert/strict";
import { publicCloudConfig } from "../src/lib/public-config.js";
test("build allows no backend, accepts only public configuration and rejects accidental secrets", () => {
  assert.equal(publicCloudConfig(), null);
  assert.equal(
    publicCloudConfig("https://example.supabase.co", "sb_publishable_test").url,
    "https://example.supabase.co",
  );
  for (const args of [
    ["https://example.supabase.co", "sb_secret_not_for_browser"],
    ["https://example.supabase.co", "eyJ_legacy_role"],
    ["http://example.supabase.co", "sb_publishable_test"],
    ["https://user:pass@example.supabase.co", "sb_publishable_test"],
    ["https://example.supabase.co/path", "sb_publishable_test"],
    ["https://example.supabase.co", ""],
  ])
    assert.throws(() => publicCloudConfig(...args));
});
