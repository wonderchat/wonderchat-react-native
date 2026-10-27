export const HOST_PARAM = "react-native";

export function chatUrl(baseUrl: string, chatbotId: string): string {
  return `${baseUrl}/chatbot/${encodeURIComponent(chatbotId)}?wcHost=${HOST_PARAM}`;
}

/** `scheme://host[:port]`, lowercased, or null for URLs without a host. */
export function originOf(url: string): string | null {
  const match = /^([a-z][a-z0-9+.-]*:\/\/[^/?#]+)/i.exec(url);
  return match ? match[1]!.toLowerCase() : null;
}

const IN_PLACE = /^(about:|data:|blob:)/i;
const NEVER = /^javascript:/i;

export type NavigationDecision = "load" | "external" | "block";

/**
 * The chat stays in the web view; links to anything else (sources, booking
 * pages, mailto/tel) open outside the app. Sub-frames such as embedded videos
 * load in place.
 */
export function decideNavigation(
  url: string,
  chatOrigin: string | null,
  isTopFrame: boolean | undefined,
): NavigationDecision {
  if (NEVER.test(url)) return "block";
  if (IN_PLACE.test(url)) return "load";
  if (chatOrigin && originOf(url) === chatOrigin) return "load";
  if (isTopFrame === false) return "load";
  return "external";
}
