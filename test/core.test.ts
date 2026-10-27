import { Wonderchat } from "../src";
import { createChatSession } from "../src/core";
import { captureAppState, flush, memoryStorage, mockFetch } from "./helpers";
import { __resetForTests } from "../src/core";

const REGISTER = "/api/mobile/register-device";
const UNREAD = "/api/mobile/unread";
const CONVERSATION_KEY = "@wonderchat/bot/conversation";
const CLEAR_KEY = "@wonderchat/bot/clearHistory";

function fakeChat() {
  const injected: string[] = [];
  const session = createChatSession({ inject: (js) => injected.push(js) });
  const post = async (type: string, payload?: unknown) => {
    session.handleMessage(JSON.stringify({ type, payload }));
    await flush();
  };
  const methods = () =>
    injected.flatMap((js) => {
      const match = /w\.(\w+)\((.*)\);\}\}\)\(\);true;$/.exec(js);
      return match ? [{ method: match[1]!, arg: match[2] ? JSON.parse(match[2]) : undefined }] : [];
    });
  return { session, post, methods };
}

let appState: ReturnType<typeof captureAppState>;

beforeEach(() => {
  appState = captureAppState();
});

afterEach(() => {
  __resetForTests();
  jest.restoreAllMocks();
});

describe("configure", () => {
  it("requires a chatbot id", () => {
    expect(() => Wonderchat.configure({ chatbotId: "" })).toThrow(/chatbotId/);
    expect(Wonderchat.isConfigured).toBe(false);
  });

  it("accepts the positional form and trims the base URL", async () => {
    const api = mockFetch();
    await Wonderchat.configure("bot", "https://chat.example.com///");
    Wonderchat.setPushToken("tok", "EXPO");
    const chat = fakeChat();
    await chat.post("chatlogToken", { chatlogId: "c1", userToken: "u1" });
    expect(Wonderchat.isConfigured).toBe(true);
    expect(api.callsTo(REGISTER)).toHaveLength(1);
    expect((globalThis.fetch as jest.Mock).mock.calls[0][0]).toBe(
      "https://chat.example.com/api/mobile/register-device",
    );
  });

  it("restores the stored conversation so unread and push work before the chat opens", async () => {
    const storage = memoryStorage({
      [CONVERSATION_KEY]: JSON.stringify({ chatlogId: "c1", userToken: "u1" }),
    });
    const api = mockFetch({ [UNREAD]: { body: { unreadCount: 3 } } });
    Wonderchat.setPushToken("tok", "APNS");
    await Wonderchat.configure({ chatbotId: "bot", storage });
    await flush();
    expect(Wonderchat.unreadCount).toBe(3);
    expect(api.callsTo(REGISTER)[0]?.body).toEqual({
      chatbotId: "bot",
      chatlogId: "c1",
      userToken: "u1",
      pushToken: "tok",
      provider: "APNS",
    });
  });

  it("hands the stored conversation back to the page before identify and queued messages", async () => {
    const storage = memoryStorage({
      [CONVERSATION_KEY]: JSON.stringify({ chatlogId: "c1", userToken: "u1" }),
    });
    mockFetch();
    await Wonderchat.configure({ chatbotId: "bot", storage });
    Wonderchat.identify({ email: "a@b.co" });
    Wonderchat.sendMessage("Hello from setup");
    const chat = fakeChat();
    await chat.post("chatbotLoaded");
    expect(chat.methods()).toEqual([
      { method: "restoreConversation", arg: { chatlogId: "c1", userToken: "u1" } },
      { method: "identify", arg: { email: "a@b.co" } },
      { method: "sendMessage", arg: "Hello from setup" },
    ]);
  });

  it("ignores a corrupt or failing store", async () => {
    mockFetch();
    const corrupt = memoryStorage({ [CONVERSATION_KEY]: "{not json" });
    await Wonderchat.configure({ chatbotId: "bot", storage: corrupt });
    const failing = memoryStorage();
    (failing.getItem as jest.Mock).mockRejectedValue(new Error("disk"));
    await expect(Wonderchat.configure({ chatbotId: "bot", storage: failing })).resolves.toBeUndefined();
  });
});

