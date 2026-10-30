import { describe, expect, it } from "vitest";
import { UPLOAD_FOLDER, uploadFolderFor } from "@/lib/files/storage";
import { previewAdminPlan } from "../../scripts/preview-admin.mjs";

const DEV = "postgres://postgres.fbfkwwaeigrggcdrduit:x@aws-0-eu-west-2.pooler.supabase.com:6543/postgres";
const LIVE = "postgres://postgres.chvyskcfjmxxprxoczon:x@aws-0-eu-west-2.pooler.supabase.com:6543/postgres";

describe("upload folders outside the live site", () => {
  it("only the live site uses the folder asked for", () => {
    const folder = "CBS System/Fleet/ZZ33ZZZ/Service History";
    expect(uploadFolderFor(folder, { VERCEL: "1", VERCEL_ENV: "production" })).toBe(folder);
    expect(uploadFolderFor(folder, { VERCEL: "1", VERCEL_ENV: "preview" })).toBe(UPLOAD_FOLDER);
    expect(uploadFolderFor(folder, { VERCEL_ENV: "production" })).toBe(UPLOAD_FOLDER); // not on Vercel
    expect(uploadFolderFor(folder, {})).toBe(UPLOAD_FOLDER);
    expect(UPLOAD_FOLDER).toBe("CBS System/Hub uploads/Test");
  });
});

describe("preview admin user", () => {
  it("runs only on preview builds with a 4-digit PIN, never against live", () => {
    expect(previewAdminPlan({ VERCEL_ENV: "preview", PREVIEW_ADMIN_PIN: "4321", DATABASE_URL: DEV }).action).toBe("run");
    expect(previewAdminPlan({ VERCEL: "1", VERCEL_ENV: "production", PREVIEW_ADMIN_PIN: "4321", DATABASE_URL: LIVE }).action).toBe("skip");
    expect(previewAdminPlan({ VERCEL_ENV: "preview", DATABASE_URL: DEV }).action).toBe("skip");
    expect(previewAdminPlan({ VERCEL_ENV: "preview", PREVIEW_ADMIN_PIN: "12a4", DATABASE_URL: DEV }).action).toBe("fail");
    expect(previewAdminPlan({ VERCEL_ENV: "preview", PREVIEW_ADMIN_PIN: "4321", DATABASE_URL: LIVE }).action).toBe("fail");
    expect(previewAdminPlan({ VERCEL_ENV: "preview", PREVIEW_ADMIN_PIN: "4321", DATABASE_URL: LIVE, CBS_LIVE_DATABASE: "switch-over" }).action).toBe("fail");
  });
});
