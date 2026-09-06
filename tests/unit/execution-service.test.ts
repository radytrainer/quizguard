import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/backend/execution/piston-client", () => ({
  pistonExecute: vi.fn(),
}));

// Imported after the mock so the module under test picks up the mocked pistonExecute.
const { pistonExecute } = await import("@/backend/execution/piston-client");
const { runSampleTestCases, gradeCodeAnswer } = await import(
  "@/backend/execution/execution.service"
);

const mockedExecute = vi.mocked(pistonExecute);

describe("execution.service", () => {
  beforeEach(() => {
    mockedExecute.mockReset();
  });

  it("returns ok:true with no Piston calls at all for html/css (nothing to execute)", async () => {
    const result = await runSampleTestCases("html", "<p>hi</p>", [
      { id: "tc1", input: "", expectedOutput: "hi" },
    ]);
    expect(result).toEqual({ ok: true, results: [] });
    expect(mockedExecute).not.toHaveBeenCalled();

    const cssResult = await gradeCodeAnswer("css", "p { color: red; }", []);
    expect(cssResult).toEqual({ ok: true, results: [] });
    expect(mockedExecute).not.toHaveBeenCalled();
  });

  it("marks a test case passed when stdout matches and exit code is 0", async () => {
    mockedExecute.mockResolvedValue({
      run: { stdout: "7\n", stderr: "", code: 0, signal: null },
    });
    const result = await runSampleTestCases("python", "print(7)", [
      { id: "tc1", input: "", expectedOutput: "7" },
    ]);
    expect(result.ok).toBe(true);
    expect(result.results).toEqual([
      { testCaseId: "tc1", passed: true, stdout: "7\n", stderr: "" },
    ]);
  });

  it("marks a test case failed when stdout doesn't match, even with exit code 0", async () => {
    mockedExecute.mockResolvedValue({
      run: { stdout: "8\n", stderr: "", code: 0, signal: null },
    });
    const result = await runSampleTestCases("python", "print(8)", [
      { id: "tc1", input: "", expectedOutput: "7" },
    ]);
    expect(result.results[0]?.passed).toBe(false);
  });

  it("marks a test case failed on a non-zero exit code regardless of stdout", async () => {
    mockedExecute.mockResolvedValue({
      run: { stdout: "7\n", stderr: "Traceback...", code: 1, signal: null },
    });
    const result = await gradeCodeAnswer("python", "raise Exception()", [
      { id: "tc1", input: "", expectedOutput: "7" },
    ]);
    expect(result.ok).toBe(true);
    expect(result.results[0]?.passed).toBe(false);
    expect(result.results[0]?.stderr).toContain("Traceback");
  });

  it("runs multiple test cases sequentially and reports each result", async () => {
    mockedExecute
      .mockResolvedValueOnce({ run: { stdout: "1\n", stderr: "", code: 0, signal: null } })
      .mockResolvedValueOnce({ run: { stdout: "wrong\n", stderr: "", code: 0, signal: null } });
    const result = await gradeCodeAnswer("javascript", "...", [
      { id: "tc1", input: "", expectedOutput: "1" },
      { id: "tc2", input: "", expectedOutput: "2" },
    ]);
    expect(mockedExecute).toHaveBeenCalledTimes(2);
    expect(result.results.map((r) => r.passed)).toEqual([true, false]);
  });

  it("degrades to ok:false without throwing when Piston is unreachable", async () => {
    mockedExecute.mockRejectedValue(new Error("fetch failed"));
    const result = await gradeCodeAnswer("python", "print(1)", [
      { id: "tc1", input: "", expectedOutput: "1" },
    ]);
    expect(result.ok).toBe(false);
    expect(result.results).toEqual([]);
    expect(result.error).toBeTruthy();
  });

  it("truncates very long stdout/stderr", async () => {
    const huge = "x".repeat(10000);
    mockedExecute.mockResolvedValue({
      run: { stdout: huge, stderr: "", code: 0, signal: null },
    });
    const result = await runSampleTestCases("python", "...", [
      { id: "tc1", input: "", expectedOutput: huge },
    ]);
    expect(result.results[0]?.stdout.length).toBeLessThan(huge.length);
    expect(result.results[0]?.stdout).toContain("truncated");
  });
});
