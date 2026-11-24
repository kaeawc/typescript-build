/**
 * Detect the SPDX id of a LICENSE file from its header and compare it with
 * package.json#license, so the two cannot drift apart again (issue #31).
 */

const LICENSE_HEADERS: ReadonlyArray<readonly [spdx: string, header: RegExp]> = [
  ["MIT", /^\s*MIT License\b/i],
  ["Apache-2.0", /^\s*Apache License\s+Version 2\.0\b/i],
  ["ISC", /^\s*ISC License\b/i],
  ["BSD-3-Clause", /^\s*BSD 3-Clause License\b/i],
  ["BSD-2-Clause", /^\s*BSD 2-Clause License\b/i],
  ["MPL-2.0", /^\s*Mozilla Public License,?\s+Version 2\.0\b/i],
  ["Unlicense", /^\s*This is free and unencumbered software released into the public domain\b/i],
];

export const detectLicenseSpdx = (licenseText: string): string | undefined =>
  LICENSE_HEADERS.find(([, header]) => header.test(licenseText))?.[0];

/** Returns a failure message, or undefined when LICENSE and package.json agree. */
export const checkLicenseConsistency = (
  licenseText: string | undefined,
  packageLicense: string | undefined,
): string | undefined => {
  if (licenseText === undefined) {
    return "LICENSE file is missing";
  }
  if (!packageLicense) {
    return "package.json is missing a license field";
  }
  const detected = detectLicenseSpdx(licenseText);
  if (!detected) {
    return `could not detect the license in LICENSE; make sure package.json#license (${packageLicense}) matches it and add its header to scripts/license-check.ts`;
  }
  if (detected !== packageLicense) {
    return `license mismatch: LICENSE is ${detected} but package.json#license is ${packageLicense}; update them together`;
  }
  return undefined;
};
