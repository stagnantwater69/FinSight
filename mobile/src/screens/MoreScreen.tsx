import { Pressable, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card, Screen, T } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useBusinessProfiles } from "../context/BusinessProfileContext";
import { brand, ink, paper, radius, space, TAP } from "../theme/tokens";

/**
 * Everything that is not a daily task.
 *
 * The bottom bar previously spent one of its four slots on "Business", which
 * put profile settings at the same level as recording an expense — a thing an
 * owner does once next to a thing they do several times a day. Account,
 * businesses and alerts now live behind one "More" tab, which is the
 * convention on both platforms and frees the bar for work.
 */

function Row({
  icon,
  label,
  detail,
  onPress,
  first,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail?: string;
  onPress: () => void;
  first?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}. ${detail}` : label}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
        minHeight: TAP + 8,
        paddingVertical: space.sm,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: paper[200],
        backgroundColor: pressed ? paper[100] : "transparent",
      })}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: radius.sm,
          backgroundColor: brand[50],
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={18} color={brand[700]} />
      </View>
      <View style={{ flex: 1 }}>
        <T style={{ fontSize: 15, color: ink[900] }}>{label}</T>
        {detail ? (
          <T variant="caption" numberOfLines={1}>
            {detail}
          </T>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={ink[300]} />
    </Pressable>
  );
}

export function MoreScreen({ navigation }: any) {
  const { profile, logout } = useAuth();
  const { selected, profiles } = useBusinessProfiles();

  return (
    <Screen safeTop>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2, gap: space.lg }}>
        <View>
          <T variant="title">More</T>
          {profile ? (
            <T variant="caption" style={{ marginTop: 2 }}>
              Signed in as {profile.firstName} {profile.lastName}
            </T>
          ) : null}
        </View>

        <Card>
          <Row
            first
            icon="person-circle-outline"
            label="My account"
            detail={profile?.email}
            onPress={() => navigation.navigate("Profile")}
          />
          <Row
            icon="storefront-outline"
            label="Businesses"
            detail={
              selected
                ? `${selected.name}${profiles.length > 1 ? ` and ${profiles.length - 1} more` : ""}`
                : "Set one up to get started"
            }
            onPress={() => navigation.navigate("BusinessProfiles")}
          />
          <Row
            icon="notifications-outline"
            label="Alerts"
            detail="Duplicates, large expenses, anything worth a look"
            onPress={() => navigation.navigate("Notifications")}
          />
        </Card>

        <Card>
          <Row
            first
            icon="log-out-outline"
            label="Sign out"
            onPress={logout}
          />
        </Card>

        <T variant="caption" style={{ textAlign: "center" }}>
          FinSight — see smarter, spend wiser.
        </T>
      </ScrollView>
    </Screen>
  );
}
