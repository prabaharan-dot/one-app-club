// Helper function to monitor OAuth popup windows and automatically close them
export function monitorOAuthPopup(popup, onComplete) {
  if (!popup) return
  
  const checkClosed = setInterval(() => {
    if (popup.closed) {
      console.log('🔔 OAuth popup closed')
      clearInterval(checkClosed)
      if (onComplete) onComplete()
    }
  }, 1000) // Check every second
  
  // Also try to detect URL changes in the popup (for successful OAuth)
  try {
    const checkSuccess = setInterval(() => {
      try {
        if (popup.location && popup.location.href) {
          const url = popup.location.href
          if (url.includes('reauth=success') || url.includes('onboard=success') || url.includes('signup=success')) {
            console.log('🔔 OAuth success detected, closing popup...')
            popup.close()
            clearInterval(checkSuccess)
            clearInterval(checkClosed)
            if (onComplete) onComplete()
          }
        }
      } catch (e) {
        // Cross-origin error - popup is still on Google's domain, which is expected
        // This happens while the popup is on Google's OAuth pages
      }
      
      if (popup.closed) {
        clearInterval(checkSuccess)
      }
    }, 500)
  } catch (e) {
    // Fallback to just monitoring if popup is closed
    console.warn('Could not monitor popup URL changes, falling back to close detection only')
  }
}

// Helper to open OAuth popup with automatic monitoring
export function openOAuthPopup(url, options = {}) {
  const defaultOptions = {
    width: 500,
    height: 600,
    scrollbars: 'yes',
    resizable: 'yes',
    top: Math.round((screen.height - 600) / 2),
    left: Math.round((screen.width - 500) / 2)
  }
  
  const windowOptions = { ...defaultOptions, ...options }
  const optionsString = Object.entries(windowOptions)
    .map(([key, value]) => `${key}=${value}`)
    .join(',')
  
  // Ensure we have the full URL for the server
  const baseUrl = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
  const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`
  
  console.log('🔗 Opening OAuth popup to:', fullUrl)
  return window.open(fullUrl, '_blank', optionsString)
}
