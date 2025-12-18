/**
 * Format a date object or string to a human-readable format
 * @param {Date|string} date - Date to format
 * @returns {string} - Formatted date string
 */
export function formatDate(date) {
  const dateObj = date instanceof Date ? date : new Date(date)
  return dateObj.toISOString().replace('T', ' ').substring(0, 19)
}

/**
 * Parse a timestamp string or number into a Date object
 * @param {string|number} timestamp - Timestamp to parse
 * @returns {Date} - Date object
 */
export function parseTimestamp(timestamp) {
  if (typeof timestamp === 'number') {
    return new Date(timestamp)
  }
  return new Date(timestamp)
}
