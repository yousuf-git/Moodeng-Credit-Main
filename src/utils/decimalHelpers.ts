/**
 * Decimal Helper Functions
 *
 * Helper utilities for working with numeric values.
 * Since Supabase uses standard number types, these are simplified
 * from the original Prisma Decimal helpers.
 */

/**
 * Helper function to safely convert a value to number
 * Handles various input types for backward compatibility
 */
export const toNumber = (value: number | string | null | undefined): number => {
   if (value === null || value === undefined) return 0;
   if (typeof value === 'number') return value;
   const parsed = Number(value);
   return isNaN(parsed) ? 0 : parsed;
};

/**
 * Formats a value (string, number, etc.) to a string with max 2 decimal places
 * Removes trailing zeros: 1 = "1", 1.10 = "1.1", 1.11 = "1.11"
 *
 * @param value - The value to format (string, number, etc.)
 * @returns Formatted string with max 2 decimal places and no trailing zeros
 */
export const formatNumber = (value: number | string | null | undefined): string => {
   if (value === null || value === undefined) return '0';

   const numValue = typeof value === 'number' ? value : Number(value);

   if (isNaN(numValue)) return '0';

   return numValue.toFixed(2).replace(/\.?0+$/, '');
};

/**
 * Formats a value as currency with exactly 2 decimal places.
 * Always shows cents: 5 → "5.00", 1.1 → "1.10", 1.11 → "1.11"
 */
export const formatCurrency = (value: number | string | null | undefined): string => {
   if (value === null || value === undefined) return '0.00';

   const numValue = typeof value === 'number' ? value : Number(value);

   if (isNaN(numValue)) return '0.00';

   return numValue.toFixed(2);
};
