export type ThemeColorTokens = {
  background: string;
  foreground: string;
  surface: string;
  surfaceForeground: string;
  primary: string;
  primaryForeground: string;
  accent: string;
  accentForeground: string;
  muted: string;
  border: string;
};

export type ThemeTypographyTokens = {
  display: string;
  body: string;
  mono?: string;
};

export type ThemeContract = {
  id: string;
  mode: "light" | "dark" | "adaptive";
  colors: ThemeColorTokens;
  typography: ThemeTypographyTokens;
  radius: {
    sm: string;
    md: string;
    lg: string;
    pill: string;
  };
  spacing?: Record<string, string>;
  motion?: {
    durationFast?: string;
    durationBase?: string;
    easing?: string;
  };
  extensions?: Record<string, unknown>;
};

export function defineTheme<const T extends ThemeContract>(theme: T): T {
  return theme;
}

export function themeCssVariables(theme: ThemeContract): Record<string, string> {
  return {
    "--amf-background": theme.colors.background,
    "--amf-foreground": theme.colors.foreground,
    "--amf-surface": theme.colors.surface,
    "--amf-surface-foreground": theme.colors.surfaceForeground,
    "--amf-primary": theme.colors.primary,
    "--amf-primary-foreground": theme.colors.primaryForeground,
    "--amf-accent": theme.colors.accent,
    "--amf-accent-foreground": theme.colors.accentForeground,
    "--amf-muted": theme.colors.muted,
    "--amf-border": theme.colors.border,
    "--amf-font-display": theme.typography.display,
    "--amf-font-body": theme.typography.body,
    "--amf-radius-sm": theme.radius.sm,
    "--amf-radius-md": theme.radius.md,
    "--amf-radius-lg": theme.radius.lg,
    "--amf-radius-pill": theme.radius.pill
  };
}
