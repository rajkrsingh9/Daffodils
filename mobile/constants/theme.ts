import { Platform, TextStyle, ViewStyle } from 'react-native';

/**
 * Claymorphism design system.
 *
 * The look rests on three things, applied consistently:
 *   1. Generous, near-squircle radii — nothing sharp.
 *   2. A warm sand ground so white surfaces read as *raised clay*, not paper.
 *   3. Two-part depth: a soft coloured drop shadow below, plus a light top
 *      edge. React Native has no inset shadow, so the "pressed in" highlight
 *      is faked with a translucent top border — cheap and convincing.
 */

export const colors = {
  // Ground and surfaces
  bg: '#F2EBDD',
  bgDeep: '#EAE1D0',
  surface: '#FFFCF5',
  surfaceAlt: '#F8F2E6',
  surfaceSunken: '#EDE4D3',

  // Brand — daffodil
  primary: '#FFC93C',
  primaryDeep: '#E9A800',
  primarySoft: '#FFF0C2',
  onPrimary: '#3B2E00',

  // Supporting pastels (vibe tags, badges, accents)
  lavender: '#A99BF5',
  lavenderSoft: '#EDE9FE',
  mint: '#6FCF9F',
  mintSoft: '#DFF5E9',
  coral: '#FF8A7A',
  coralSoft: '#FFE4DF',
  sky: '#74C0F0',
  skySoft: '#DDEFFB',

  // Text
  text: '#2E2A22',
  textMuted: '#7C7466',
  textFaint: '#A8A093',
  onDark: '#FFFCF5',

  // Feedback
  danger: '#E5544B',
  dangerSoft: '#FCE3E1',
  success: '#3EA476',
  warning: '#E8A33D',

  // Structure
  border: '#E2D8C4',
  borderSoft: '#EFE7D8',
  shadow: '#C4B49A',
  highlight: 'rgba(255, 255, 255, 0.85)',
  overlay: 'rgba(46, 42, 34, 0.45)',
} as const;

export const radius = {
  sm: 12,
  md: 18,
  lg: 24,
  xl: 32,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Depth presets. `clay` is the default for any raised surface. */
export const shadows: Record<string, ViewStyle> = {
  clay: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55,
    shadowRadius: 16,
    elevation: 7,
  },
  claySm: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 9,
    elevation: 4,
  },
  clayLg: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.6,
    shadowRadius: 26,
    elevation: 12,
  },
  // Pressed state: the object settles into the surface.
  clayPressed: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 1,
  },
  primary: {
    shadowColor: colors.primaryDeep,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 7,
  },
};

/** The light catch along a clay object's top edge. */
export const clayEdge: ViewStyle = {
  borderTopWidth: 1.5,
  borderTopColor: colors.highlight,
  borderLeftWidth: 1,
  borderLeftColor: 'rgba(255,255,255,0.5)',
};

const fontFamily = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default: 'System',
});

export const type: Record<string, TextStyle> = {
  display: { fontFamily, fontSize: 30, fontWeight: '800', color: colors.text, letterSpacing: -0.6 },
  title: { fontFamily, fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  heading: { fontFamily, fontSize: 18, fontWeight: '700', color: colors.text },
  body: { fontFamily, fontSize: 15, fontWeight: '500', color: colors.text, lineHeight: 21 },
  bodyMuted: { fontFamily, fontSize: 15, fontWeight: '500', color: colors.textMuted, lineHeight: 21 },
  label: { fontFamily, fontSize: 13, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.2 },
  caption: { fontFamily, fontSize: 12, fontWeight: '600', color: colors.textFaint },
  button: { fontFamily, fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
};

/** Vibe tag colours — one source of truth for chips, pins and badges. */
export const vibe = {
  CASUAL: { label: 'Casual', color: colors.sky, soft: colors.skySoft, emoji: '🌤' },
  ENERGETIC: { label: 'Energetic', color: colors.coral, soft: colors.coralSoft, emoji: '⚡️' },
  QUIET: { label: 'Quiet', color: colors.lavender, soft: colors.lavenderSoft, emoji: '🌙' },
  ADVENTUROUS: { label: 'Adventurous', color: colors.mint, soft: colors.mintSoft, emoji: '🧭' },
} as const;

export type VibeKey = keyof typeof vibe;

export const trustTier = {
  TIER_1: { label: 'New', color: colors.textFaint, soft: colors.surfaceSunken, icon: '○' },
  TIER_2: { label: 'Verified', color: colors.success, soft: colors.mintSoft, icon: '✓' },
  TIER_3: { label: 'ID Verified', color: colors.lavender, soft: colors.lavenderSoft, icon: '★' },
} as const;

export const postType = {
  MOMENT: { label: 'Moment', emoji: '📸', color: colors.sky, soft: colors.skySoft },
  VIBE_CHECK: { label: 'Vibe check', emoji: '💭', color: colors.lavender, soft: colors.lavenderSoft },
  ACTIVITY_LOG: { label: 'Activity log', emoji: '🗓', color: colors.mint, soft: colors.mintSoft },
  WISHLIST: { label: 'Wishlist', emoji: '✨', color: colors.primary, soft: colors.primarySoft },
} as const;

export const theme = {
  colors,
  radius,
  spacing,
  shadows,
  clayEdge,
  type,
  vibe,
  trustTier,
  postType,
};

export default theme;
