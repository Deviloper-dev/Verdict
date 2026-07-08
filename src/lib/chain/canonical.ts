/**
 * Canonical JSON serializer, RFC 8785-compliant for Verdict's data domain:
 * strings, booleans, null, INTEGER numbers, arrays, plain objects.
 * Floats are rejected on purpose — JCS float formatting is where
 * cross-platform canonicalization bugs live, and no Verdict field needs them.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
    case "boolean":
      return JSON.stringify(value);
    case "number":
      if (!Number.isInteger(value)) {
        throw new Error(`canonicalJson: only finite integers are allowed, got ${value}`);
      }
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
      }
      const obj = value as Record<string, unknown>;
      // Array.prototype.sort() compares UTF-16 code units — exactly RFC 8785's key order.
      const body = Object.keys(obj)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
        .join(",");
      return `{${body}}`;
    }
    default:
      throw new Error(`canonicalJson: unsupported type ${typeof value}`);
  }
}
