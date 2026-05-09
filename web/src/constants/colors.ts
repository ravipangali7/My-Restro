export const Colors = {
  // ─── Primary (Red) ───────────────────────────────
  primary50:   "#FFF1F1",
  primary100:  "#FFE0E0",
  primary200:  "#FFC5C5",
  primary300:  "#FF9D9D",
  primary400:  "#FF6464",
  primary500:  "#F83232",
  primary600:  "#E51414",
  primary700:  "#C20D0D",
  primary800:  "#A00F0F",
  primary900:  "#841414",

  // ─── Neutral / Surface ───────────────────────────
  white:       "#FFFFFF",
  surface:     "#F9F9F9",
  surfaceAlt:  "#F2F2F2",
  border:      "#E8E8E8",
  borderStrong:"#D1D1D1",

  // ─── Text ────────────────────────────────────────
  textPrimary:  "#1A1A1A",
  textSecondary:"#5A5A5A",
  textMuted:    "#9A9A9A",
  textOnPrimary:"#FFFFFF",

  // ─── Status / Semantic ───────────────────────────
  success:     "#16A34A",
  successBg:   "#F0FDF4",
  warning:     "#D97706",
  warningBg:   "#FFFBEB",
  error:       "#DC2626",
  errorBg:     "#FEF2F2",
  info:        "#2563EB",
  infoBg:      "#EFF6FF",

  // ─── Order Status Colors ─────────────────────────
  statusPending:   "#D97706",
  statusAccepted:  "#2563EB",
  statusRunning:   "#7C3AED",
  statusReady:     "#16A34A",
  statusRejected:  "#DC2626",

  // ─── Payment Status ──────────────────────────────
  paymentPending:  "#D97706",
  paymentSuccess:  "#16A34A",
  paymentFailed:   "#DC2626",

  // ─── Sidebar / Nav ───────────────────────────────
  sidebarBg:       "#FFFFFF",
  sidebarActive:   "#FFF1F1",
  sidebarActiveText:"#E51414",
  sidebarText:     "#5A5A5A",

  // ─── Chart Palette ───────────────────────────────
  chart1: "#F83232",
  chart2: "#FF9D9D",
  chart3: "#2563EB",
  chart4: "#16A34A",
  chart5: "#D97706",
  chart6: "#7C3AED",

  // ─── Overlay / Shadow ────────────────────────────
  overlay:         "rgba(0,0,0,0.40)",
  shadow:          "rgba(0,0,0,0.08)",
  shadowStrong:    "rgba(248,50,50,0.15)",

  // ─── Inline Form Section ─────────────────────────
  inlineFormBg:    "#FAFAFA",
  inlineFormBorder:"#E0E0E0",
  inlineFormHeader:"#F2F2F2",
} as const;
