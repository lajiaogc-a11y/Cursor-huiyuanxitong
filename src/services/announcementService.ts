import { announcementsApi } from "@/api/announcements";
import { ApiError } from "@/lib/apiClient";
import { fail, getErrorMessage, ok, type ServiceResult } from "@/services/serviceResult";

export type AnnouncementScope = "global" | "tenant";
export type AnnouncementType = "info" | "warning" | "success" | "error";

export type SystemAnnouncement = {
  id: string;
  scope: AnnouncementScope;
  tenant_id: string | null;
  title: string;
  message: string;
  type: AnnouncementType;
  link: string | null;
  created_by: string | null;
  created_at: string;
};

export async function publishSystemAnnouncementResult(params: {
  scope: AnnouncementScope;
  tenantId?: string | null;
  title: string;
  message: string;
  type?: AnnouncementType;
  link?: string | null;
}): Promise<ServiceResult<{ announcementId: string; recipientCount: number }>> {
  try {
    const data = await announcementsApi.publish({
      p_scope: params.scope,
      p_tenant_id: params.tenantId ?? null,
      p_title: params.title,
      p_message: params.message,
      p_type: params.type ?? "info",
      p_link: params.link ?? null,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.success) {
      if (String(row?.message || "").startsWith("RATE_LIMITED:")) {
        const seconds = Number(String(row.message).split(":")[1] || 0);
        const minutes = Math.max(1, Math.ceil(seconds / 60));
        return fail("UNKNOWN", `RATE_LIMITED_ANNOUNCEMENT:${minutes}`, "COMMON");
      }
      const code =
        row?.message === "NO_PERMISSION"
          ? "NO_PERMISSION"
          : row?.message === "TENANT_REQUIRED"
            ? "TENANT_REQUIRED"
            : "UNKNOWN";
      return fail(code, String(row?.message || "UNKNOWN"), code === "NO_PERMISSION" ? "AUTH" : "COMMON");
    }
    return ok({
      announcementId: String(row.announcement_id),
      recipientCount: Number(row.recipient_count || 0),
    });
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 403) {
      return fail("NO_PERMISSION", "NO_PERMISSION", "AUTH", error);
    }
    return fail("UNKNOWN", getErrorMessage(error), "COMMON", error);
  }
}

export async function listSystemAnnouncementsResult(limit = 50): Promise<ServiceResult<SystemAnnouncement[]>> {
  try {
    const data = await announcementsApi.list({ p_limit: limit });
    return ok((Array.isArray(data) ? data : []) as SystemAnnouncement[]);
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 403) {
      return fail("NO_PERMISSION", "NO_PERMISSION", "AUTH", error);
    }
    return fail("UNKNOWN", getErrorMessage(error), "COMMON", error);
  }
}
