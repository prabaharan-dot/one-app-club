import React, { useState, useEffect } from 'react'

const EmailSchedulingModal = ({ isOpen, onClose, messageData, onSchedule }) => {
  const [recipientEmail, setRecipientEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [scheduledFor, setScheduledFor] = useState('')
  const [timezone, setTimezone] = useState('UTC')
  const [isLoading, setIsLoading] = useState(false)
  const [optimalTimes, setOptimalTimes] = useState([])
  const [selectedPreset, setSelectedPreset] = useState('')

  // Schedule presets
  const presets = [
    { id: 'morning', label: 'Tomorrow Morning (9 AM)', hours: 9 },
    { id: 'afternoon', label: 'This Afternoon (2 PM)', hours: 14 },
    { id: 'next_week', label: 'Next Monday (9 AM)', days: 7, hours: 9 },
    { id: 'optimal', label: 'Optimal Time (AI Suggested)', isOptimal: true }
  ]

  useEffect(() => {
    if (isOpen && messageData) {
      // Pre-fill form if replying to an email
      if (messageData.sender) {
        setRecipientEmail(messageData.sender)
      }
      if (messageData.subject) {
        setSubject(messageData.subject.startsWith('Re:') ? messageData.subject : `Re: ${messageData.subject}`)
      }
      
      // Get user's timezone
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone)
      
      // Fetch optimal send times
      fetchOptimalTimes()
    }
  }, [isOpen, messageData])

  const fetchOptimalTimes = async () => {
    try {
      const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
      const url = recipientEmail 
        ? `${base}/api/phase2/optimal-times?recipientEmail=${encodeURIComponent(recipientEmail)}`
        : `${base}/api/phase2/optimal-times`
      
      const response = await fetch(url, { credentials: 'include' })
      if (response.ok) {
        const data = await response.json()
        setOptimalTimes(data.suggestion ? [data.suggestion] : data.optimalTimes || [])
      }
    } catch (error) {
      console.error('Error fetching optimal times:', error)
    }
  }

  const calculatePresetTime = (preset) => {
    const now = new Date()
    const presetDate = new Date(now)

    if (preset.id === 'optimal' && optimalTimes.length > 0) {
      const optimal = optimalTimes[0]
      presetDate.setDate(now.getDate() + 1)
      presetDate.setHours(optimal.hour || 10, 0, 0, 0)
      return presetDate
    }

    if (preset.days) {
      presetDate.setDate(now.getDate() + preset.days)
    } else if (preset.hours > now.getHours()) {
      // Same day
      presetDate.setHours(preset.hours, 0, 0, 0)
    } else {
      // Next day
      presetDate.setDate(now.getDate() + 1)
      presetDate.setHours(preset.hours, 0, 0, 0)
    }

    return presetDate
  }

  const handlePresetSelect = (preset) => {
    setSelectedPreset(preset.id)
    const presetTime = calculatePresetTime(preset)
    setScheduledFor(presetTime.toISOString().slice(0, 16))
  }

  const handleSchedule = async () => {
    if (!recipientEmail || !subject || !body || !scheduledFor) {
      alert('Please fill in all required fields')
      return
    }

    setIsLoading(true)
    try {
      await onSchedule({
        recipientEmail,
        subject,
        body,
        scheduledFor,
        timezone,
        messageId: messageData?.id
      })
      
      // Reset form
      setRecipientEmail('')
      setSubject('')
      setBody('')
      setScheduledFor('')
      setSelectedPreset('')
    } catch (error) {
      console.error('Error scheduling email:', error)
      alert('Failed to schedule email. Please try again.')
    }
    setIsLoading(false)
  }

  if (!isOpen) return null

  return (
    <div className="email-scheduling-modal">
      <div className="email-scheduling-modal-content">
        <div className="email-scheduling-modal-header">
          <h2 className="email-scheduling-modal-title">
            📅 Schedule Email
          </h2>
          <button 
            className="modal-close-button"
            onClick={onClose}
            disabled={isLoading}
          >
            ✕
          </button>
        </div>

        <div className="email-scheduling-modal-body">
          {/* Quick Schedule Presets */}
          <div className="schedule-presets">
            <h4>Quick Schedule</h4>
            <div className="preset-grid">
              {presets.map(preset => (
                <button
                  key={preset.id}
                  className={`schedule-preset ${selectedPreset === preset.id ? 'selected' : ''}`}
                  onClick={() => handlePresetSelect(preset)}
                  disabled={preset.id === 'optimal' && optimalTimes.length === 0}
                >
                  {preset.label}
                  {preset.id === 'optimal' && optimalTimes.length > 0 && (
                    <div className="optimal-time-hint">
                      {optimalTimes[0].dayName} {optimalTimes[0].hour}:00
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Email Form */}
          <div className="email-form">
            <div className="form-group">
              <label>To *</label>
              <input
                type="email"
                className="form-input"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="recipient@example.com"
                required
              />
            </div>

            <div className="form-group">
              <label>Subject *</label>
              <input
                type="text"
                className="form-input"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject"
                required
              />
            </div>

            <div className="form-group">
              <label>Message *</label>
              <textarea
                className="form-textarea"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your email message..."
                rows={6}
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Send At *</label>
                <input
                  type="datetime-local"
                  className="form-input"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Timezone</label>
                <select
                  className="form-select"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                >
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">Eastern Time</option>
                  <option value="America/Chicago">Central Time</option>
                  <option value="America/Denver">Mountain Time</option>
                  <option value="America/Los_Angeles">Pacific Time</option>
                  <option value="Europe/London">London</option>
                  <option value="Europe/Paris">Paris</option>
                  <option value="Asia/Tokyo">Tokyo</option>
                </select>
              </div>
            </div>

            {/* Optimal Time Suggestions */}
            {optimalTimes.length > 0 && (
              <div className="optimal-suggestions">
                <h4>🎯 AI Recommendations</h4>
                <div className="suggestion-list">
                  {optimalTimes.slice(0, 3).map((time, index) => (
                    <div key={index} className="suggestion-item">
                      <strong>{time.dayName || 'Unknown'} {time.hour}:00</strong>
                      <span>Avg Response: {time.avgResponseTime?.toFixed(1) || 'N/A'}h</span>
                      <span>Score: {time.score?.toFixed(1) || 'N/A'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="modal-actions">
          <button 
            className="modal-button modal-button-secondary"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button 
            className="modal-button modal-button-primary"
            onClick={handleSchedule}
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="loading-spinner">Scheduling...</span>
            ) : (
              'Schedule Email'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default EmailSchedulingModal
