import { AppState, type NativeEventSubscription } from "react-native";
import { findWonderchatChatlogId } from "./notifications";
import type {
  ConfigureOptions,
  Conversation,
  IdentifyParams,
  PushProvider,
  Subscription,
  WonderchatStorage,
} from "./types";

export const VERSION = "1.0.0";
export const DEFAULT_BASE_URL = "https://app.wonderchat.io";

/** A mounted chat web view, as seen by the shared state. */
export type ChatHandle = { inject(js: string): void };

type State = {
  chatbotId: string | null;
  baseUrl: string;
  storage: WonderchatStorage | null;
  ready: Promise<void>;
  identity: IdentifyParams | null;
  push: { token: string; provider: PushProvider } | null;
  conversation: Conversation | null;
  registeredKey: string | null;
  clearHistoryOnLoad: boolean;
  pendingMessages: string[];
  loadedChats: ChatHandle[];
  unreadCount: number;
  unreadRequest: number;
  isOpen: boolean;
  providerCount: number;
  generation: number;
};

const initialState = (): State => ({
  chatbotId: null,
  baseUrl: DEFAULT_BASE_URL,
  storage: null,
  ready: Promise.resolve(),
  identity: null,
  push: null,
  conversation: null,
  registeredKey: null,
  clearHistoryOnLoad: false,
  pendingMessages: [],
  loadedChats: [],
  unreadCount: 0,
  unreadRequest: 0,
  isOpen: false,
  providerCount: 0,
  generation: 0,
});

let state = initialState();
let appStateSubscription: NativeEventSubscription | null = null;

const unreadListeners = new Set<(count: number) => void>();
const openListeners = new Set<(isOpen: boolean) => void>();

function subscribe<T>(
  listeners: Set<(value: T) => void>,
  listener: (value: T) => void,
): Subscription {
  listeners.add(listener);
  return { remove: () => listeners.delete(listener) };
}

const conversationKey = (chatbotId: string) =>
  `@wonderchat/${chatbotId}/conversation`;
const clearHistoryKey = (chatbotId: string) =>
  `@wonderchat/${chatbotId}/clearHistory`;

// Storage failures must never break the chat; the SDK falls back to memory.
async function storageGet(key: string): Promise<string | null> {
  try {
    return (await state.storage?.getItem(key)) ?? null;
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string | null) {
  const { storage } = state;
  if (!storage) return;
  const write = value === null ? storage.removeItem(key) : storage.setItem(key, value);
  Promise.resolve(write).catch(() => undefined);
}

function warn(message: string) {
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.warn(`Wonderchat: ${message}`);
  }
}

function setUnreadCount(count: number) {
  if (count === state.unreadCount) return;
  state.unreadCount = count;
  unreadListeners.forEach((listener) => listener(count));
}

function setOpen(isOpen: boolean) {
  if (isOpen) {
    // A refresh already in flight must not put the badge back while the
    // user is looking at the chat.
    state.unreadRequest++;
    setUnreadCount(0);
  }
  if (isOpen === state.isOpen) return;
  state.isOpen = isOpen;
  openListeners.forEach((listener) => listener(isOpen));
}

function setConversation(conversation: Conversation | null) {
  const current = state.conversation;
  if (
    current?.chatlogId === conversation?.chatlogId &&
    current?.userToken === conversation?.userToken
  ) {
    return;
  }
  state.conversation = conversation;
  if (state.chatbotId) {
    storageSet(
      conversationKey(state.chatbotId),
      conversation ? JSON.stringify(conversation) : null,
    );
  }
}

function setClearHistoryOnLoad(value: boolean) {
  state.clearHistoryOnLoad = value;
  if (state.chatbotId) {
    storageSet(clearHistoryKey(state.chatbotId), value ? "1" : null);
  }
}

function parseConversation(raw: string | null): Conversation | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (typeof value?.chatlogId === "string" && typeof value?.userToken === "string") {
      return { chatlogId: value.chatlogId, userToken: value.userToken };
    }
  } catch {
    // Corrupt entry: treat as no stored conversation.
  }
  return null;
}

