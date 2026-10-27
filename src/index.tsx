import {
  addChatOpenListener,
  addUnreadListener,
  closeChat,
  configure,
  getState,
  handleNotification,
  identify,
  isWonderchatNotification,
  openChat,
  refreshUnread,
  reset,
  sendMessage,
  setPushToken,
} from "./core";

export { VERSION } from "./core";
export type {
  ConfigureOptions,
  IdentifyParams,
  PushProvider,
  Subscription,
  WonderchatStorage,
} from "./types";
export { WonderchatChat } from "./WonderchatChat";
export type { WonderchatChatProps, WonderchatStrings } from "./WonderchatChat";
export { WonderchatProvider } from "./WonderchatProvider";
export type { WonderchatProviderProps } from "./WonderchatProvider";
export { useWonderchatChatOpen, useWonderchatUnreadCount } from "./hooks";

export const Wonderchat = {
  /**
   * Call once at startup. Loads the stored conversation (with `storage`) and
   * refreshes the unread count. Accepts `{ chatbotId, baseUrl, storage }` or
   * `(chatbotId, baseUrl)`.
   */
  configure,

  get isConfigured() {
    return getState().chatbotId !== null;
  },

  /** Who the user is, shown to your team in the inbox. Re-applied on every load. */
  identify,

  /** Sends `text` as the user. Waits for the chat to load if it isn't open yet. */
  sendMessage,

  /**
   * The device's push token. "EXPO" for an Expo push token
   * (`getExpoPushTokenAsync`), "APNS" / "FCM" for a native device token
   * (`getDevicePushTokenAsync`, or @react-native-firebase/messaging).
   */
  setPushToken,

  /** True when a notification came from Wonderchat (a reply from your team). */
  isWonderchatNotification,

  /** Opens the chat if the notification came from Wonderchat. Returns whether it did. */
  handleNotification,

  /** Presents the chat sheet. Requires `<WonderchatProvider>` near the app root. */
  openChat,

  closeChat,

  get isChatOpen() {
    return getState().isOpen;
  },

  /** Team replies the user hasn't seen. 0 while the chat is open. */
  get unreadCount() {
    return getState().unreadCount;
  },

  /** Re-fetches the unread count. Runs on configure and app foreground; call it when a Wonderchat push arrives in the foreground. */
  refreshUnread,

  addUnreadListener,

  addChatOpenListener,

  /** Call on sign-out: forgets the user, their conversation and push binding. */
  reset,
};

export default Wonderchat;
