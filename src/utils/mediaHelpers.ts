export function isInlineDataUrl(value?: string): boolean {
  return typeof value === "string" && value.startsWith("data:");
}
