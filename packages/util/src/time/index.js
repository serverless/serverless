/**
 * Formats a date into a human readable string including time ago
 * @param {Date|string} date - The date to format
 * @returns {string} Formatted date string with time ago
 */
export const formatTimeAgo = ({ date }) => {
  const now = new Date()
  const parsedDate = new Date(date)
  const seconds = Math.floor((now - parsedDate) / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  // Generate time ago string
  let timeAgo
  if (days > 0) {
    timeAgo = `${days} day${days === 1 ? '' : 's'} ago`
  } else if (hours > 0) {
    timeAgo = `${hours} hour${hours === 1 ? '' : 's'} ago`
  } else if (minutes > 0) {
    timeAgo = `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  } else {
    timeAgo = 'just now'
  }

  // Format the full date
  const fullDate = parsedDate.toLocaleString()

  return `${fullDate} (${timeAgo})`
}
