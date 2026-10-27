import React, { forwardRef, useImperativeHandle, useRef } from "react";
import { View } from "react-native";

export type MockWebView = {
  props: Record<string, any>;
  injectJavaScript: jest.Mock;
  reload: jest.Mock;
};

/** Every mounted mock web view, newest last. */
export const webViews: MockWebView[] = [];

export const WebView = forwardRef(function MockWebViewComponent(
  props: Record<string, any>,
  ref,
) {
  const instance = useRef<MockWebView | null>(null);
  if (!instance.current) {
    instance.current = { props, injectJavaScript: jest.fn(), reload: jest.fn() };
    webViews.push(instance.current);
  }
  instance.current.props = props;
  useImperativeHandle(ref, () => ({
    injectJavaScript: instance.current!.injectJavaScript,
    reload: instance.current!.reload,
  }));
  return <View testID="wonderchat-webview" />;
});

export default WebView;
