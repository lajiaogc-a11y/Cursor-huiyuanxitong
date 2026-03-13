import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type MemberPortalLiveUpdatePayload = {
  type: "portal_settings_updated" | "force_refresh";
  tenantId?: string | null;
  buildTime?: string;
  triggeredAt: number;
};

const CHANNEL_NAME = "member-portal-live";
const EVENT_NAME = "member_portal_live_update";

let sharedChannel: RealtimeChannel | null = null;
const listeners = new Set<(payload: MemberPortalLiveUpdatePayload) => void>();

function ensureSharedChannel() {
  if (sharedChannel) return;
  sharedChannel = supabase
    .channel(CHANNEL_NAME)
    .on("broadcast", { event: EVENT_NAME }, ({ payload }) => {
      const eventPayload = payload as MemberPortalLiveUpdatePayload | undefined;
      if (!eventPayload || !eventPayload.type) return;
      listeners.forEach((listener) => listener(eventPayload));
    });
  sharedChannel.subscribe();
}

async function sendBroadcast(payload: MemberPortalLiveUpdatePayload): Promise<void> {
  const sendChannel = supabase.channel(`${CHANNEL_NAME}-send-${Date.now()}`);

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error("Realtime subscribe timeout"));
    }, 5000);

    sendChannel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        window.clearTimeout(timeout);
        resolve();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        window.clearTimeout(timeout);
        reject(new Error(`Realtime channel status: ${status}`));
      }
    });
  });

  const result = await sendChannel.send({
    type: "broadcast",
    event: EVENT_NAME,
    payload,
  });

  supabase.removeChannel(sendChannel);

  if (result !== "ok") {
    throw new Error(`Broadcast failed: ${result}`);
  }
}

export function subscribeMemberPortalLiveUpdate(
  listener: (payload: MemberPortalLiveUpdatePayload) => void
): () => void {
  ensureSharedChannel();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && sharedChannel) {
      supabase.removeChannel(sharedChannel);
      sharedChannel = null;
    }
  };
}

export async function emitPortalSettingsUpdated(tenantId?: string | null): Promise<void> {
  await sendBroadcast({
    type: "portal_settings_updated",
    tenantId: tenantId || null,
    triggeredAt: Date.now(),
  });
}

export async function emitForceRefreshPrompt(buildTime?: string): Promise<void> {
  await sendBroadcast({
    type: "force_refresh",
    buildTime: buildTime || "",
    triggeredAt: Date.now(),
  });
}
