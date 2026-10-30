import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fileInfo, SharePointError, startUpload, UNREACHABLE } from "@/lib/files/sharepoint";

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("SharePoint through n8n", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("N8N_FILES_KEY", "test-key");
    vi.stubEnv("N8N_WEBHOOK_BASE", "https://n8n.example.test/webhook/");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sends the secret header to the right webhook", async () => {
    fetchMock.mockResolvedValue(reply(200, { ok: true, uploadUrl: "https://sp.test/u", folder: "CBS System/Hub uploads/Test", name: "a.pdf" }));
    const s = await startUpload("CBS System/Hub uploads/Test", "a.pdf", 10);
    expect(s.uploadUrl).toBe("https://sp.test/u");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://n8n.example.test/webhook/cbs-hub-files-start");
    expect(init.headers["X-CBS-Files-Key"]).toBe("test-key");
    expect(JSON.parse(init.body)).toEqual({ folder: "CBS System/Hub uploads/Test", fileName: "a.pdf", size: 10 });
  });

  it("passes on plain messages for a missing file", async () => {
    fetchMock.mockResolvedValue(reply(404, { ok: false, message: "That file is no longer in SharePoint." }));
    await expect(fileInfo("01ABCDEFGHIJ")).rejects.toMatchObject({ status: 404, message: "That file is no longer in SharePoint." });
  });

  it("shows 'not reachable' for a wrong key, an outage or no network", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Authorization data is wrong!", { status: 403 }));
    await expect(fileInfo("01ABCDEFGHIJ")).rejects.toMatchObject({ status: 502, message: UNREACHABLE });
    fetchMock.mockResolvedValueOnce(reply(502, { ok: false, message: "SharePoint isn't reachable right now." }));
    await expect(fileInfo("01ABCDEFGHIJ")).rejects.toMatchObject({ status: 502, message: UNREACHABLE });
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(fileInfo("01ABCDEFGHIJ")).rejects.toBeInstanceOf(SharePointError);
  });

  it("refuses to call n8n without the key", async () => {
    vi.stubEnv("N8N_FILES_KEY", "");
    await expect(fileInfo("01ABCDEFGHIJ")).rejects.toMatchObject({ status: 502 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses to call n8n without N8N_WEBHOOK_BASE (no built-in address)", async () => {
    for (const v of ["", "   ", "not-a-url"]) {
      vi.stubEnv("N8N_WEBHOOK_BASE", v);
      await expect(fileInfo("01ABCDEFGHIJ")).rejects.toMatchObject({ status: 502, message: UNREACHABLE });
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("N8N_WEBHOOK_BASE is not set"));
  });
});
