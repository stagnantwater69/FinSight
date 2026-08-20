import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card, T } from "./ui";
import { useTourTarget } from "./tour/targets";
import type { TourTargetKey } from "./tour/steps";
import { brand, ink, radius, space, typeScale } from "../theme/tokens";
import * as haptics from "../lib/haptics";

export interface QuickAction {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  /**
   * Registers this tile as a product-tour target. Only the CSV import tile
   * uses it today; the property is here rather than in a lookup table so the
   * screen that owns the action list also owns what the tour points at.
   */
  tourTarget?: TourTargetKey;
}

/**
 * The daily-task shortcuts, four to a row.
 *
 * Scan already has the bottom bar's raised button, but repeating it here is
 * deliberate rather than redundant: that button is easy to miss on a first
 * open, and grouping it with the rest of the day's actions is how an owner
 * discovers that Add expense and Add sale exist at all without having to
 * find the Records tab first.
 */
export function QuickActions({ actions }: { actions: QuickAction[] }) {
  return (
    <Card>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {actions.map((a) => (
          <QuickActionTile key={a.key} action={a} />
        ))}
      </View>
    </Card>
  );
}

/**
 * One tile.
 *
 * Its own component only so that `useTourTarget` can be called once per tile
 * — a hook cannot be called inside a `map` in the parent. The tile is
 * otherwise exactly what it was.
 */
function QuickActionTile({ action }: { action: QuickAction }) {
  const tourTarget = useTourTarget(action.tourTarget);

  return (
    <Pressable
      {...tourTarget}
      onPress={() => {
        haptics.tapped();
        action.onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={action.label}
      style={({ pressed }) => ({
        width: "25%",
        alignItems: "center",
        gap: 6,
        paddingVertical: space.sm,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: radius.md,
          backgroundColor: brand[50],
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={action.icon} size={20} color={brand[700]} />
      </View>
      <T style={{ fontSize: typeScale.micro, color: ink[700], textAlign: "center" }} numberOfLines={2}>
        {action.label}
      </T>
    </Pressable>
  );
}
