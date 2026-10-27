import { chatUrl, decideNavigation, originOf } from "../src/urls";

const ORIGIN = "https://app.wonderchat.io";

describe("chatUrl", () => {
  it("marks the page as hosted by React Native", () => {
    expect(chatUrl(ORIGIN, "bot 1")).toBe(`${ORIGIN}/chatbot/bot%201?wcHost=react-native`);
  });
});

describe("originOf", () => {
  it("lowercases scheme and host and keeps the port", () => {
    expect(originOf("HTTPS://App.Wonderchat.io:8443/x?y")).toBe("https://app.wonderchat.io:8443");
  });

  it("returns null without a host", () => {
    expect(originOf("mailto:a@b.com")).toBeNull();
  });
});

describe("decideNavigation", () => {
  it("keeps the chat's own pages in the web view", () => {
    expect(decideNavigation(`${ORIGIN}/chatbot/x`, ORIGIN, true)).toBe("load");
  });

  it("sends other sites, mail and phone links out of the app", () => {
    expect(decideNavigation("https://docs.example.com/a", ORIGIN, true)).toBe("external");
    expect(decideNavigation("mailto:help@example.com", ORIGIN, true)).toBe("external");
    expect(decideNavigation("tel:+15550100", ORIGIN, undefined)).toBe("external");
  });

  it("loads sub-frames such as embedded videos in place", () => {
    expect(decideNavigation("https://www.youtube.com/embed/x", ORIGIN, false)).toBe("load");
  });

  it("loads about/data/blob in place and blocks javascript:", () => {
    expect(decideNavigation("about:blank", ORIGIN, true)).toBe("load");
    expect(decideNavigation("blob:https://app.wonderchat.io/1", ORIGIN, true)).toBe("load");
    expect(decideNavigation("javascript:alert(1)", ORIGIN, true)).toBe("block");
  });
});
