import React from "react";
import { Text } from "react-native";
import { act, render, screen } from "@testing-library/react-native";
import {
  Wonderchat,
  WonderchatProvider,
  useWonderchatChatOpen,
  useWonderchatUnreadCount,
} from "../src";
import { flush, mockFetch, postFromPage, resetAll } from "./helpers";

const UNREAD = "/api/mobile/unread";

function Badge() {
  const count = useWonderchatUnreadCount();
  const isOpen = useWonderchatChatOpen();
  return <Text testID="badge">{`${count}:${isOpen ? "open" : "closed"}`}</Text>;
}

afterEach(resetAll);

it("presents the chat sheet on openChat and dismisses it on closeChat", async () => {
  mockFetch();
  await Wonderchat.configure({ chatbotId: "bot" });
  await render(
    <WonderchatProvider>
      <Badge />
    </WonderchatProvider>,
  );
  expect(screen.queryByTestId("wonderchat-webview")).toBeNull();

  await act(async () => Wonderchat.openChat());
  expect(screen.getByTestId("wonderchat-sheet").props.visible).toBe(true);
  expect(screen.getByTestId("wonderchat-webview")).toBeTruthy();
  expect(screen.getByTestId("badge").props.children).toBe("0:open");

  await postFromPage("closeChat");
  expect(screen.getByTestId("badge").props.children).toBe("0:closed");
  expect(screen.queryByTestId("wonderchat-webview")).toBeNull();
});

it("closes on the Android back button / iOS swipe", async () => {
  mockFetch();
  await Wonderchat.configure({ chatbotId: "bot" });
  await render(<WonderchatProvider>{null}</WonderchatProvider>);
  await act(async () => Wonderchat.openChat());
  await act(async () => screen.getByTestId("wonderchat-sheet").props.onRequestClose());
  expect(Wonderchat.isChatOpen).toBe(false);
});

it("drives the unread badge hook", async () => {
  const api = mockFetch({ [UNREAD]: { body: { unreadCount: 0 } } });
  await Wonderchat.configure({ chatbotId: "bot" });
  await render(
    <WonderchatProvider>
      <Badge />
    </WonderchatProvider>,
  );
  await act(async () => Wonderchat.openChat());
  await postFromPage("chatlogToken", { chatlogId: "c1", userToken: "u1" });
  await act(async () => Wonderchat.closeChat());

  api.routes[UNREAD] = { body: { unreadCount: 2 } };
  await act(async () => {
    await Wonderchat.refreshUnread();
  });
  await flush();
  expect(screen.getByTestId("badge").props.children).toBe("2:closed");

  await act(async () => Wonderchat.openChat());
  expect(screen.getByTestId("badge").props.children).toBe("0:open");
});

it("warns when openChat is called without a provider", async () => {
  mockFetch();
  await Wonderchat.configure({ chatbotId: "bot" });
  const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  Wonderchat.openChat();
  await new Promise<void>((resolve) => setTimeout(() => resolve(), 0));
  expect(warn).toHaveBeenCalledWith(expect.stringMatching(/WonderchatProvider/));
});

it("opens without warning when a screen calls openChat on mount", async () => {
  mockFetch();
  await Wonderchat.configure({ chatbotId: "bot" });
  const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  function OpensOnMount() {
    React.useEffect(() => Wonderchat.openChat(), []);
    return <Badge />;
  }
  await render(
    <WonderchatProvider>
      <OpensOnMount />
    </WonderchatProvider>,
  );
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 0));
  });
  expect(screen.getByTestId("badge").props.children).toBe("0:open");
  expect(warn).not.toHaveBeenCalledWith(expect.stringMatching(/WonderchatProvider/));
});