describe("register-device", () => {
  it("registers once per conversation and token", async () => {
    const api = mockFetch();
    await Wonderchat.configure({ chatbotId: "bot" });
    Wonderchat.setPushToken("tok", "EXPO");
    const chat = fakeChat();
    await chat.post("chatlogToken", { chatlogId: "c1", userToken: "u1" });
    await chat.post("chatlogToken", { chatlogId: "c1", userToken: "u1" });
    Wonderchat.setPushToken("tok", "EXPO");
    await appState.foreground();
    expect(api.callsTo(REGISTER)).toHaveLength(1);

    Wonderchat.setPushToken("tok2", "EXPO");
    await flush();
    expect(api.callsTo(REGISTER)).toHaveLength(2);
  });

  it("retries on the next trigger after a failure", async () => {
    const api = mockFetch({ [REGISTER]: { status: 500 } });
    await Wonderchat.configure({ chatbotId: "bot" });
    Wonderchat.setPushToken("tok", "FCM");
    await fakeChat().post("chatlogToken", { chatlogId: "c1", userToken: "u1" });
    expect(api.callsTo(REGISTER)).toHaveLength(1);

    api.routes[REGISTER] = { status: 200 };
    await appState.foreground();
    expect(api.callsTo(REGISTER)).toHaveLength(2);
    await appState.foreground();
    expect(api.callsTo(REGISTER)).toHaveLength(2);
  });

  it("warns in development when no mobile app is set up", async () => {
    mockFetch({ [REGISTER]: { status: 404 } });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    await Wonderchat.configure({ chatbotId: "bot" });
    Wonderchat.setPushToken("tok", "EXPO");
    await fakeChat().post("chatlogToken", { chatlogId: "c1", userToken: "u1" });
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Installation → Mobile app/));
  });

  it("ignores tokens for another chatbot", async () => {
    const api = mockFetch();
    await Wonderchat.configure({ chatbotId: "bot" });
    Wonderchat.setPushToken("tok", "EXPO");
    await fakeChat().post("chatlogToken", { chatbotId: "other", chatlogId: "c1", userToken: "u1" });
    expect(api.callsTo(REGISTER)).toHaveLength(0);
  });
});

describe("unread count", () => {
  it("refreshes on foreground and notifies listeners", async () => {
    const api = mockFetch({ [UNREAD]: { body: { unreadCount: 0 } } });
    await Wonderchat.configure({ chatbotId: "bot" });
    await fakeChat().post("chatlogToken", { chatlogId: "c1", userToken: "u1" });
    const listener = jest.fn();
    Wonderchat.addUnreadListener(listener);

    api.routes[UNREAD] = { body: { unreadCount: 2 } };
    await appState.foreground();
    expect(Wonderchat.unreadCount).toBe(2);
    expect(listener).toHaveBeenLastCalledWith(2);
  });

  it("drops a response that arrives after the chat was opened", async () => {
    let respond: (value: Response) => void = () => undefined;
    mockFetch({
      [UNREAD]: () => new Promise<Response>((resolve) => (respond = resolve)),
    });
    await Wonderchat.configure({ chatbotId: "bot" });
    await fakeChat().post("chatlogToken", { chatlogId: "c1", userToken: "u1" });
    const pending = Wonderchat.refreshUnread();
    await flush();
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    Wonderchat.openChat();
    respond({ ok: true, status: 200, json: async () => ({ unreadCount: 5 }) } as Response);
    await pending;
    expect(Wonderchat.unreadCount).toBe(0);
  });

  it("stays 0 while the chat is open and resets on a new conversation", async () => {
    const api = mockFetch({ [UNREAD]: { body: { unreadCount: 4 } } });
    await Wonderchat.configure({ chatbotId: "bot" });
    const chat = fakeChat();
    await chat.post("chatlogToken", { chatlogId: "c1", userToken: "u1" });
    await Wonderchat.refreshUnread();
    expect(Wonderchat.unreadCount).toBe(4);

    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    Wonderchat.openChat();
    expect(Wonderchat.unreadCount).toBe(0);
    const before = api.callsTo(UNREAD).length;
    await Wonderchat.refreshUnread();
    expect(api.callsTo(UNREAD)).toHaveLength(before);

    Wonderchat.closeChat();
    await Wonderchat.refreshUnread();
    expect(Wonderchat.unreadCount).toBe(4);
    await chat.post("newConversation");
    expect(Wonderchat.unreadCount).toBe(0);
  });

  it("keeps the last count when offline or the body is invalid", async () => {
    const api = mockFetch({ [UNREAD]: { body: { unreadCount: 1 } } });
    await Wonderchat.configure({ chatbotId: "bot" });
    await fakeChat().post("chatlogToken", { chatlogId: "c1", userToken: "u1" });
    await Wonderchat.refreshUnread();
    api.routes[UNREAD] = { body: { unreadCount: "lots" } };
    await Wonderchat.refreshUnread();
    api.routes[UNREAD] = () => Promise.reject(new Error("offline"));
    await Wonderchat.refreshUnread();
    expect(Wonderchat.unreadCount).toBe(1);
  });
});

