import { supabase } from "./supabase";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Register for Web Push and store the subscription in Supabase.
 * Requires VITE_VAPID_PUBLIC_KEY and Notification permission.
 */
export async function subscribeToPush(): Promise<{ ok: boolean; error?: string }> {
  const key = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!key) return { ok: false, error: "Push is not configured (missing VITE_VAPID_PUBLIC_KEY)." };
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, error: "Push notifications are not supported in this browser." };
  }
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, error: "Notification permission was not granted." };

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key) as unknown as BufferSource,
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const json = sub.toJSON();
  if (!json.endpoint) return { ok: false, error: "Invalid push subscription." };

  await supabase
    .from("web_push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", json.endpoint);
  const { error } = await supabase.from("web_push_subscriptions").insert({
    user_id: user.id,
    endpoint: json.endpoint,
    subscription: json as unknown as Record<string, unknown>,
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function unsubscribePush(): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    const ep = sub.endpoint;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("web_push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", ep);
    }
    await sub.unsubscribe();
  }
}

export async function hasActivePushSubscription(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return !!sub;
}
