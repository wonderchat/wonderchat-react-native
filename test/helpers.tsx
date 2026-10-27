import { act } from "@testing-library/react-native";
import { AppState } from "react-native";
import { __resetForTests } from "../src/core";
import type { WonderchatStorage } from "../src/types";
import { webViews, type MockWebView } from "./webview-mock";

export type Route = { status?: number; body?: unknown } | (() => Promise<Response>);

type FetchCall = { path: string; body: Record<string, unknown> };

/**
 * Replaces global fetch. Each path answers with its route (default 200 `{}`);
 * `calls` records what the SDK sent.
 */
export function mockFetch(routes: Record<string, Route> = {}) {
  const calls: FetchCall[] = [];
  const fetchMock = jest.fn(async (url: string, init?: { body?: string }) => {
    const path = url.replace(/^https?:\/\/[^/]+/, "");
    calls.push({ path, body: init?.body ? JSON.parse(init.body) : {} });
    const route = routes[path];
    if (typeof route === "function") return route();
    const status = route?.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => route?.body ?? {},
    } as Response;
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return {
    calls,
    callsTo: (path: string) => calls.filter((call) => call.path === path),
    routes,
  };
}

export function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage: WonderchatStorage & { data: Map<string, string> } = {
    data,
    getItem: jest.fn(async (key: string) => data.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      data.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      data.delete(key);
    }),
  };
  return storage;
}

/** Lets pending promises (storage reads, fetches) settle. */
export async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await new Promise<void>((resolve) => setImmediate(() => resolve()));
  });
}

export function latestWebView(): MockWebView {
  const webView = webViews[webViews.length - 1];
  if (!webView) throw new Error("no WebView mounted");
  return webView;
}

/** Simulates the page posting a bridge message to the app. */
export async function postFromPage(type: string, payload?: unknown, webView = latestWebView()) {
  await act(async () => {
    webView.props.onMessage({ nativeEvent: { data: JSON.stringify({ type, payload }) } });
  });
  await flush();
}

/** The `window.wonderchat` calls the SDK injected into a web view, in order. */
export function injectedCalls(webView = latestWebView()): { method: string; arg?: unknown }[] {
  return webView.injectJavaScript.mock.calls.flatMap(([js]: [string]) => {
    const match = /w\.(\w+)\((.*)\);\}\}\)\(\);true;$/.exec(js);
    if (!match) return [];
    return [{ method: match[1]!, arg: match[2] ? JSON.parse(match[2]) : undefined }];
  });
}

/** Captures the AppState listener the SDK installs, to simulate foregrounding. */
export function captureAppState() {
  const handlers: ((status: string) => void)[] = [];
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, handler) => {
    handlers.push(handler as (status: string) => void);
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
  return {
    foreground: async () => {
      handlers.forEach((handler) => handler("active"));
      await flush();
    },
  };
}

export function resetAll() {
  __resetForTests();
  webViews.length = 0;
  jest.restoreAllMocks();
}
