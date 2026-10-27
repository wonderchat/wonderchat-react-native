import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  Wonderchat,
  WonderchatProvider,
  useWonderchatChatOpen,
  useWonderchatUnreadCount,
} from "@wonderchat/react-native";

const CHATBOT_ID = process.env.EXPO_PUBLIC_WONDERCHAT_CHATBOT_ID ?? "";
const BASE_URL = process.env.EXPO_PUBLIC_WONDERCHAT_BASE_URL;
// Opens the chat on launch and sends a message, so scripts/verify.sh --e2e
// can check the whole path on a simulator without tapping anything.
const SETUP_CHECK = process.env.EXPO_PUBLIC_SETUP_CHECK === "1";

if (CHATBOT_ID) {
  // A real app passes AsyncStorage as `storage` so the unread badge works
  // before the chat is opened. Left out here to keep the example dependency-free.
  void Wonderchat.configure({ chatbotId: CHATBOT_ID, baseUrl: BASE_URL });
}

function log(step: string) {
  console.log(`WONDERCHAT_SETUP_CHECK ${step}`);
}

function Home() {
  const unread = useWonderchatUnreadCount();
  const isOpen = useWonderchatChatOpen();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!SETUP_CHECK || !CHATBOT_ID) return;
    log("configured");
    Wonderchat.identify({ name: "Setup check", custom: { source: "example-app" } });
    Wonderchat.sendMessage("Setup check from the React Native example app");
    Wonderchat.openChat();
    setChecked(true);
  }, []);

  useEffect(() => {
    if (SETUP_CHECK && isOpen) log("chat-open");
  }, [isOpen]);

  if (!CHATBOT_ID) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Set EXPO_PUBLIC_WONDERCHAT_CHATBOT_ID</Text>
        <Text style={styles.body}>
          Copy your agent ID from the Wonderchat dashboard, then run{"\n"}
          EXPO_PUBLIC_WONDERCHAT_CHATBOT_ID=... npx expo start
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Wonderchat example</Text>
      {SETUP_CHECK && (
        <Text testID="setup-check" style={styles.body}>
          {checked ? "Setup check sent" : "Starting setup check"}
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        onPress={() => Wonderchat.openChat()}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Text style={styles.buttonLabel}>Chat with support</Text>
        {unread > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeLabel}>{unread}</Text>
          </View>
        )}
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => void Wonderchat.reset()}>
        <Text style={styles.link}>Sign out (reset)</Text>
      </Pressable>
    </View>
  );
}

export default function App() {
  return (
    <WonderchatProvider>
      <Home />
      <StatusBar style="auto" />
    </WonderchatProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 24,
    backgroundColor: "#FFFFFF",
  },
  title: { fontSize: 20, fontWeight: "600" },
  body: { fontSize: 15, color: "#555", textAlign: "center" },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "#3658D8",
  },
  pressed: { opacity: 0.7 },
  buttonLabel: { color: "#FFFFFF", fontSize: 16, fontWeight: "500" },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  badgeLabel: { color: "#3658D8", fontSize: 12, fontWeight: "600" },
  link: { color: "#3658D8", fontSize: 15 },
});
