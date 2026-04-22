/**
 * Commitlint — enforce conventional commits on the commit-msg hook.
 *
 * Conventional commit format:
 *
 *   <type>(<scope>): <subject>
 *
 *   [optional body]
 *
 *   [optional footer]
 *
 * Common types: feat, fix, chore, docs, refactor, test, perf, ci, build,
 * revert, style.
 *
 * Why: a machine-readable commit history means automated changelogs,
 * semver-aware version bumping, and one-click release notes.
 */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Allow slightly longer headers than the default (72) because scoped
    // types eat into the useful subject length.
    "header-max-length": [2, "always", 100],
  },
};
