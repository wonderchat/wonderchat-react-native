// Keys the push libraries nest the custom payload under: expo-notifications
// (request.content.data, trigger.payload), React Native Firebase (data), APNs
// userInfo and raw FCM messages (notification/data).
const WRAPPER_KEYS = [
  "data",
  "content",
  "request",
  "notification",
  "trigger",
  "payload",
  "userInfo",
  "remoteMessage",
] as const;

const MAX_DEPTH = 5;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readMarker(value: Record<string, unknown>): string | null | undefined {
  if (typeof value.wonderchatChatlogId === "string") {
    return value.wonderchatChatlogId;
  }
  if (!("wonderchat" in value)) return undefined;
  let marker = value.wonderchat;
  // FCM data values are always strings, so the APNs/Expo object can arrive
  // JSON-encoded.
  if (typeof marker === "string") {
    try {
      marker = JSON.parse(marker);
    } catch {
      return null;
    }
  }
  if (isRecord(marker) && typeof marker.chatlogId === "string") {
    return marker.chatlogId;
  }
  return null;
}

/**
 * Finds Wonderchat's marker in a notification from any of the common push
 * libraries. Returns the chatlog id, `null` when the notification is ours but
 * carries no id, and `undefined` when it is not a Wonderchat notification.
 */
export function findWonderchatChatlogId(
  payload: unknown,
  depth = 0,
): string | null | undefined {
  if (!isRecord(payload) || depth > MAX_DEPTH) return undefined;
  const marker = readMarker(payload);
  if (marker !== undefined) return marker;
  for (const key of WRAPPER_KEYS) {
    const found = findWonderchatChatlogId(payload[key], depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}
