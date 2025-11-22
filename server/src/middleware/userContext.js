// User Context Middleware for One App Club
// Fetches user data and personalization settings once per request
// Makes user data available via req.user for all authenticated endpoints

const usersService = require('../services/users')

/**
 * Middleware to fetch and attach user data to the request object
 * Only fetches data for authenticated users (when req.session.userId exists)
 * Attaches user data to req.user for use in route handlers
 */
async function userContextMiddleware(req, res, next) {
  try {
    // Only fetch user data if user is authenticated
    if (req.session && req.session.userId) {
      // Check if user data is already cached in the session to avoid redundant DB calls
      if (req.session.userCache && req.session.userCache.id === req.session.userId) {
        // Use cached user data (refresh every 5 minutes)
        const cacheAge = Date.now() - (req.session.userCache.timestamp || 0)
        const fiveMinutes = 5 * 60 * 1000
        
        if (cacheAge < fiveMinutes) {
          req.user = req.session.userCache.data
          return next()
        }
      }
      
      // Fetch fresh user data from database
      const user = await usersService.getUserById(req.session.userId)
      
      if (user) {
        // Attach user data to request object
        req.user = {
          id: user.id,
          email: user.email,
          display_name: user.display_name,
          role: user.role || 'user',
          timezone: user.timezone || 'UTC',
          location: user.location || null,
          personal_note: user.personal_note || null,
          // Add any other user fields that might be needed
        }
        
        // Cache user data in session for performance
        req.session.userCache = {
          id: user.id,
          data: req.user,
          timestamp: Date.now()
        }
        
        console.log(`👤 User context loaded: ${user.email} (${user.timezone})`)
      } else {
        // User not found - session might be stale
        req.session.destroy((err) => {
          if (err) console.error('Session destruction error:', err)
        })
        return res.status(401).json({ error: 'user_not_found_session_invalid' })
      }
    }
    // If no session, req.user will be undefined (handled by route-level auth checks)
    
    next()
  } catch (error) {
    console.error('User context middleware error:', error)
    // Don't fail the request, but log the error
    // Individual routes can still check for req.user existence
    next()
  }
}

/**
 * Helper middleware that requires authentication and user context
 * Use this for routes that absolutely need user data
 */
function requireUserContext(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'authentication_required' })
  }
  next()
}

/**
 * Middleware to invalidate user cache when profile is updated
 * Call this after any user profile updates
 */
function invalidateUserCache(req, res, next) {
  if (req.session && req.session.userCache) {
    delete req.session.userCache
    console.log('🔄 User cache invalidated')
  }
  next()
}

module.exports = {
  userContextMiddleware,
  requireUserContext,
  invalidateUserCache
}
