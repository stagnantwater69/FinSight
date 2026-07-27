import type { ExpoConfig, ConfigContext } from "expo/config";

/**
 * Expo config.
 *
 * Environment comes from EXPO_PUBLIC_* variables in mobile/.env, which Expo
 * loads automatically. They are surfaced through `extra` so a single typed
 * accessor (src/lib/supabase.ts) reads them, rather than scattering
 * process.env lookups through the app.
 *
 * NOTE ON "PUBLIC": EXPO_PUBLIC_* values are embedded in the app bundle and are
 * readable by anyone with the APK. That is correct for all three of these — the
 * API base URL, the Supabase project URL, and the Supabase *publishable*
 * (anon) key are all designed to be client-visible. The service-role key is
 * never in this app; it stays server-side.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "FinSight",
  slug: "finsight",
  scheme: "finsight",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "light",

  // MASCOT SEAM — the owl badge mark becomes `icon` and the splash image here.
  // Left on the Expo template art for now: the mascot was not added to the web
  // app either (see the UI/UX pass), so there is no shared source file to point
  // at yet. Dropping the badge PNG in assets/ and swapping these two paths is
  // the whole change.
  icon: "./assets/icon.png",

  android: {
    package: "app.finsight.mobile",
    adaptiveIcon: {
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundColor: "#0e655c",
    },
    // Camera is requested at runtime by expo-image-picker; declaring it here
    // keeps the manifest honest about what the app can do.
    permissions: ["CAMERA", "READ_EXTERNAL_STORAGE"],
  },
  ios: {
    bundleIdentifier: "app.finsight.mobile",
    supportsTablet: true,
    infoPlist: {
      NSCameraUsageDescription:
        "FinSight uses the camera so you can take a photo of a receipt instead of typing it in.",
      NSPhotoLibraryUsageDescription:
        "FinSight can read a receipt from a photo you have already taken.",
    },
  },
  web: { favicon: "./assets/favicon.png" },

  plugins: [
    // Splash moved out of the top-level `splash` key in SDK 54+; it is plugin
    // config now.
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-icon.png",
        resizeMode: "contain",
        backgroundColor: "#0e655c", // brand-700, matching the web theme-color
      },
    ],
    "expo-secure-store",
    "expo-font",
    [
      "expo-image-picker",
      {
        photosPermission: "FinSight can read a receipt from a photo you have already taken.",
        cameraPermission: "FinSight uses the camera so you can photograph a receipt instead of typing it in.",
      },
    ],
  ],

  extra: {
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  },
});
