import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

export type SafeAreaEdge = "top" | "bottom";

type SafeAreaViewProps = {
  edges?: SafeAreaEdge[];
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

// react-native-safe-area-context is optional: Expo and most apps already have
// it. Metro allows a missing module inside try/catch, so the SDK still bundles
// (without bottom padding) when it isn't installed. React Native's own
// SafeAreaView is deprecated and warns on use.
let NativeSafeAreaView: React.ComponentType<SafeAreaViewProps> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  NativeSafeAreaView = require("react-native-safe-area-context").SafeAreaView ?? null;
} catch {
  NativeSafeAreaView = null;
}

/** Whether insets can be measured, so content may draw under system bars. */
export const canPadSafeArea = NativeSafeAreaView !== null;

export function SafeArea({ edges, style, children }: SafeAreaViewProps) {
  if (!edges?.length || !NativeSafeAreaView) {
    return <View style={style}>{children}</View>;
  }
  return (
    <NativeSafeAreaView edges={edges} style={style}>
      {children}
    </NativeSafeAreaView>
  );
}
