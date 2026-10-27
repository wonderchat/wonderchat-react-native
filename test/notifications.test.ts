import { findWonderchatChatlogId } from "../src/notifications";
import { Wonderchat } from "../src";
import { resetAll } from "./helpers";

afterEach(resetAll);

describe("findWonderchatChatlogId", () => {
  it("reads an APNs / Expo marker object", () => {
    expect(findWonderchatChatlogId({ wonderchat: { chatlogId: "c1" } })).toBe("c1");
  });

  it("reads the flat marker key", () => {
    expect(findWonderchatChatlogId({ wonderchatChatlogId: "c2" })).toBe("c2");
  });

  it("parses a JSON-string FCM data value", () => {
    const fcm = { data: { wonderchat: JSON.stringify({ chatlogId: "c3" }) } };
    expect(findWonderchatChatlogId(fcm)).toBe("c3");
  });

  it("finds the marker inside an expo-notifications response", () => {
    const response = {
      actionIdentifier: "expo.modules.notifications.actions.DEFAULT",
      notification: {
        request: { content: { title: "Support", data: { wonderchat: { chatlogId: "c4" } } } },
      },
    };
    expect(findWonderchatChatlogId(response)).toBe("c4");
  });

  it("finds the marker in an iOS trigger payload", () => {
    const notification = {
      request: { trigger: { type: "push", payload: { wonderchat: { chatlogId: "c5" } } } },
    };
    expect(findWonderchatChatlogId(notification)).toBe("c5");
  });

  it("returns null for a Wonderchat notification without an id", () => {
    expect(findWonderchatChatlogId({ data: { wonderchat: "not json" } })).toBeNull();
    expect(findWonderchatChatlogId({ wonderchat: {} })).toBeNull();
  });

  it("returns undefined for other notifications", () => {
    expect(findWonderchatChatlogId({ data: { orderId: "42" } })).toBeUndefined();
    expect(findWonderchatChatlogId(null)).toBeUndefined();
    expect(findWonderchatChatlogId("wonderchat")).toBeUndefined();
  });

  it("stops at the depth limit", () => {
    let nested: Record<string, unknown> = { wonderchat: { chatlogId: "deep" } };
    for (let i = 0; i < 10; i++) nested = { data: nested };
    expect(findWonderchatChatlogId(nested)).toBeUndefined();
  });
});

describe("Wonderchat.handleNotification", () => {
  it("opens the chat for Wonderchat notifications only", () => {
    Wonderchat.configure({ chatbotId: "bot" });
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(Wonderchat.handleNotification({ data: { orderId: "1" } })).toBe(false);
    expect(Wonderchat.isChatOpen).toBe(false);
    expect(Wonderchat.isWonderchatNotification({ wonderchat: { chatlogId: "c" } })).toBe(true);
    expect(Wonderchat.handleNotification({ wonderchat: { chatlogId: "c" } })).toBe(true);
    expect(Wonderchat.isChatOpen).toBe(true);
  });
});
