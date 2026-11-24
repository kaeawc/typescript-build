import { describe, expect, test } from "bun:test";
import { formatSlowestFiles, parseJunitFileTimings, parseTimingArgs } from "../../scripts/check-test-timing";

const JUNIT = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="bun test" tests="3" time="0.9">
  <testsuite name="test/a.test.ts" file="test/a.test.ts" tests="1" time="0.120">
    <testsuite name="a" file="test/a.test.ts" line="3" tests="1" time="0.100">
      <testcase name="works" classname="a" time="0.1" />
    </testsuite>
  </testsuite>
  <testsuite name="test/b.test.ts" file="test/b.test.ts" tests="2" time="0.4567">
    <testcase name="slow" classname="b" time="0.4" />
  </testsuite>
</testsuites>`;

describe("check-test-timing", () => {
  test("defaults to a 2 s budget, one run, and no margin", () => {
    expect(parseTimingArgs([])).toEqual({ budgetMs: 2000, runs: 1, margin: 1 });
  });

  test("parses budget, runs, and margin flags", () => {
    expect(parseTimingArgs(["--budget-ms=1500", "--runs=3", "--margin=1.25"])).toEqual({
      budgetMs: 1500,
      runs: 3,
      margin: 1.25,
    });
  });

  test("rejects invalid values and unknown flags", () => {
    expect(parseTimingArgs(["--budget-ms=0"])).toContain("Invalid budget");
    expect(parseTimingArgs(["--runs=1.5"])).toContain("Invalid runs");
    expect(parseTimingArgs(["--margin=0.5"])).toContain("Invalid margin");
    expect(parseTimingArgs(["--fast"])).toBe("Unknown argument: --fast");
  });

  test("reads per-file times from the outermost suite, slowest first", () => {
    expect(parseJunitFileTimings(JUNIT)).toEqual([
      { file: "test/b.test.ts", ms: 457 },
      { file: "test/a.test.ts", ms: 120 },
    ]);
  });

  test("formats the slowest files as a markdown table", () => {
    const table = formatSlowestFiles(
      [
        { file: "test/b.test.ts", ms: 457 },
        { file: "test/a.test.ts", ms: 120 },
      ],
      1,
    );
    expect(table).toBe("| ms | test file |\n| ---: | --- |\n| 457 | `test/b.test.ts` |");
  });
});
