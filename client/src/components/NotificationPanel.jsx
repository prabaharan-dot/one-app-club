import React, { useState, useEffect, useRef } from 'react'
import { FaBell, FaExclamationTriangle, FaCheckCircle, FaTimes } from 'react-icons/fa'
import { monitorOAuthPopup, openOAuthPopup } from '../utils/oauth'

export default function NotificationPanel() {
  const [notifications, setNotifications] = useState([])
  const [isOpen, setIsOpen] = useState(false)
  const [permissionStatus, setPermissionStatus] = useState(null)
  const [lastCheck, setLastCheck] = useState(null)
  const [isChecking, setIsChecking] = useState(false)
  const panelRef = useRef()

  // Check permissions every 5 minutes and after window focus
  useEffect(() => {
    checkPermissions() // Initial check
    
    const interval = setInterval(() => {
      checkPermissions()
    }, 5 * 60 * 1000) // 5 minutes

    // Check permissions when window regains focus (after OAuth popup)
    const handleFocus = () => {
      setTimeout(checkPermissions, 1000) // Small delay to ensure OAuth is complete
    }
    
    window.addEventListener('focus', handleFocus)
    
    // Listen for custom permission update events
    const handlePermissionUpdate = () => {
      checkPermissions()
    }
    
    window.addEventListener('permissionsUpdated', handlePermissionUpdate)

    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('permissionsUpdated', handlePermissionUpdate)
    }
  }, [])

  // Close panel when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  async function checkPermissions() {
    setIsChecking(true)
    try {
      const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
      console.log('🔔 Checking permissions...') // Debug log
      
      const res = await fetch(`${base}/api/auth/permissions`, {credentials:'include'})
      
      if (!res.ok) {
        if (res.status === 401) {
          // User not logged in, clear notifications
          console.log('🔔 User not logged in, clearing notifications')
          setNotifications([])
          setPermissionStatus(null)
          return
        }
        throw new Error(`Permission check failed: ${res.statusText}`)
      }
      
      const data = await res.json()
      console.log('🔔 Permission check result:', data) // Debug log
      
      setPermissionStatus(data)
      setLastCheck(new Date())
      
      // Create notifications for missing permissions
      if (!data.hasAllPermissions && data.missingPermissions && data.missingPermissions.length > 0) {
        console.log('🔔 Missing permissions detected:', data.missingPermissions)
        
        const missingNotifications = data.missingPermissions.map(permission => ({
          id: `missing-${permission}`,
          type: 'warning',
          title: 'Missing Permission',
          message: `${getPermissionDisplayName(permission)} access is required`,
          permission,
          action: 'grant_permission',
          timestamp: new Date(),
          dismissible: false
        }))
        
        // Only update notifications if they've changed
        const currentIds = notifications.map(n => n.id).sort()
        const newIds = missingNotifications.map(n => n.id).sort()
        
        if (JSON.stringify(currentIds) !== JSON.stringify(newIds)) {
          console.log('🔔 Updating notifications:', missingNotifications)
          setNotifications(missingNotifications)
        } else {
          console.log('🔔 Notifications unchanged')
        }
      } else {
        // All permissions granted, clear notifications
        console.log('🔔 All permissions granted, clearing notifications')
        setNotifications([])
      }
      
    } catch (error) {
      console.error('🔔 Permission check failed:', error)
      // Set a connection error notification
      setNotifications([{
        id: 'connection-error',
        type: 'error',
        title: 'Connection Error',
        message: 'Failed to check permissions',
        permission: 'connection',
        action: 'retry',
        timestamp: new Date(),
        dismissible: true
      }])
    } finally {
      setIsChecking(false)
    }
  }

  function getPermissionDisplayName(permission) {
    const names = {
      'gmail_read': 'Gmail Reading',
      'gmail_send': 'Email Sending', 
      'gmail_modify': 'Email Management',
      'calendar': 'Calendar Access',
      'tasks': 'Task Management'
    }
    return names[permission] || permission.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  function getPermissionDescription(permission) {
    const descriptions = {
      'gmail_read': 'Read your emails and labels to show unread messages and summaries',
      'gmail_send': 'Send replies and forwarded emails on your behalf',
      'gmail_modify': 'Mark emails as read, delete emails, and manage labels',
      'calendar': 'Create calendar events and meetings from email requests',
      'tasks': 'Create tasks from emails and manage your to-do list'
    }
    return descriptions[permission] || 'Required for full app functionality'
  }

  function handleGrantPermission() {
    const popup = openOAuthPopup('/api/auth/reauth')
    setIsOpen(false)
    
    // Monitor the popup window and check permissions when it closes
    monitorOAuthPopup(popup, () => {
      console.log('🔔 OAuth popup completed, checking permissions...')
      setTimeout(() => {
        checkPermissions()
      }, 1000) // Small delay to ensure OAuth callback is processed
    })
  }

  function handleDismissNotification(notificationId) {
    setNotifications(prev => prev.filter(n => n.id !== notificationId))
  }

  const hasWarnings = notifications.some(n => n.type === 'warning')
  const warningCount = notifications.filter(n => n.type === 'warning').length

  return (
    <div className="notification-panel" ref={panelRef} style={{position: 'relative'}}>
      {/* Notification Bell Icon */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="notification-bell"
        style={{
          position: 'relative',
          background: 'transparent',
          border: 'none',
          padding: '8px',
          borderRadius: '50%',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          color: hasWarnings ? '#f59e0b' : '#6b7280'
        }}
        onMouseEnter={e => {
          e.target.style.background = 'rgba(0,0,0,0.05)'
        }}
        onMouseLeave={e => {
          e.target.style.background = 'transparent'
        }}
        title={isChecking ? 'Checking permissions...' : hasWarnings ? `${warningCount} permission issue${warningCount !== 1 ? 's' : ''}` : 'All permissions granted'}
      >
        <FaBell size={18} style={{
          animation: isChecking ? 'spin 1s linear infinite' : 'none'
        }} />
        {hasWarnings && (
          <span style={{
            position: 'absolute',
            top: '4px',
            right: '4px',
            background: '#ef4444',
            color: 'white',
            borderRadius: '50%',
            width: '12px',
            height: '12px',
            fontSize: '8px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: '12px'
          }}>
            {warningCount > 9 ? '9+' : warningCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: '0',
          marginTop: '8px',
          width: '320px',
          background: '#ffffff',
          border: '1px solid rgba(0,0,0,0.1)',
          borderRadius: '12px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
          zIndex: 1000,
          overflow: 'hidden'
        }}>
          {/* Header */}
          <div style={{
            padding: '16px',
            borderBottom: '1px solid rgba(0,0,0,0.05)',
            background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <h3 style={{margin: 0, fontSize: '14px', fontWeight: '600', color: '#374151'}}>
                Notifications
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '4px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  color: '#6b7280'
                }}
              >
                <FaTimes size={12} />
              </button>
            </div>
            {lastCheck && (
              <div style={{fontSize: '11px', color: '#6b7280', marginTop: '4px'}}>
                Last checked: {lastCheck.toLocaleTimeString()}
              </div>
            )}
          </div>

          {/* Notifications List */}
          <div style={{maxHeight: '300px', overflowY: 'auto'}}>
            {notifications.length === 0 ? (
              <div style={{
                padding: '24px 16px',
                textAlign: 'center',
                color: '#6b7280'
              }}>
                <FaCheckCircle size={24} style={{color: '#10b981', marginBottom: '8px'}} />
                <div style={{fontSize: '14px', fontWeight: '500'}}>All good!</div>
                <div style={{fontSize: '12px', marginTop: '4px'}}>
                  All required permissions are granted
                </div>
              </div>
            ) : (
              notifications.map(notification => (
                <div
                  key={notification.id}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid rgba(0,0,0,0.05)',
                    cursor: 'pointer',
                    transition: 'background 0.2s ease'
                  }}
                  onMouseEnter={e => {
                    e.target.style.background = 'rgba(0,0,0,0.02)'
                  }}
                  onMouseLeave={e => {
                    e.target.style.background = 'transparent'
                  }}
                  onClick={handleGrantPermission}
                >
                  <div style={{display: 'flex', alignItems: 'flex-start', gap: '12px'}}>
                    <div style={{marginTop: '2px'}}>
                      {notification.type === 'warning' && (
                        <FaExclamationTriangle size={16} style={{color: '#f59e0b'}} />
                      )}
                    </div>
                    <div style={{flex: 1}}>
                      <div style={{
                        fontSize: '13px',
                        fontWeight: '500',
                        color: '#374151',
                        marginBottom: '4px'
                      }}>
                        {notification.title}
                      </div>
                      <div style={{
                        fontSize: '12px',
                        color: '#6b7280',
                        lineHeight: '1.4',
                        marginBottom: '6px'
                      }}>
                        {getPermissionDescription(notification.permission)}
                      </div>
                      <div style={{
                        fontSize: '11px',
                        color: '#3b82f6',
                        fontWeight: '500'
                      }}>
                        Click to grant access →
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer Actions */}
          <div style={{
            padding: '12px 16px',
            background: '#f9fafb',
            borderTop: '1px solid rgba(0,0,0,0.05)'
          }}>
            {notifications.length > 0 ? (
              <button
                onClick={handleGrantPermission}
                style={{
                  width: '100%',
                  padding: '8px 16px',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'background 0.2s ease',
                  marginBottom: '8px'
                }}
                onMouseEnter={e => {
                  e.target.style.background = '#2563eb'
                }}
                onMouseLeave={e => {
                  e.target.style.background = '#3b82f6'
                }}
              >
                Grant All Missing Permissions
              </button>
            ) : null}
            
            <button
              onClick={() => {
                checkPermissions()
                setTimeout(() => setIsOpen(false), 500) // Close after a delay
              }}
              disabled={isChecking}
              style={{
                width: '100%',
                padding: '6px 12px',
                background: 'transparent',
                color: isChecking ? '#9ca3af' : '#6b7280',
                border: '1px solid rgba(0,0,0,0.1)',
                borderRadius: '6px',
                fontSize: '11px',
                cursor: isChecking ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease',
                opacity: isChecking ? 0.7 : 1
              }}
              onMouseEnter={e => {
                if (!isChecking) {
                  e.target.style.background = 'rgba(0,0,0,0.02)'
                  e.target.style.color = '#374151'
                }
              }}
              onMouseLeave={e => {
                if (!isChecking) {
                  e.target.style.background = 'transparent'
                  e.target.style.color = '#6b7280'
                }
              }}
            >
              {isChecking ? '🔄 Checking...' : '🔄 Check Now'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
