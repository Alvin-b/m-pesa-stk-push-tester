const PLACEHOLDER_RADIUS_SECRET = "mikrotik_radius_secret";

export const generateRadiusSecret = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
};

export const isPlaceholderRadiusSecret = (secret?: string | null) => {
  const normalized = String(secret ?? "").trim().toLowerCase();
  return !normalized || normalized === PLACEHOLDER_RADIUS_SECRET;
};
