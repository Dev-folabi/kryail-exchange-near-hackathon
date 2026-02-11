/**
 * Generates a unique reference string
 * Format: PREFIX-TIMESTAMP-RANDOM
 * Example: WDR-K1L2M3N4-X5Y6
 */
export function generateReference(prefix: string): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}
