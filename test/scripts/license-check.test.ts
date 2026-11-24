import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkLicenseConsistency, detectLicenseSpdx } from "../../scripts/license-check";

const MIT = "MIT License\n\nCopyright (c) 2026 Someone\n\nPermission is hereby granted...";
const APACHE =
  "\n                                 Apache License\n                           Version 2.0, January 2004\n";

describe("license-check", () => {
  test("detects common license headers", () => {
    expect(detectLicenseSpdx(MIT)).toBe("MIT");
    expect(detectLicenseSpdx(APACHE)).toBe("Apache-2.0");
    expect(detectLicenseSpdx("Some custom terms")).toBeUndefined();
  });

  test("passes when LICENSE and package.json agree", () => {
    expect(checkLicenseConsistency(MIT, "MIT")).toBeUndefined();
    expect(checkLicenseConsistency(APACHE, "Apache-2.0")).toBeUndefined();
  });

  test("reports a mismatch, a missing field, a missing file, and an unknown license", () => {
    expect(checkLicenseConsistency(MIT, "Apache-2.0")).toContain(
      "LICENSE is MIT but package.json#license is Apache-2.0",
    );
    expect(checkLicenseConsistency(MIT, undefined)).toContain("missing a license field");
    expect(checkLicenseConsistency(undefined, "MIT")).toBe("LICENSE file is missing");
    expect(checkLicenseConsistency("Custom", "MIT")).toContain("could not detect");
  });

  test("this repository's LICENSE matches package.json", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { license?: string };
    expect(checkLicenseConsistency(readFileSync("LICENSE", "utf8"), pkg.license)).toBeUndefined();
  });
});
