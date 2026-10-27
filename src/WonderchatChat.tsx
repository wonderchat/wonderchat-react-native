import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  WebView,
  type WebViewMessageEvent,
  type WebViewNavigation,
} from "react-native-webview";
import { VERSION, createChatSession, getState } from "./core";
import { SafeArea, type SafeAreaEdge } from "./safe-area";
import { ACCENT, primaryText, secondaryText, sheetBackground } from "./theme";
import { chatUrl, decideNavigation, originOf } from "./urls";

export type WonderchatStrings = {
  /** Shown when the chat can't load (offline, server error). */
  errorTitle?: string;
  /** Button that reloads the chat after an error. */
  retry?: string;
};

export type WonderchatChatProps = {
  style?: StyleProp<ViewStyle>;
  /**
   * Called when the user taps the chat's close button. Defaults to
   * `Wonderchat.closeChat()`, which dismisses the sheet.
   */
  onClose?: () => void;
  strings?: WonderchatStrings;
  /**
   * Safe-area edges to pad, for a chat that runs to the screen edge. Needs
   * react-native-safe-area-context; ignored without it. The sheet pads the
   * bottom (home indicator / navigation bar) automatically.
   */
  edges?: SafeAreaEdge[];
};

const DEFAULT_STRINGS: Required<WonderchatStrings> = {
  errorTitle: "Couldn't load the chat",
  retry: "Try again",
};

// Older servers don't post chatbotLoaded; stop the spinner anyway once the
// page has finished loading for this long.
const LOADED_FALLBACK_MS = 8000;

const NATIVE_COLOR_EVENT = "wcNativeEdgeColor";

// Reads the colour behind the bottom of the page (the composer) so the
// safe-area strip under it matches instead of showing the system background.
const REPORT_EDGE_COLOR_JS = `(function(){try{
var el=document.elementFromPoint(window.innerWidth/2,window.innerHeight-2);
while(el){var c=getComputedStyle(el).backgroundColor;
if(c&&c!=="transparent"&&!/rgba\\([^)]*,\\s*0\\)$/.test(c)){
window.ReactNativeWebView.postMessage(JSON.stringify({type:"${NATIVE_COLOR_EVENT}",payload:{color:c}}));return;}
el=el.parentElement;}
}catch(e){}})();true;`;

// react-native-webview 14 types its class as Component<WebViewProps & P> with
// P = undefined, which collapses to never under strictNullChecks.
type NoExtraProps = Record<never, never>;

function openExternal(url: string) {
  Linking.openURL(url).catch(() => undefined);
}

/**
 * The chat itself. `<WonderchatProvider>` shows it in a sheet; render it
 * directly to give support its own screen or tab.
 */
