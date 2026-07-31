import { useState } from "react";
import { ActivityIndicator, Image, Pressable, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { ErrorNote, T } from "./ui";
import { api, errorMessage } from "../lib/api";
import { brand, ink, paper, radius, space } from "../theme/tokens";

/**
 * Choosing a profile photo or a business logo.
 *
 * The endpoints have existed since before mobile had any way to reach them,
 * so a phone could show an avatar the owner set on the web app but never set
 * one — which is the wrong way round, given the phone is where the camera is.
 *
 * Gallery only, deliberately. A logo is almost always an existing image file,
 * and a profile photo taken on the spot is a nice-to-have that would mean a
 * second permission prompt on a screen that is not about the camera.
 */
export function PhotoUpload({
  url,
  endpoint,
  label,
  shape = "circle",
  onUploaded,
}: {
  /** The current image, or null when none is set. */
  url: string | null;
  /** Where the multipart POST goes. */
  endpoint: string;
  label: string;
  shape?: "circle" | "square";
  onUploaded: (updated: unknown) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const size = 72;

  async function pick() {
    setError(null);
    const res = await ImagePicker.launchImageLibraryAsync({
      quality: 0.7,
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (res.canceled || !res.assets[0]) return;

    const asset = res.assets[0];
    setBusy(true);
    try {
      const form = new FormData();
      // React Native's FormData takes this {uri,name,type} shape rather than a
      // Blob — the browser's File API does not exist here.
      form.append("file", {
        uri: asset.uri,
        name: asset.fileName ?? `photo-${Date.now()}.jpg`,
        type: asset.mimeType ?? "image/jpeg",
      } as any);
      onUploaded(await api.upload(endpoint, form));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ marginBottom: space.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <View
          style={{
            width: size,
            height: size,
            borderRadius: shape === "circle" ? size / 2 : radius.md,
            backgroundColor: paper[100],
            borderWidth: 1,
            borderColor: ink[200],
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {busy ? (
            <ActivityIndicator color={brand[600]} />
          ) : url ? (
            <Image source={{ uri: url }} style={{ width: size, height: size }} accessibilityIgnoresInvertColors />
          ) : (
            <T variant="caption" style={{ color: ink[400] }}>None</T>
          )}
        </View>

        <View style={{ flex: 1 }}>
          <T variant="label" style={{ color: ink[700] }}>{label}</T>
          <Pressable
            onPress={pick}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={url ? `Change ${label}` : `Add ${label}`}
            style={{ paddingVertical: space.sm, opacity: busy ? 0.5 : 1 }}
          >
            <T style={{ color: brand[700], fontSize: 14 }}>
              {busy ? "Uploading…" : url ? "Change photo" : "Choose a photo"}
            </T>
          </Pressable>
        </View>
      </View>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </View>
  );
}
