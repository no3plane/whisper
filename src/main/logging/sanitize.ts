const sensitiveKey = /^(api[-_]?key|authorization|password|secret|access[-_]?token|refresh[-_]?token)$/i;
const secretInText = /((?:api[-_]?key|authorization|password|secret|access[-_]?token|refresh[-_]?token)["']?\s*[:=]\s*["']?)([^\s,"'}]+)/gi;

export function sanitizeForLog(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') {
    return value
      .replace(/Bearer\s+[^\s,"'}]+/gi, 'Bearer ***')
      .replace(secretInText, '$1***');
  }
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (value instanceof Error) {
    return { name: value.name, message: sanitizeForLog(value.message, seen), stack: sanitizeForLog(value.stack, seen) };
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeForLog(item, seen));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    sensitiveKey.test(key) ? '***' : sanitizeForLog(item, seen),
  ]));
}
