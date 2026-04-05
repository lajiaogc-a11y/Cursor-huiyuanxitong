import { getCurrencyBadgeColor, normalizeCurrencyCode } from "@/config/currencies";

export function getLevelBadgeColor(level: string) {
  switch (level) {
    case "A":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "B":
      return "bg-sky-100 text-sky-700 border-sky-200";
    case "C":
      return "bg-violet-100 text-violet-700 border-violet-200";
    case "D":
      return "bg-gray-100 text-gray-700 border-gray-200";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

export function getCurrencyBadgeColorLocal(currency: string) {
  const normalizedCode = normalizeCurrencyCode(currency);
  if (normalizedCode) {
    return getCurrencyBadgeColor(normalizedCode);
  }
  return "bg-gray-100 text-gray-700 border-gray-200";
}
