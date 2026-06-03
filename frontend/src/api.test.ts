import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProject, listProjects } from "./api";

describe("api client", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("aborts requests that exceed the timeout", async () => {
    const fetchMock = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const request = createProject("Retirement Ops");
    const expectation = expect(request).rejects.toThrow("API request timed out after 30s");
    await vi.advanceTimersByTimeAsync(30_000);

    await expectation;
  });

  it("retries safe read requests once after a transient server failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("temporary failure", { status: 503 }))
      .mockResolvedValueOnce(new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listProjects()).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
