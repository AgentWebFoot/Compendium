import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeTypography } from "../src/typography.js";

test("typography settings keep valid overrides and omit theme defaults", () => {
  assert.deepEqual(normalizeTypography({
    title: { font: "georgia", size: 36 },
    pageTitle: {},
    heading1: { size: 24, color: "#3366AA" },
  }), {
    title: { font: "georgia", size: 36 },
    heading1: { size: 24, color: "#3366aa" },
  });
});

test("typography settings reject unknown fonts, roles, and out-of-range sizes", () => {
  assert.throws(() => normalizeTypography({ unknown: { size: 20 } }), /valid typography role/);
  assert.throws(() => normalizeTypography({ title: { font: "unknown" } }), /Choose a font/);
  assert.throws(() => normalizeTypography({ title: { size: 100 } }), /whole font size/);
  assert.throws(() => normalizeTypography({ title: { color: "inherit" } }), /valid text color/);
});