describe("identify and sendMessage", () => {
  it("queue until the page reports chatbotLoaded, then re-apply on reload", async () => {
    mockFetch();
    await Wonderchat.configure({ chatbotId: "bot" });
    const chat = fakeChat();
    Wonderchat.identify({ email: "a@b.com", custom: { plan: "pro" } });
    Wonderchat.sendMessage("Where is my order?");
    Wonderchat.sendMessage("   ");
    expect(chat.methods()).toEqual([]);

    await chat.post("chatbotLoaded");
    expect(chat.methods()).toEqual([
      { method: "identify", arg: { email: "a@b.com", custom: { plan: "pro" } } },
      { method: "sendMessage", arg: "Where is my order?" },
    ]);

    Wonderchat.sendMessage("Thanks");
    expect(chat.methods().at(-1)).toEqual({ method: "sendMessage", arg: "Thanks" });

    chat.session.reset();
    await chat.post("chatbotLoaded");
    expect(chat.methods().filter((c) => c.method === "identify")).toHaveLength(2);
    expect(chat.methods().filter((c) => c.method === "sendMessage")).toHaveLength(2);
  });
});

describe("closeChat from the page", () => {
  it("closes the sheet", async () => {
    mockFetch();
    await Wonderchat.configure({ chatbotId: "bot" });
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const listener = jest.fn();
    Wonderchat.addChatOpenListener(listener);
    Wonderchat.openChat();
    await fakeChat().post("closeChat");
    expect(Wonderchat.isChatOpen).toBe(false);
    expect(listener.mock.calls).toEqual([[true], [false]]);
  });
});

describe("reset", () => {
  it("clears a loaded chat immediately", async () => {
    const storage = memoryStorage();
    const api = mockFetch();
    await Wonderchat.configure({ chatbotId: "bot", storage });
    const chat = fakeChat();
    await chat.post("chatbotLoaded");
    await chat.post("chatlogToken", { chatlogId: "c1", userToken: "u1" });
    expect(storage.data.get(CONVERSATION_KEY)).toContain("c1");

    await Wonderchat.reset();
    await flush();
    expect(chat.methods().at(-1)).toEqual({ method: "clearChatbotHistory", arg: undefined });
    expect(storage.data.has(CONVERSATION_KEY)).toBe(false);
    expect(storage.data.has(CLEAR_KEY)).toBe(false);

    Wonderchat.setPushToken("tok", "EXPO");
    await flush();
    expect(api.callsTo(REGISTER)).toHaveLength(0);
  });

  it("persists the clear for the next load when no chat is mounted", async () => {
    const storage = memoryStorage();
    mockFetch();
    await Wonderchat.configure({ chatbotId: "bot", storage });
    await Wonderchat.reset();
    await flush();
    expect(storage.data.get(CLEAR_KEY)).toBe("1");

    // Next launch: the flag survives and is applied before identify.
    __resetForTests();
    captureAppState();
    await Wonderchat.configure({ chatbotId: "bot", storage });
    Wonderchat.identify({ email: "new@user.com" });
    const chat = fakeChat();
    await chat.post("chatbotLoaded");
    expect(chat.methods().map((c) => c.method)).toEqual(["clearChatbotHistory", "identify"]);
    await flush();
    expect(storage.data.has(CLEAR_KEY)).toBe(false);
  });
});
