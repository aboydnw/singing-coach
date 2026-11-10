import { useEffect, type ReactNode } from "react";
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

// Native semantic roles mirror lib/theme.ts; Chakra runtime is not portable.
export const colors = {
  canvas: "#FFF8EF",
  surface: "#FFFDF6",
  ink: "#3D2C29",
  muted: "#6B594C",
  border: "#EADFCE",
  primary: "#B93E20",
  secondary: "#006254",
  inverse: "#FFFDF8",
  danger: "#973219",
  dangerSurface: "#FDF1EC",
  successSurface: "#E9F7F4",
};

export function Copy({
  children,
  muted = false,
}: {
  children: ReactNode;
  muted?: boolean;
}) {
  return <Text style={[styles.copy, muted && styles.muted]}>{children}</Text>;
}
export function Heading({
  children,
  small = false,
}: {
  children: ReactNode;
  small?: boolean;
}) {
  return (
    <Text accessibilityRole="header" style={small ? styles.subheading : styles.heading}>
      {children}
    </Text>
  );
}
export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}
export function Button({
  children,
  onPress,
  disabled = false,
  secondary = false,
  danger = false,
  hint,
}: {
  children: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  danger?: boolean;
  hint?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityHint={hint}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondary,
        danger && styles.danger,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonText, secondary && styles.secondaryText]}>
        {children}
      </Text>
    </Pressable>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: string;
  error?: boolean;
}) {
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(children);
  }, [children]);
  return (
    <View style={[styles.notice, error && styles.errorNotice]}>
      <Text
        accessibilityRole={error ? "alert" : undefined}
        accessibilityLiveRegion={error ? "assertive" : "polite"}
        style={[styles.copy, error && styles.errorText]}
      >
        {children}
      </Text>
    </View>
  );
}
export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas },
  content: {
    padding: 20,
    gap: 18,
    paddingBottom: 40,
    maxWidth: 640,
    width: "100%",
    alignSelf: "center",
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 10, alignItems: "center" },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 20,
    gap: 14,
  },
  heading: { fontSize: 32, lineHeight: 39, fontWeight: "700", color: colors.ink },
  subheading: { fontSize: 22, lineHeight: 28, fontWeight: "600", color: colors.ink },
  copy: { fontSize: 17, lineHeight: 25, color: colors.ink, flexShrink: 1 },
  muted: { color: colors.muted },
  label: { fontSize: 15, fontWeight: "600", color: colors.muted },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    color: colors.ink,
    fontSize: 17,
  },
  button: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: colors.inverse,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "600",
    textAlign: "center",
  },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: { color: colors.secondary },
  danger: { backgroundColor: colors.danger },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75 },
  notice: { padding: 16, borderRadius: 14, backgroundColor: colors.successSurface },
  errorNotice: { backgroundColor: colors.dangerSurface },
  errorText: { color: colors.danger },
});
