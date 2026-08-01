import { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextProps,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ACCENT, brand, font, ink, paper, radius, space, statusText, TAP } from "../theme/tokens";
import { formatMoney, type AlertKind } from "../lib/money";

/**
 * Shared primitives, mirroring the web design system.
 *
 * ACCESSIBILITY: no text style here sets `allowFontScaling={false}`, so every
 * label respects the system font-size setting. Containers use minHeight rather
 * than fixed height for the same reason — when a user scales type up, rows grow
 * instead of clipping.
 */

// ---------------------------------------------------------------- Text

type Variant = "title" | "heading" | "body" | "label" | "caption";

const TEXT_VARIANTS: Record<Variant, TextStyle> = {
  title: { fontFamily: font.displayBold, fontSize: 20, color: brand[900] },
  heading: { fontFamily: font.display, fontSize: 15, color: ink[700] },
  body: { fontFamily: font.sans, fontSize: 15, color: ink[700], lineHeight: 22 },
  label: { fontFamily: font.sansMedium, fontSize: 13, color: ink[500] },
  caption: { fontFamily: font.sans, fontSize: 12, color: ink[400] },
};

export function T({
  variant = "body",
  style,
  children,
  ...rest
}: TextProps & { variant?: Variant; children?: ReactNode }) {
  return (
    <Text style={[TEXT_VARIANTS[variant], style]} {...rest}>
      {children}
    </Text>
  );
}

/**
 * A peso amount. Monospaced with tabular figures, exactly as on web — so a
 * column of amounts lines up and the app reads like a ledger.
 *
 * `fontVariant: ["tabular-nums"]` is honoured on iOS; on Android the mono face
 * is already fixed-advance, so alignment holds either way.
 */
export function Money({
  value,
  decimals = false,
  bare = false,
  size = 15,
  color = ink[900],
  weight = "medium",
  style,
}: {
  value: number;
  decimals?: boolean;
  bare?: boolean;
  size?: number;
  color?: string;
  weight?: "regular" | "medium" | "semibold";
  style?: TextStyle;
}) {
  const family =
    weight === "semibold" ? font.monoSemibold : weight === "medium" ? font.monoMedium : font.mono;
  return (
    <Text
      style={[{ fontFamily: family, fontSize: size, color, fontVariant: ["tabular-nums"] }, style]}
    >
      {formatMoney(value, { decimals, bare })}
    </Text>
  );
}

// ---------------------------------------------------------------- Button

type ButtonVariant = "primary" | "brand" | "secondary" | "ghost" | "danger";

