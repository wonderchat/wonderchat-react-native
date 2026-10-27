import { useSyncExternalStore } from "react";
import { addChatOpenListener, addUnreadListener, getState } from "./core";

const subscribeUnread = (onChange: () => void) => {
  const subscription = addUnreadListener(onChange);
  return () => subscription.remove();
};

const subscribeOpen = (onChange: () => void) => {
  const subscription = addChatOpenListener(onChange);
  return () => subscription.remove();
};

/** Live count of team replies the user hasn't seen. 0 while the chat is open. */
export function useWonderchatUnreadCount(): number {
  return useSyncExternalStore(subscribeUnread, () => getState().unreadCount);
}

/** Whether the chat sheet opened by `Wonderchat.openChat()` is showing. */
export function useWonderchatChatOpen(): boolean {
  return useSyncExternalStore(subscribeOpen, () => getState().isOpen);
}
