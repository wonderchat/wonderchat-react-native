# Wonderchat for React Native

Add Wonderchat's AI support chat to your React Native or Expo app, on iOS and
Android. The agent answers from your docs and hands the conversation to your
team when it can't help. Your team's replies reach the user as push
notifications and show up as an unread badge.

It works in Expo Go, in development builds and in bare React Native.

The quickest way to set it up is the prompt in your Wonderchat dashboard
(**Installation → Mobile app**). Paste it into your coding agent.

## Install

```sh
npx expo install @wonderchat/react-native react-native-webview
```

Bare React Native: `npm install @wonderchat/react-native react-native-webview`,
then `cd ios && pod install`.

`react-native-safe-area-context` is optional but recommended. Expo apps
usually have it already. With it, the chat keeps clear of the home indicator
and the Android system bars. Without it, the sheet still works but the
bottom inset isn't padded.

## Configure

Call `configure` once at startup and wrap your app root in
`WonderchatProvider`:

```tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Wonderchat, WonderchatProvider } from "@wonderchat/react-native";

Wonderchat.configure({ chatbotId: "YOUR_CHATBOT_ID", storage: AsyncStorage });

export default function App() {
  return <WonderchatProvider>{/* your app */}</WonderchatProvider>;
}
```

`storage` is optional. Pass AsyncStorage, or any object with
`getItem`/`setItem`/`removeItem`, so the conversation survives restarts. That
lets the unread badge and push registration work before the user opens the
chat again. Without it the SDK only keeps the conversation in memory.

If you self-host, pass `baseUrl` as well (it defaults to
`https://app.wonderchat.io`).

## Open the chat

```tsx
<Button title="Support" onPress={() => Wonderchat.openChat()} />
```

On iOS the chat opens as a page sheet that the user can swipe down. On
Android it slides up full screen and the back button closes it. The page's
own close button calls `Wonderchat.closeChat()`.

To give support its own screen or tab, render the chat directly:

```tsx
<WonderchatChat style={{ flex: 1 }} edges={["top", "bottom"]} onClose={() => navigation.goBack()} />
```

## Unread badge

```tsx
const unread = useWonderchatUnreadCount();
```

This is the number of team replies the user hasn't seen, and it is always 0
while the chat is open. The SDK refreshes it on `configure` and whenever the
app comes to the foreground. Outside React, use `Wonderchat.unreadCount` and
`Wonderchat.addUnreadListener(count => …)`, which returns `{ remove() }`.

## Identify users

```ts
Wonderchat.identify({ email: user.email, name: user.name, custom: { userId: user.id } });
```

Your team sees these details in the inbox. They are applied again every time
the chat loads.

On sign-out or account deletion, call `Wonderchat.reset()`. It forgets the
user, the conversation and the push binding, and clears the chat history,
either immediately or on the next load.

## Push notifications

With Expo push you don't need any credentials in the dashboard:

```ts
const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
Wonderchat.setPushToken(data, "EXPO");
```

With native tokens, pass `"APNS"` on iOS or `"FCM"` on Android
(`getDevicePushTokenAsync` or `@react-native-firebase/messaging`). Then add
your APNs key or Firebase service account in the dashboard.

To open the chat when the user taps a notification, and to refresh the badge
when one arrives:

```ts
Notifications.addNotificationResponseReceivedListener((response) => {
  Wonderchat.handleNotification(response.notification.request.content.data);
});
Notifications.addNotificationReceivedListener((notification) => {
  if (Wonderchat.isWonderchatNotification(notification)) void Wonderchat.refreshUnread();
});
```

On a cold start, also check `getLastNotificationResponseAsync()`.
`handleNotification` returns `false` and does nothing for notifications that
aren't Wonderchat's. It accepts the payload from expo-notifications, React
Native Firebase, raw FCM data or APNs `userInfo`.

## API

```ts
Wonderchat.configure(options: { chatbotId: string; baseUrl?: string; storage?: WonderchatStorage }): Promise<void>
Wonderchat.configure(chatbotId: string, baseUrl?: string): Promise<void>
Wonderchat.isConfigured: boolean
Wonderchat.identify(params: { email?: string; name?: string; phoneNumber?: string; custom?: Record<string, string> }): void
Wonderchat.sendMessage(text: string): void   // queued until the chat has loaded
Wonderchat.setPushToken(token: string, provider: "EXPO" | "APNS" | "FCM"): void
Wonderchat.isWonderchatNotification(payload: unknown): boolean
Wonderchat.handleNotification(payload: unknown): boolean
Wonderchat.openChat(): void
Wonderchat.closeChat(): void
Wonderchat.isChatOpen: boolean
Wonderchat.unreadCount: number
Wonderchat.refreshUnread(): Promise<number>
Wonderchat.addUnreadListener(listener: (count: number) => void): { remove(): void }
Wonderchat.addChatOpenListener(listener: (isOpen: boolean) => void): { remove(): void }
Wonderchat.reset(): Promise<void>

<WonderchatProvider strings?>{children}</WonderchatProvider>
<WonderchatChat style? onClose? strings? edges? />
useWonderchatUnreadCount(): number
useWonderchatChatOpen(): boolean
```

`strings` overrides the error state's text: `{ errorTitle, retry }`.

## Development

```sh
npm install
scripts/verify.sh          # type-check, unit tests, build and package contents
scripts/verify.sh --e2e    # also runs example/ in Expo Go on an iOS simulator
```

The E2E needs `WONDERCHAT_CHATBOT_ID` set to an agent that has a mobile app set
up, plus at least 5 GB free. It runs the example with
`EXPO_PUBLIC_SETUP_CHECK=1`, which opens the chat on launch and sends a
message. To try the example by hand:

```sh
cd example && npm install
EXPO_PUBLIC_WONDERCHAT_CHATBOT_ID=YOUR_CHATBOT_ID npx expo start
```

## License

MIT