export function WonderchatChat({ style, onClose, strings, edges }: WonderchatChatProps) {
  const scheme = useColorScheme();
  const webViewRef = useRef<WebView<NoExtraProps>>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [isReady, setIsReady] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const [edgeColor, setEdgeColor] = useState<string | null>(null);
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const { chatbotId, baseUrl } = getState();
  const text = { ...DEFAULT_STRINGS, ...strings };

  const session = useMemo(
    () =>
      createChatSession(
        { inject: (js) => webViewRef.current?.injectJavaScript(js) },
        { onLoaded: () => setIsReady(true) },
      ),
    [],
  );
  useEffect(() => () => session.dispose(), [session]);

  useEffect(() => {
    if (!isReady) {
      overlayOpacity.setValue(1);
      setShowOverlay(true);
      return;
    }
    const animation = Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => finished && setShowOverlay(false));
    return () => animation.stop();
  }, [isReady, overlayOpacity]);

  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => clearFallback(), []);
  function clearFallback() {
    if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    fallbackTimer.current = null;
  }

  if (!chatbotId) {
    console.error(
      "Wonderchat: call Wonderchat.configure({ chatbotId }) before rendering the chat",
    );
    return null;
  }

  const uri = chatUrl(baseUrl, chatbotId);
  const chatOrigin = originOf(uri);
  const background = sheetBackground(scheme);

  const handleMessage = (event: WebViewMessageEvent) => {
    const raw = event.nativeEvent.data;
    let type: unknown;
    let payload: unknown;
    try {
      ({ type, payload } = JSON.parse(raw) ?? {});
    } catch {
      return;
    }
    if (type === NATIVE_COLOR_EVENT) {
      const color = (payload as { color?: unknown } | undefined)?.color;
      if (typeof color === "string" && /^rgba?\([\d.,\s%]+\)$/.test(color)) {
        setEdgeColor(color);
      }
      return;
    }
    if (type === "closeChat" && onCloseRef.current) {
      onCloseRef.current();
      return;
    }
    session.handleMessage(raw);
    if (type === "chatbotLoaded") {
      clearFallback();
      webViewRef.current?.injectJavaScript(REPORT_EDGE_COLOR_JS);
    }
  };

  const handleShouldStart = (request: WebViewNavigation & { isTopFrame?: boolean }) => {
    const decision = decideNavigation(request.url, chatOrigin, request.isTopFrame);
    if (decision === "external") openExternal(request.url);
    return decision === "load";
  };

  const reload = () => {
    setHasError(false);
    setIsReady(false);
    session.reset();
    webViewRef.current?.reload();
  };

  const webView = (
    <WebView<NoExtraProps>
      ref={webViewRef}
      style={[styles.webView, { backgroundColor: background }]}
      containerStyle={{ backgroundColor: background }}
      source={{ uri }}
      originWhitelist={["*"]}
      applicationNameForUserAgent={`WonderchatReactNative/${VERSION}`}
      javaScriptEnabled
      domStorageEnabled
      sharedCookiesEnabled
      allowsInlineMediaPlayback
      allowsBackForwardNavigationGestures={false}
      keyboardDisplayRequiresUserAction={false}
      hideKeyboardAccessoryView
      bounces={false}
      overScrollMode="never"
      automaticallyAdjustContentInsets={false}
      contentInsetAdjustmentBehavior="never"
      setSupportMultipleWindows
      webviewDebuggingEnabled={typeof __DEV__ !== "undefined" && __DEV__}
      onMessage={handleMessage}
      onShouldStartLoadWithRequest={handleShouldStart}
      onOpenWindow={(event) => {
        const url = event.nativeEvent.targetUrl;
        if (decideNavigation(url, chatOrigin, true) !== "block") openExternal(url);
      }}
      onLoadStart={() => {
        clearFallback();
        session.reset();
      }}
      onLoadEnd={() => {
        clearFallback();
        fallbackTimer.current = setTimeout(() => setIsReady(true), LOADED_FALLBACK_MS);
      }}
      onError={() => {
        clearFallback();
        setHasError(true);
      }}
      onHttpError={(event) => {
        if (event.nativeEvent.url === uri && event.nativeEvent.statusCode >= 500) {
          clearFallback();
          setHasError(true);
        }
      }}
      // iOS can kill the web content process under memory pressure; reload
      // rather than leave a blank sheet.
      onContentProcessDidTerminate={reload}
      onRenderProcessGone={reload}
    />
  );

  return (
    <SafeArea
      edges={edges}
      style={[styles.container, { backgroundColor: edgeColor ?? background }, style]}
    >
      {Platform.OS === "android" ? (
        // WKWebView already keeps the focused composer above the keyboard on
        // iOS; Android's web view doesn't when the window is edge-to-edge.
        <KeyboardAvoidingView style={styles.fill} behavior="padding">
          {webView}
        </KeyboardAvoidingView>
      ) : (
        webView
      )}
      {(showOverlay || hasError) && (
        <Animated.View
          testID="wonderchat-loading"
          pointerEvents={hasError ? "auto" : "none"}
          style={[
            StyleSheet.absoluteFill,
            styles.overlay,
            { backgroundColor: background, opacity: hasError ? 1 : overlayOpacity },
          ]}
        >
          {hasError ? (
            <View style={styles.error} testID="wonderchat-error">
              <Text style={[styles.errorTitle, { color: primaryText(scheme) }]}>
                {text.errorTitle}
              </Text>
              <Pressable
                accessibilityRole="button"
                hitSlop={12}
                onPress={reload}
                style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
              >
                <Text style={styles.retryLabel}>{text.retry}</Text>
              </Pressable>
            </View>
          ) : (
            <ActivityIndicator color={secondaryText(scheme)} />
          )}
        </Animated.View>
      )}
    </SafeArea>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: "hidden" },
  fill: { flex: 1 },
  webView: { flex: 1 },
  overlay: { alignItems: "center", justifyContent: "center" },
  error: { alignItems: "center", paddingHorizontal: 32, gap: 16 },
  errorTitle: { fontSize: 17, fontWeight: "500", textAlign: "center" },
  retry: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: ACCENT,
  },
  retryLabel: { color: "#FFFFFF", fontSize: 15, fontWeight: "500" },
  pressed: { opacity: 0.7 },
});
