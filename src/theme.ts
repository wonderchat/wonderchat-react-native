import { Platform, type ColorSchemeName } from "react-native";

// System backgrounds the chat shows until the page paints: iOS
// systemBackground (elevated, as in a sheet) and Material surface on Android.
export function sheetBackground(scheme: ColorSchemeName | null | undefined): string {
  if (scheme === "dark") return Platform.OS === "ios" ? "#1C1C1E" : "#121212";
  return "#FFFFFF";
}

export function secondaryText(scheme: ColorSchemeName | null | undefined): string {
  return scheme === "dark" ? "rgba(235,235,245,0.6)" : "rgba(60,60,67,0.6)";
}

export function primaryText(scheme: ColorSchemeName | null | undefined): string {
  return scheme === "dark" ? "#FFFFFF" : "#000000";
}

export function grabberColor(scheme: ColorSchemeName | null | undefined): string {
  return scheme === "dark" ? "rgba(235,235,245,0.3)" : "rgba(60,60,67,0.3)";
}

export const ACCENT = "#3658D8";
