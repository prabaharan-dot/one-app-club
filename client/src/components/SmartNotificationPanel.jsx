import React, { useState, useEffect } from 'react'

const SmartNotificationPanel = ({ isOpen, onClose }) => {
  const [notifications, setNotifications] = useState([])
  const [preferences, setPreferences] = useState(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('notifications')
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (isOpen) {
      fetchNotifications()
      fetchPreferences()
    }
  }, [isOpen])

  const fetchNotifications = async () => {
    setLoading(true)
    try {
      const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
      const response = await fetch(`${base}/api/phase2/notifications?limit=50`, {
        credentials: 'include'
      })
      
      if (response.ok) {
        const data = await response.json()
        setNotifications(data.notifications || [])
        setUnreadCount(data.notifications?.filter(n => !n.read).length || 0)
      }
    } catch (error) {
      console.error('Error fetching notifications:', error)
    }
    setLoading(false)
  }

  const fetchPreferences = async () => {
    try {
      const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
      const response = await fetch(`${base}/api/phase2/notifications/preferences`, {
        credentials: 'include'
      })
      
      if (response.ok) {
        const data = await response.json()
        setPreferences(data.preferences)
      }
    } catch (error) {
      console.error('Error fetching preferences:', error)
    }
  }

  const markAsRead = async (notificationId) => {
    try {
      const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
      const response = await fetch(`${base}/api/phase2/notifications/${notificationId}/read`, {
        method: 'PUT',
        credentials: 'include'
      })
      
      if (response.ok) {
        setNotifications(prev => 
          prev.map(n => n.id === notificationId ? { ...n, read: true, read_at: new Date() } : n)
        )
        setUnreadCount(prev => Math.max(0, prev - 1))
      }
    } catch (error) {
      console.error('Error marking notification as read:', error)
    }
  }

  const dismissNotification = async (notificationId) => {
    try {
      const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
      const response = await fetch(`${base}/api/phase2/notifications/${notificationId}/dismiss`, {
        method: 'PUT',
        credentials: 'include'
      })
      
      if (response.ok) {
        setNotifications(prev => prev.filter(n => n.id !== notificationId))
      }
    } catch (error) {
      console.error('Error dismissing notification:', error)
    }
  }

  const markAllAsRead = async () => {
    try {
      const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
      const response = await fetch(`${base}/api/phase2/notifications/read-all`, {
        method: 'PUT',
        credentials: 'include'
      })
      
      if (response.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, read: true, read_at: new Date() })))
        setUnreadCount(0)
      }
    } catch (error) {
      console.error('Error marking all as read:', error)
    }
  }

  const updatePreferences = async (newPreferences) => {
    try {
      const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
      const response = await fetch(`${base}/api/phase2/notifications/preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newPreferences)
      })
      
      if (response.ok) {
        const data = await response.json()
        setPreferences(data.preferences)
      }
    } catch (error) {
      console.error('Error updating preferences:', error)
    }
  }

  const getPriorityIcon = (priority) => {
    switch (priority) {
      case 5: return '🔥'
      case 4: return '⚡'
      case 3: return '📧'
      case 2: return '📬'
      case 1: return '📭'
      default: return '📧'
    }
  }

  const getTypeIcon = (type) => {
    switch (type) {
      case 'high_priority': return '🚨'
      case 'keyword_alert': return '🔔'
      case 'follow_up': return '⏰'
      case 'scheduled_reminder': return '📅'
      default: return '📧'
    }
  }

  const formatTime = (timestamp) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  if (!isOpen) return null

  return (
    <div className="smart-notification-panel-overlay">
      <div className="smart-notification-panel">
        <div className="smart-notification-panel-header">
          <div className="panel-title">
            <span>🔔 Smart Notifications</span>
            {unreadCount > 0 && (
              <span className="unread-badge">{unreadCount}</span>
            )}
          </div>
          <button className="panel-close-button" onClick={onClose}>✕</button>
        </div>

        <div className="notification-tabs">
          <button
            className={`tab-button ${activeTab === 'notifications' ? 'active' : ''}`}
            onClick={() => setActiveTab('notifications')}
          >
            Notifications
          </button>
          <button
            className={`tab-button ${activeTab === 'preferences' ? 'active' : ''}`}
            onClick={() => setActiveTab('preferences')}
          >
            Settings
          </button>
        </div>

        <div className="smart-notification-panel-body">
          {activeTab === 'notifications' && (
            <div className="notifications-tab">
              <div className="notifications-actions">
                <button
                  className="action-button"
                  onClick={markAllAsRead}
                  disabled={unreadCount === 0}
                >
                  Mark All Read
                </button>
                <button
                  className="action-button"
                  onClick={fetchNotifications}
                  disabled={loading}
                >
                  {loading ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>

              <div className="notifications-list">
                {notifications.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">🔕</div>
                    <p>No notifications yet</p>
                  </div>
                ) : (
                  notifications.map(notification => (
                    <div
                      key={notification.id}
                      className={`notification-item ${!notification.read ? 'unread' : ''}`}
                    >
                      <div className="notification-header">
                        <div className="notification-icons">
                          <span className="type-icon">{getTypeIcon(notification.type)}</span>
                          <span className="priority-icon">{getPriorityIcon(notification.priority)}</span>
                        </div>
                        <div className="notification-time">
                          {formatTime(notification.sent_at)}
                        </div>
                      </div>

                      <div className="notification-content">
                        <h4 className="notification-title">{notification.title}</h4>
                        {notification.content && (
                          <p className="notification-text">{notification.content}</p>
                        )}
                        {notification.message_subject && (
                          <div className="notification-email-info">
                            Subject: {notification.message_subject}
                            {notification.message_sender && (
                              <span> • From: {notification.message_sender}</span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="notification-actions">
                        {!notification.read && (
                          <button
                            className="notification-action-btn mark-read"
                            onClick={() => markAsRead(notification.id)}
                          >
                            Mark Read
                          </button>
                        )}
                        <button
                          className="notification-action-btn dismiss"
                          onClick={() => dismissNotification(notification.id)}
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'preferences' && preferences && (
            <div className="preferences-tab">
              <div className="preference-group">
                <h4>Notification Types</h4>
                <label className="preference-item">
                  <input
                    type="checkbox"
                    checked={preferences.email_notifications}
                    onChange={(e) => updatePreferences({
                      ...preferences,
                      emailNotifications: e.target.checked
                    })}
                  />
                  <span>Email Notifications</span>
                </label>
                <label className="preference-item">
                  <input
                    type="checkbox"
                    checked={preferences.push_notifications}
                    onChange={(e) => updatePreferences({
                      ...preferences,
                      pushNotifications: e.target.checked
                    })}
                  />
                  <span>Push Notifications</span>
                </label>
              </div>

              <div className="preference-group">
                <h4>Priority Threshold</h4>
                <select
                  className="preference-select"
                  value={preferences.priority_threshold}
                  onChange={(e) => updatePreferences({
                    ...preferences,
                    priorityThreshold: parseInt(e.target.value)
                  })}
                >
                  <option value={1}>All notifications (1+)</option>
                  <option value={2}>Low priority and above (2+)</option>
                  <option value={3}>Normal priority and above (3+)</option>
                  <option value={4}>High priority and above (4+)</option>
                  <option value={5}>Critical only (5)</option>
                </select>
              </div>

              <div className="preference-group">
                <h4>Quiet Hours</h4>
                <div className="quiet-hours-inputs">
                  <label>
                    Start:
                    <input
                      type="time"
                      className="time-input"
                      value={preferences.quiet_hours_start}
                      onChange={(e) => updatePreferences({
                        ...preferences,
                        quietHoursStart: e.target.value
                      })}
                    />
                  </label>
                  <label>
                    End:
                    <input
                      type="time"
                      className="time-input"
                      value={preferences.quiet_hours_end}
                      onChange={(e) => updatePreferences({
                        ...preferences,
                        quietHoursEnd: e.target.value
                      })}
                    />
                  </label>
                </div>
                <label className="preference-item">
                  <input
                    type="checkbox"
                    checked={preferences.weekend_notifications}
                    onChange={(e) => updatePreferences({
                      ...preferences,
                      weekendNotifications: e.target.checked
                    })}
                  />
                  <span>Weekend Notifications</span>
                </label>
              </div>

              <div className="preference-group">
                <h4>Keyword Alerts</h4>
                <input
                  type="text"
                  className="keyword-input"
                  placeholder="Enter keywords separated by commas"
                  value={preferences.keyword_alerts?.join(', ') || ''}
                  onChange={(e) => updatePreferences({
                    ...preferences,
                    keywordAlerts: e.target.value.split(',').map(k => k.trim()).filter(Boolean)
                  })}
                />
                <small>Get high-priority alerts when emails contain these keywords</small>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SmartNotificationPanel
