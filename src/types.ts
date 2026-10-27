export type PushProvider = "EXPO" | "APNS" | "FCM";

export type IdentifyParams = {
  email?: string;
  name?: string;
  phoneNumber?: string;
  custom?: Record<string, string>;
};

/** The subset of AsyncStorage the SDK uses to remember the conversation. */
export type WonderchatStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export type ConfigureOptions = {
  chatbotId: string;
  /** Defaults to https://app.wonderchat.io. */
  baseUrl?: string;
  /**
   * Remembers the conversation across launches so the unread badge and push
   * registration work before the chat is opened. Pass AsyncStorage, or any
   * object with the same getItem/setItem/removeItem. In memory if omitted.
   */
  storage?: WonderchatStorage;
};

export type Subscription = { remove(): void };

export type Conversation = { chatlogId: string; userToken: string };
