export const DEVICE_TYPES = [
  { value: "power", label: "Power devices", color: "#2563eb" },
  { value: "lighting_fixture", label: "Lighting fixtures", color: "#16a34a" },
  { value: "lighting_control", label: "Lighting controls", color: "#ca8a04" },
  { value: "low_voltage", label: "Low-voltage devices", color: "#dc2626" },
] as const;

export function getDeviceMeta(type: string) {
  return DEVICE_TYPES.find((d) => d.value === type) || DEVICE_TYPES[0];
}

export function createSafeId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}