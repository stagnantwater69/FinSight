import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable } from "react-native";
import { space } from "../theme/tokens";

export function HeaderBackButton({ tintColor, onPress }: { tintColor?: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={onPress}
      style={({ pressed }) => ({
        width: 48,
        height: 48,
        // The system back arrow leaves its title at the 72pt keyline; without this
        // gap a custom back button pulled the title in beside the arrow, so screens
        // like Review records sat tighter than Edit record.
        marginRight: space.xxl,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name="arrow-back" size={24} color={tintColor} />
    </Pressable>
  );
}