export function Button({
  title,
  onPress,
  variant = "brand",
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  // primary = the amber accent, with DARK ink on it. White on amber measures
  // 2.04:1 and fails; this is the same rule the web app follows.
  const bg = {
    primary: ACCENT.fill,
    brand: brand[600],
    secondary: paper.DEFAULT,
    ghost: "transparent",
    danger: paper.DEFAULT,
  }[variant];
  const fg = {
    primary: ACCENT.onFill,
    brand: "#ffffff",
    secondary: ink[700],
    ghost: ink[500],
    danger: "#b91c1c",
  }[variant];
  const border =
    variant === "secondary" ? ink[200] : variant === "danger" ? "#fca5a5" : "transparent";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || !!loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: border, opacity: disabled || loading ? 0.6 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={{ fontFamily: font.sansSemibold, fontSize: 15, color: fg }}>{title}</Text>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------- Card

export function Card({
  children,
  style,
  emphasis = false,
}: {
  children: ReactNode;
  style?: ViewStyle;
  emphasis?: boolean;
}) {
  return (
    <View
      style={[
        styles.card,
        emphasis && { backgroundColor: brand[50], borderColor: brand[200] },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ---------------------------------------------------------------- StatTile

export function StatTile({
  label,
  value,
  sublabel,
  emphasis = false,
}: {
  label: string;
  value: number;
  sublabel?: string;
  emphasis?: boolean;
}) {
  return (
    <Card emphasis={emphasis} style={{ flex: 1, minWidth: 150 }}>
      <T variant="label" style={{ textTransform: "uppercase", letterSpacing: 0.4, color: emphasis ? brand[700] : ink[500] }}>
        {label}
      </T>
      <Money value={value} size={22} weight="semibold" color={emphasis ? brand[900] : ink[900]} style={{ marginTop: 4 }} />
      {sublabel ? <T variant="caption" style={{ marginTop: 2 }}>{sublabel}</T> : null}
    </Card>
  );
}

// ---------------------------------------------------------------- Alert family

const ALERT_SPEC: Record<AlertKind, { label: string; glyph: string; ink: string; surface: string }> = {
  "needs-review": { label: "Needs review", glyph: "!", ink: statusText.critical, surface: "#fef2f2" },
  "large-expense": { label: "Large expense", glyph: "▲", ink: statusText.serious, surface: "#fff7ed" },
  duplicate: { label: "Possible duplicate", glyph: "⧉", ink: statusText.warning, surface: "#fffbeb" },
  info: { label: "For your information", glyph: "i", ink: brand[700], surface: brand[50] },
};

/**
 * Same visual grammar as web: severity bar, circled glyph, label, then detail.
 * Severity is never colour-alone — every variant carries its own glyph and a
 * written label.
 */
export function Alert({
  kind,
  label,
  children,
  meta,
  action,
}: {
  kind: AlertKind;
  label?: string;
  children: ReactNode;
  meta?: string;
  action?: ReactNode;
}) {
  const spec = ALERT_SPEC[kind];
  return (
    <View style={[styles.alert, { backgroundColor: spec.surface }]}>
      <View style={{ width: 4, backgroundColor: spec.ink }} />
      <View style={styles.alertBody}>
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <View style={[styles.glyph, { backgroundColor: spec.ink }]}>
            <Text style={{ color: "#fff", fontSize: 11, fontFamily: font.sansSemibold }}>{spec.glyph}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <T variant="label" style={{ color: spec.ink, textTransform: "uppercase", letterSpacing: 0.3 }}>
              {label ?? spec.label}
            </T>
            <T style={{ fontSize: 14, marginTop: 2 }}>{children}</T>
            {meta ? <T variant="caption" style={{ marginTop: 2 }}>{meta}</T> : null}
          </View>
          {action}
        </View>
      </View>
    </View>
  );
}

export function AlertBadge({ kind, label }: { kind: AlertKind; label?: string }) {
  const spec = ALERT_SPEC[kind];
  return (
    <View style={[styles.badge, { backgroundColor: spec.ink }]}>
      <Text style={{ color: "#fff", fontSize: 11, fontFamily: font.sansMedium }}>
        {spec.glyph} {label ?? spec.label}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------- Empty state

export function EmptyState({
  title,
  body,
  action,
  icon = "＋",
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  icon?: string;
}) {
  return (
    <Card style={{ alignItems: "center", paddingVertical: space.xxl }}>
      <View style={styles.emptyIcon}>
        <Text style={{ fontSize: 20, color: brand[600] }}>{icon}</Text>
      </View>
      <T variant="heading" style={{ marginTop: space.md, textAlign: "center", color: ink[900] }}>
        {title}
      </T>
      {body ? (
        <T style={{ marginTop: space.sm, textAlign: "center", color: ink[500], fontSize: 14 }}>{body}</T>
      ) : null}
      {action ? <View style={{ marginTop: space.lg, alignSelf: "stretch" }}>{action}</View> : null}
    </Card>
  );
}

/** Goal-Gradient: how close a brand-new business is to its first insight. */
export function SetupProgress({ steps }: { steps: { label: string; done: boolean }[] }) {
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  return (
    <View style={styles.progress}>
      <T variant="label" style={{ color: brand[900], fontFamily: font.sansSemibold, fontSize: 14 }}>
        {done} of {steps.length} steps to your first insight
      </T>
      <View style={{ flexDirection: "row", gap: 6, marginTop: space.sm }}>
        {steps.map((s, i) => (
          <View
            key={s.label}
            style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i < done ? brand[500] : brand[200] }}
          />
        ))}
      </View>
      <View style={{ marginTop: space.md, gap: 6 }}>
        {steps.map((s) => (
          <T key={s.label} style={{ fontSize: 13, color: s.done ? ink[400] : ink[700] }}>
            {s.done ? "✓ " : "○ "}
            {s.label}
          </T>
        ))}
      </View>
    </View>
  );
}

/**
 * A short standing note attached to a form or panel — web's `Callout`.
 *
 * Distinct from `Alert`, which reports something that HAPPENED to a record
 * (a duplicate, a large expense) and carries a severity bar. A callout
 * explains the screen the owner is currently on.
 *
 * The warn tone deliberately uses `statusText.warning` rather than the amber
 * `accent` ramp: tokens.ts reserves accent for the recovery meter and primary
 * CTAs, and states that amber-as-warning is a different idea living in
 * `status`. Same rule as web.
 */
const CALLOUT_TONES = {
  info: { surface: brand[50], ink: brand[700], glyph: "ⓘ" },
  warn: { surface: "#fffbeb", ink: statusText.warning, glyph: "⚠" },
} as const;

export function Callout({
  tone = "info",
  children,
}: {
  tone?: keyof typeof CALLOUT_TONES;
  children: ReactNode;
}) {
  const spec = CALLOUT_TONES[tone];
  return (
    <View
      style={{
        flexDirection: "row",
        gap: space.sm,
        backgroundColor: spec.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: spec.ink + "33",
        padding: space.md,
      }}
    >
      <Text style={{ color: spec.ink, fontSize: 13, fontFamily: font.sansSemibold }}>{spec.glyph}</Text>
      <T style={{ flex: 1, fontSize: 13, lineHeight: 19, color: spec.ink }}>{children}</T>
    </View>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <View style={styles.errorNote}>
      <T style={{ color: "#991b1b", fontSize: 14 }}>{children}</T>
    </View>
  );
}

/**
 * A screen's background and its safe area.
 *
 * `safeTop` is off by default because most screens sit under a navigation
 * header, which already clears the status bar — adding the inset there would
 * push everything down twice. A screen with `headerShown: false` has nothing
 * above it and must ask for the inset, or its first line renders underneath
 * the clock and the battery.
 */
export function Screen({
  children,
  style,
  safeTop = false,
}: {
  children: ReactNode;
  style?: ViewStyle;
  safeTop?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        { flex: 1, backgroundColor: paper[50] },
        safeTop && { paddingTop: insets.top },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * The top of a screen: an optional eyebrow, a title, an optional line of
 * context, and room for one action.
 *
 * Every screen was building its own out of a `T variant="title"` and ad-hoc
 * margins, so no two had the same spacing above the first card. Sharing one
 * component is most of what makes a set of screens feel like one app rather
 * than several.
 */
export function ScreenHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.md, marginBottom: space.lg }}>
      <View style={{ flex: 1 }}>
        {eyebrow ? (
          <T variant="label" style={{ textTransform: "uppercase", letterSpacing: 0.6, color: ink[400] }}>
            {eyebrow}
          </T>
        ) : null}
        <T variant="title" numberOfLines={2}>
          {title}
        </T>
        {subtitle ? (
          <T variant="caption" style={{ marginTop: 2 }}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {action}
    </View>
  );
}

/** A hairline between rows inside a card. */
export function Divider({ style }: { style?: ViewStyle }) {
  return <View style={[{ height: 1, backgroundColor: paper[200] }, style]} />;
}

const styles = StyleSheet.create({
  button: {
    minHeight: TAP,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: space.sm,
  },
  /*
   * A card is a sheet of paper, not a coloured box.
   *
   * The border used to be brand[100], which tinted every surface in the app
   * faintly green and read as decoration applied to everything equally. A
   * neutral hairline plus a very soft shadow does the actual job — separating
   * the sheet from the background — and lets colour mean something when it
   * does appear.
   *
   * Both shadow systems are set because they are not interchangeable: iOS
   * reads shadowColor/Offset/Opacity/Radius, Android reads elevation only.
   * Giving one and not the other is how a card ends up flat on half the
   * devices it ships to.
   */
  card: {
    backgroundColor: paper.DEFAULT,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: paper[200],
    padding: space.lg,
    shadowColor: ink[900],
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  alert: { flexDirection: "row", borderRadius: radius.md, overflow: "hidden" },
  alertBody: { flex: 1, padding: space.md },
  glyph: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: radius.full,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: brand[50],
    alignItems: "center",
    justifyContent: "center",
  },
  progress: {
    backgroundColor: brand[50],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: brand[100],
    padding: space.lg,
    marginBottom: space.lg,
  },
  errorNote: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
  },
});
