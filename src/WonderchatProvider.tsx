import React, { useEffect } from "react";
import { Modal, Platform, StyleSheet, View, useColorScheme } from "react-native";
import { closeChat, registerProvider } from "./core";
import { useWonderchatChatOpen } from "./hooks";
import { canPadSafeArea } from "./safe-area";
import { grabberColor, sheetBackground } from "./theme";
import { WonderchatChat, type WonderchatStrings } from "./WonderchatChat";

export type WonderchatProviderProps = {
  children: React.ReactNode;
  strings?: WonderchatStrings;
};

/**
 * Hosts the chat sheet that `Wonderchat.openChat()` presents. Wrap your app
 * root once. iOS shows a page sheet (swipe down to dismiss); Android slides
 * up a full-screen chat that the back button closes.
 */
export function WonderchatProvider({ children, strings }: WonderchatProviderProps) {
  const isOpen = useWonderchatChatOpen();
  const scheme = useColorScheme();

  useEffect(() => registerProvider(), []);

  const isIOS = Platform.OS === "ios";
  // Edge-to-edge on Android only when the insets can be padded.
  const drawsUnderSystemBars = !isIOS && canPadSafeArea;

  return (
    <>
      {children}
      <Modal
        visible={isOpen}
        animationType="slide"
        presentationStyle={isIOS ? "pageSheet" : "fullScreen"}
        allowSwipeDismissal
        onRequestClose={closeChat}
        statusBarTranslucent={drawsUnderSystemBars}
        navigationBarTranslucent={drawsUnderSystemBars}
        testID="wonderchat-sheet"
      >
        <View style={[styles.sheet, { backgroundColor: sheetBackground(scheme) }]}>
          <WonderchatChat strings={strings} edges={isIOS ? ["bottom"] : ["top", "bottom"]} />
          {isIOS && (
            <View pointerEvents="none" style={styles.grabberRow}>
              <View style={[styles.grabber, { backgroundColor: grabberColor(scheme) }]} />
            </View>
          )}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  grabberRow: {
    position: "absolute",
    top: 5,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  grabber: { width: 36, height: 5, borderRadius: 2.5 },
});
