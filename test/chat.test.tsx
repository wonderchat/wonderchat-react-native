import React from "react";
import { Linking } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Wonderchat, WonderchatChat } from "../src";
import { flush, injectedCalls, latestWebView, mockFetch, postFromPage, resetAll } from "./helpers";

beforeEach(async () => {
  mockFetch();
  await Wonderchat.configure({ chatbotId: "bot", baseUrl: "https://chat.example.com" });
});

afterEach(() => {
  jest.useRealTimers();
  resetAll();
});

it("loads the hosted chat page in React Native mode", async () => {
  await render(<WonderchatChat />);
  const { props } = latestWebView();
  expect(props.source).toEqual({ uri: "https://chat.example.com/chatbot/bot?wcHost=react-native" });
  expect(props.applicationNameForUserAgent).toMatch(/^WonderchatReactNative\//);
  expect(props.bounces).toBe(false);
  expect(props.hideKeyboardAccessoryView).toBe(true);
});

it("renders nothing and logs when not configured", async () => {
  resetAll();
  const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
  await render(<WonderchatChat />);
  expect(screen.queryByTestId("wonderchat-webview")).toBeNull();
  expect(error).toHaveBeenCalledWith(expect.stringMatching(/configure/));
});

it("shows a spinner until chatbotLoaded, then applies identify and queued messages", async () => {
  Wonderchat.identify({ name: "Ada" });
  Wonderchat.sendMessage("Hi");
  await render(<WonderchatChat />);
  expect(screen.getByTestId("wonderchat-loading")).toBeTruthy();
  expect(injectedCalls()).toEqual([]);

  await postFromPage("chatbotLoaded");
  expect(injectedCalls()).toEqual([
    { method: "identify", arg: { name: "Ada" } },
    { method: "sendMessage", arg: "Hi" },
  ]);
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 300));
  });
  expect(screen.queryByTestId("wonderchat-loading")).toBeNull();
});

it("stops the spinner after a fallback delay for servers without chatbotLoaded", async () => {
  jest.useFakeTimers();
  await render(<WonderchatChat />);
  await act(async () => {
    latestWebView().props.onLoadEnd();
    jest.advanceTimersByTime(8000);
  });
  await act(async () => {
    jest.advanceTimersByTime(500);
  });
  expect(screen.queryByTestId("wonderchat-loading")).toBeNull();
});

it("shows an error with retry that reloads the page", async () => {
  await render(<WonderchatChat strings={{ errorTitle: "Offline", retry: "Again" }} />);
  await act(async () => {
    latestWebView().props.onError({ nativeEvent: {} });
  });
  expect(screen.getByText("Offline")).toBeTruthy();
  await fireEvent.press(screen.getByText("Again"));
  expect(latestWebView().reload).toHaveBeenCalled();
  expect(screen.queryByTestId("wonderchat-error")).toBeNull();
});

it("treats a 5xx on the chat page as an error but ignores other resources", async () => {
  await render(<WonderchatChat />);
  const uri = latestWebView().props.source.uri;
  await act(async () => {
    latestWebView().props.onHttpError({ nativeEvent: { url: `${uri}x.js`, statusCode: 500 } });
  });
  expect(screen.queryByTestId("wonderchat-error")).toBeNull();
  await act(async () => {
    latestWebView().props.onHttpError({ nativeEvent: { url: uri, statusCode: 502 } });
  });
  expect(screen.getByTestId("wonderchat-error")).toBeTruthy();
});

it("opens links to other sites outside the app", async () => {
  const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
  await render(<WonderchatChat />);
  const { props } = latestWebView();
  expect(props.onShouldStartLoadWithRequest({ url: "https://chat.example.com/chatbot/bot", isTopFrame: true })).toBe(true);
  expect(props.onShouldStartLoadWithRequest({ url: "https://docs.example.com/", isTopFrame: true })).toBe(false);
  props.onOpenWindow({ nativeEvent: { targetUrl: "https://cal.example.com/book" } });
  props.onOpenWindow({ nativeEvent: { targetUrl: "javascript:alert(1)" } });
  expect(openURL.mock.calls).toEqual([["https://docs.example.com/"], ["https://cal.example.com/book"]]);
});

it("calls onClose for the page's close button instead of closing the sheet", async () => {
  const onClose = jest.fn();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  Wonderchat.openChat();
  await render(<WonderchatChat onClose={onClose} />);
  await postFromPage("closeChat");
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(Wonderchat.isChatOpen).toBe(true);
});

it("matches the safe-area strip to the page's composer colour", async () => {
  await render(<WonderchatChat />);
  await postFromPage("chatbotLoaded");
  expect(latestWebView().injectJavaScript.mock.calls.some(([js]: [string]) => js.includes("elementFromPoint"))).toBe(true);
  await postFromPage("wcNativeEdgeColor", { color: "rgb(250, 250, 250)" });
  await postFromPage("wcNativeEdgeColor", { color: "url(javascript:x)" });
  const root = screen.root!;
  const styles = [root.props.style].flat(3).filter(Boolean);
  expect(styles.some((s: { backgroundColor?: string }) => s.backgroundColor === "rgb(250, 250, 250)")).toBe(true);
});

it("forgets the loaded page when the web view reloads", async () => {
  await render(<WonderchatChat />);
  await postFromPage("chatbotLoaded");
  await act(async () => {
    latestWebView().props.onLoadStart();
  });
  Wonderchat.sendMessage("queued");
  await flush();
  expect(injectedCalls().some((c) => c.arg === "queued")).toBe(false);
  await postFromPage("chatbotLoaded");
  expect(injectedCalls().at(-1)).toEqual({ method: "sendMessage", arg: "queued" });
});
