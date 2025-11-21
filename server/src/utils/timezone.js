// Timezone utility functions for One App Club
// Provides consistent timezone handling across the application

/**
 * Creates a Date object for a specific time in a user's timezone
 * @param {string} userTimezone - User's timezone (e.g., 'America/New_York')
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @param {string} timeStr - Time string in HH:MM:SS format
 * @returns {Date} Date object adjusted for the user's timezone
 */
function createDateInUserTimezone(userTimezone, dateStr, timeStr) {
  const timezone = userTimezone || 'UTC'
  
  try {
    // Create the date/time string
    const dateTimeStr = `${dateStr}T${timeStr}`
    
    // Create a Date object
    const localDate = new Date(dateTimeStr)
    
    // Get the current time in both UTC and user's timezone to calculate offset
    const now = new Date()
    const utcTime = now.getTime()
    const userTime = new Date(now.toLocaleString('en-US', { timeZone: timezone })).getTime()
    const offsetMs = utcTime - userTime
    
    // Apply the offset to convert to proper UTC for storage
    const adjustedDate = new Date(localDate.getTime() + offsetMs)
    
    return adjustedDate
  } catch (error) {
    console.error('Error creating date in user timezone:', error)
    return new Date(`${dateStr}T${timeStr}Z`) // Fallback to UTC
  }
}

/**
 * Gets tomorrow's date string in user's timezone
 * @param {string} userTimezone - User's timezone
 * @returns {string} Date string in YYYY-MM-DD format
 */
function getTomorrowInUserTimezone(userTimezone) {
  const timezone = userTimezone || 'UTC'
  
  try {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    return tomorrow.toLocaleDateString('sv-SE', { timeZone: timezone }) // YYYY-MM-DD format
  } catch (error) {
    console.error('Error getting tomorrow in user timezone:', error)
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    return tomorrow.toISOString().split('T')[0] // Fallback to system timezone
  }
}

/**
 * Creates default meeting times (2 PM - 3 PM tomorrow) in user's timezone
 * DEFAULT BEHAVIOR: All meetings without specific times are scheduled for 2:00 PM - 3:00 PM tomorrow
 * @param {string} userTimezone - User's timezone (e.g., 'Europe/London', 'America/New_York')
 * @returns {object} Object with startTime and endTime as ISO strings
 */
function createDefaultMeetingTimes(userTimezone) {
  const timezone = userTimezone || 'UTC'
  const tomorrowStr = getTomorrowInUserTimezone(timezone)
  
  // Default meeting time: 2:00 PM - 3:00 PM tomorrow in user's timezone
  const startTime = createDateInUserTimezone(timezone, tomorrowStr, '14:00:00').toISOString()
  const endTime = createDateInUserTimezone(timezone, tomorrowStr, '15:00:00').toISOString()
  
  return { startTime, endTime }
}

/**
 * Parses user input time and converts to ISO string in their timezone
 * Examples: "9 AM", "2:30 PM", "14:00"
 * @param {string} userInput - Time input from user
 * @param {string} userTimezone - User's timezone
 * @param {string} baseDate - Base date in YYYY-MM-DD format (defaults to tomorrow)
 * @returns {string|null} ISO string or null if parsing failed
 */
function parseUserTimeInput(userInput, userTimezone, baseDate = null) {
  if (!userInput) return null
  
  const timezone = userTimezone || 'UTC'
  
  try {
    // Clean up input
    const cleanInput = userInput.trim().toLowerCase()
    console.log(`🔍 Parsing user time input: "${cleanInput}"`)
    
    // Determine date - check for "tomorrow", "today", or use provided baseDate
    let targetDateStr = baseDate
    if (!targetDateStr) {
      if (cleanInput.includes('tomorrow')) {
        targetDateStr = getTomorrowInUserTimezone(timezone)
        console.log(`📅 Detected "tomorrow", using date: ${targetDateStr}`)
      } else if (cleanInput.includes('today')) {
        const today = new Date()
        targetDateStr = today.toLocaleDateString('sv-SE', { timeZone: timezone })
        console.log(`📅 Detected "today", using date: ${targetDateStr}`)
      } else {
        // Default to tomorrow if no date specified
        targetDateStr = getTomorrowInUserTimezone(timezone)
        console.log(`📅 No date specified, defaulting to tomorrow: ${targetDateStr}`)
      }
    }
    
    // Parse common time formats
    let hour = 0, minute = 0, timeFound = false
    
    // Handle AM/PM format (e.g., "8am", "8 AM", "2:30 PM", "tomorrow 8am")
    const ampmMatch = cleanInput.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i)
    if (ampmMatch) {
      hour = parseInt(ampmMatch[1])
      minute = parseInt(ampmMatch[2] || '0')
      
      if (ampmMatch[3].toLowerCase() === 'pm' && hour !== 12) {
        hour += 12
      } else if (ampmMatch[3].toLowerCase() === 'am' && hour === 12) {
        hour = 0
      }
      timeFound = true
      console.log(`⏰ Parsed AM/PM format: ${hour}:${minute.toString().padStart(2, '0')}`)
    } else {
      // Handle 24-hour format (e.g., "14:00", "09:30")
      const timeMatch = cleanInput.match(/(\d{1,2}):(\d{2})/)
      if (timeMatch) {
        hour = parseInt(timeMatch[1])
        minute = parseInt(timeMatch[2])
        timeFound = true
        console.log(`⏰ Parsed 24-hour format: ${hour}:${minute.toString().padStart(2, '0')}`)
      } else {
        // Try to match just hour without colon (e.g., "8" in "tomorrow 8am")
        const hourOnlyMatch = cleanInput.match(/(\d{1,2})(?=\s*(am|pm))/i)
        if (hourOnlyMatch) {
          hour = parseInt(hourOnlyMatch[1])
          minute = 0
          // AM/PM already handled above
          timeFound = true
          console.log(`⏰ Parsed hour-only format: ${hour}:00`)
        }
      }
    }
    
    if (!timeFound) {
      console.log(`❌ Could not parse time from: "${cleanInput}"`)
      return null
    }
    
    // Validate time
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      console.log(`❌ Invalid time values: ${hour}:${minute}`)
      return null
    }
    
    // Create time string and convert to user timezone
    const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`
    const date = createDateInUserTimezone(timezone, targetDateStr, timeStr)
    const result = date.toISOString()
    
    console.log(`✅ Successfully parsed "${cleanInput}" to: ${result} (${timezone})`)
    return result
  } catch (error) {
    console.error('❌ Error parsing user time input:', error)
    return null
  }
}

/**
 * Formats a time for display in user's timezone
 * @param {string} isoString - ISO date string
 * @param {string} userTimezone - User's timezone
 * @returns {string} Formatted time string
 */
function formatTimeForUser(isoString, userTimezone) {
  const timezone = userTimezone || 'UTC'
  
  try {
    const date = new Date(isoString)
    return date.toLocaleString('en-US', {
      timeZone: timezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    })
  } catch (error) {
    console.error('Error formatting time for user:', error)
    return new Date(isoString).toISOString()
  }
}

module.exports = {
  createDateInUserTimezone,
  getTomorrowInUserTimezone,
  createDefaultMeetingTimes,
  parseUserTimeInput,
  formatTimeForUser
}