function postJson(path: string, body: object) {
  return fetch(`${state.baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
}

export async function registerDeviceIfReady(): Promise<void> {
  const { chatbotId, push, conversation } = state;
  if (!chatbotId || !push || !conversation) return;
  const key = `${conversation.chatlogId}:${push.token}`;
  if (key === state.registeredKey) return;
  // Claimed before the request so concurrent triggers don't double-register;
  // released on failure so the next trigger retries.
  state.registeredKey = key;
  try {
    const res = await postJson("/api/mobile/register-device", {
      chatbotId,
      chatlogId: conversation.chatlogId,
      userToken: conversation.userToken,
      pushToken: push.token,
      provider: push.provider,
    });
    if (res.status === 404) {
      warn(
        "no mobile app is set up for this agent. Add one in the Wonderchat dashboard under Installation → Mobile app so replies reach the device.",
      );
    }
    if (!res.ok) throw new Error(`register-device ${res.status}`);
  } catch {
    if (state.registeredKey === key) state.registeredKey = null;
  }
}

export async function refreshUnread(): Promise<number> {
  await state.ready;
  const { chatbotId, conversation } = state;
  if (!chatbotId || !conversation || state.isOpen) return state.unreadCount;
  const request = ++state.unreadRequest;
  try {
    const res = await postJson("/api/mobile/unread", {
      chatbotId,
      chatlogId: conversation.chatlogId,
      userToken: conversation.userToken,
    });
    if (!res.ok) return state.unreadCount;
    const body: unknown = await res.json();
    const count =
      typeof body === "object" && body !== null && "unreadCount" in body
        ? Number((body as { unreadCount: unknown }).unreadCount)
        : NaN;
    // Ignore a response that a newer refresh, an open or a reset superseded.
    if (request === state.unreadRequest && Number.isFinite(count) && count >= 0) {
      setUnreadCount(Math.floor(count));
    }
  } catch {
    // Offline: keep the last known count.
  }
  return state.unreadCount;
}

function onAppStateChange(status: string) {
  if (status !== "active") return;
  void registerDeviceIfReady();
  void refreshUnread();
}

function injectCall(chat: ChatHandle, method: string, arg?: unknown) {
  const args = arg === undefined ? "" : JSON.stringify(arg);
  chat.inject(
    `(function(){var w=window.wonderchat;if(w&&typeof w.${method}==="function"){w.${method}(${args});}})();true;`,
  );
}

function latestLoadedChat(): ChatHandle | undefined {
  return state.loadedChats[state.loadedChats.length - 1];
}

function flushPendingMessages(chat: ChatHandle) {
  const messages = state.pendingMessages.splice(0);
  messages.forEach((text) => injectCall(chat, "sendMessage", text));
}

/**
 * Per-web-view bridge. Each mounted chat gets one; it reports to the shared
 * state and tells the web view what to run.
 */
export function createChatSession(chat: ChatHandle, callbacks: { onLoaded?: () => void } = {}) {
  let loaded = false;

  const markUnloaded = () => {
    loaded = false;
    state.loadedChats = state.loadedChats.filter((c) => c !== chat);
  };

  let disposed = false;

  const onChatbotLoaded = () => {
    markUnloaded();
    callbacks.onLoaded?.();
    // Wait for the stored state so a pending reset() clears history before
    // anything else runs in the page.
    void state.ready.then(() => {
      if (disposed || state.loadedChats.includes(chat)) return;
      loaded = true;
      state.loadedChats.push(chat);
      if (state.clearHistoryOnLoad) {
        injectCall(chat, "clearChatbotHistory");
        setClearHistoryOnLoad(false);
      } else if (state.conversation) {
        // The page has no embed script to hand it the conversation, so the
        // SDK restores it; identify and queued messages then land on it.
        injectCall(chat, "restoreConversation", state.conversation);
      }
      if (state.identity) injectCall(chat, "identify", state.identity);
      flushPendingMessages(chat);
    });
  };

  const handleMessage = (raw: string) => {
    let message: { type?: unknown; payload?: unknown };
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (typeof message !== "object" || message === null) return;
    const payload = (
      typeof message.payload === "object" && message.payload !== null ? message.payload : {}
    ) as Record<string, unknown>;

    switch (message.type) {
      case "chatbotLoaded":
        onChatbotLoaded();
        break;
      case "chatlogToken": {
        const { chatbotId, chatlogId, userToken } = payload;
        if (typeof chatbotId === "string" && state.chatbotId && chatbotId !== state.chatbotId) {
          break;
        }
        if (typeof chatlogId === "string" && typeof userToken === "string" && userToken) {
          setConversation({ chatlogId, userToken });
          void registerDeviceIfReady();
        }
        break;
      }
      case "newConversation":
        setConversation(null);
        state.unreadRequest++;
        setUnreadCount(0);
        break;
      case "closeChat":
        setOpen(false);
        break;
    }
  };

  return {
    handleMessage,
    /** The page is (re)loading; commands queue until it reports ready. */
    reset: markUnloaded,
    dispose: () => {
      disposed = true;
      markUnloaded();
    },
    get isLoaded() {
      return loaded;
    },
  };
}

export function configure(
  optionsOrChatbotId: ConfigureOptions | string,
  baseUrl?: string,
): Promise<void> {
  const options: ConfigureOptions =
    typeof optionsOrChatbotId === "string"
      ? { chatbotId: optionsOrChatbotId, baseUrl }
      : optionsOrChatbotId;
  if (!options?.chatbotId) {
    throw new Error("Wonderchat.configure requires a chatbotId");
  }

  if (options.chatbotId !== state.chatbotId) {
    state.conversation = null;
    state.registeredKey = null;
    state.clearHistoryOnLoad = false;
    state.unreadRequest++;
    setUnreadCount(0);
  }
  state.chatbotId = options.chatbotId;
  state.baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  state.storage = options.storage ?? null;

  if (!appStateSubscription) {
    appStateSubscription = AppState.addEventListener("change", onAppStateChange);
  }

  const generation = ++state.generation;
  const chatbotId = options.chatbotId;
  state.ready = (async () => {
    if (!state.storage) return;
    const [storedConversation, clearHistory] = await Promise.all([
      storageGet(conversationKey(chatbotId)),
      storageGet(clearHistoryKey(chatbotId)),
    ]);
    if (generation !== state.generation) return;
    // The chat may already have reported a newer conversation.
    if (!state.conversation) state.conversation = parseConversation(storedConversation);
    if (clearHistory === "1") state.clearHistoryOnLoad = true;
  })();

  void state.ready.then(() => {
    if (generation !== state.generation) return;
    void registerDeviceIfReady();
    void refreshUnread();
  });
  return state.ready;
}

export function identify(params: IdentifyParams) {
  state.identity = { ...params };
  state.loadedChats.forEach((chat) => injectCall(chat, "identify", state.identity));
}

export function sendMessage(text: string) {
  if (typeof text !== "string" || !text.trim()) return;
  const chat = latestLoadedChat();
  if (chat) injectCall(chat, "sendMessage", text);
  else state.pendingMessages.push(text);
}

export function setPushToken(token: string, provider: PushProvider) {
  if (!token) return;
  state.push = { token, provider };
  void registerDeviceIfReady();
}

export function isWonderchatNotification(payload: unknown): boolean {
  return findWonderchatChatlogId(payload) !== undefined;
}

export function handleNotification(payload: unknown): boolean {
  if (!isWonderchatNotification(payload)) return false;
  openChat();
  return true;
}

export function openChat() {
  // Checked a tick later: a screen's mount effect runs before the effect of
  // the WonderchatProvider wrapping it, so the provider registers just after.
  setTimeout(() => {
    if (state.providerCount === 0) {
      warn("openChat() needs <WonderchatProvider> near the root of your app.");
    }
  }, 0);
  setOpen(true);
}

export function closeChat() {
  setOpen(false);
}

export async function reset(): Promise<void> {
  await state.ready;
  state.identity = null;
  state.pendingMessages = [];
  state.registeredKey = null;
  setConversation(null);
  state.unreadRequest++;
  setUnreadCount(0);
  if (state.loadedChats.length > 0) {
    state.loadedChats.forEach((chat) => injectCall(chat, "clearChatbotHistory"));
    setClearHistoryOnLoad(false);
  } else {
    setClearHistoryOnLoad(true);
  }
}

export const getState = () => ({
  chatbotId: state.chatbotId,
  baseUrl: state.baseUrl,
  unreadCount: state.unreadCount,
  isOpen: state.isOpen,
  conversation: state.conversation,
});

export function addUnreadListener(listener: (count: number) => void): Subscription {
  return subscribe(unreadListeners, listener);
}

export function addChatOpenListener(listener: (isOpen: boolean) => void): Subscription {
  return subscribe(openListeners, listener);
}

/** Called by WonderchatProvider so openChat() can warn when none is mounted. */
export function registerProvider(): () => void {
  state.providerCount++;
  return () => {
    state.providerCount--;
  };
}

/** Test-only: forget all state, listeners and the AppState subscription. */
export function __resetForTests() {
  appStateSubscription?.remove();
  appStateSubscription = null;
  unreadListeners.clear();
  openListeners.clear();
  state = initialState();
}
