import React, { useState, useEffect } from 'react'
import { MdSnooze, MdClose, MdSchedule, MdCalendarToday } from 'react-icons/md'

export default function SnoozeModal({ 
  isOpen, 
  onClose, 
  onSnooze, 
  messageId,
  messageSubject = "this email"
}) {
  const [snoozePresets, setSnoozePresets] = useState([])
  const [selectedPreset, setSelectedPreset] = useState('')
  const [customDateTime, setCustomDateTime] = useState('')
  const [useCustom, setUseCustom] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      loadSnoozePresets()
      // Set default custom time to tomorrow 9 AM
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(9, 0, 0, 0)
      setCustomDateTime(tomorrow.toISOString().slice(0, 16))
    }
  }, [isOpen])

  async function loadSnoozePresets() {
    try {
      const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
      const res = await fetch(`${base}/api/snooze/presets`, {
        credentials: 'include'
      })
      
      if (res.ok) {
        const json = await res.json()
        setSnoozePresets(json.presets || [])
      }
    } catch (error) {
      console.error('Failed to load snooze presets:', error)
    }
  }

  async function handleSnooze() {
    if (!messageId) return
    
    setLoading(true)
    try {
      const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
      const payload = useCustom 
        ? { snooze_until: customDateTime }
        : { preset: selectedPreset }
      
      const res = await fetch(`${base}/api/messages/${messageId}/snooze`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      
      if (res.ok) {
        const json = await res.json()
        onSnooze?.(json)
        onClose()
      } else {
        const error = await res.json()
        console.error('Snooze failed:', error)
        alert('Failed to snooze email: ' + (error.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Error snoozing email:', error)
      alert('Failed to snooze email. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function formatPresetLabel(key) {
    return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  function formatPresetTime(datetime) {
    if (!datetime) return ''
    const date = new Date(datetime)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()
    const isTomorrow = date.toDateString() === new Date(now.getTime() + 24*60*60*1000).toDateString()
    
    let dateStr = ''
    if (isToday) dateStr = 'Today'
    else if (isTomorrow) dateStr = 'Tomorrow'
    else dateStr = date.toLocaleDateString()
    
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    
    return `${dateStr} at ${timeStr}`
  }

  if (!isOpen) return null

  const canSnooze = (useCustom && customDateTime) || (!useCustom && selectedPreset)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content snooze-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            <MdSnooze style={{ marginRight: '8px' }} />
            Snooze Email
          </h2>
          <button onClick={onClose} className="modal-close">
            <MdClose />
          </button>
        </div>

        <div className="modal-body">
          <div className="snooze-message">
            <p>Snooze <strong>"{messageSubject}"</strong> until:</p>
          </div>

          {/* Snooze Mode Toggle */}
          <div className="snooze-mode-toggle">
            <button
              onClick={() => setUseCustom(false)}
              className={`mode-btn ${!useCustom ? 'active' : ''}`}
            >
              <MdSchedule /> Quick Options
            </button>
            <button
              onClick={() => setUseCustom(true)}
              className={`mode-btn ${useCustom ? 'active' : ''}`}
            >
              <MdCalendarToday /> Custom Time
            </button>
          </div>

          {/* Quick Presets */}
          {!useCustom && (
            <div className="snooze-presets">
              {snoozePresets.map(preset => (
                <div
                  key={preset.key}
                  onClick={() => setSelectedPreset(preset.key)}
                  className={`preset-option ${selectedPreset === preset.key ? 'selected' : ''}`}
                >
                  <div className="preset-label">{formatPresetLabel(preset.key)}</div>
                  <div className="preset-time">{formatPresetTime(preset.datetime)}</div>
                </div>
              ))}
            </div>
          )}

          {/* Custom Date/Time */}
          {useCustom && (
            <div className="custom-datetime">
              <label>Choose date and time:</label>
              <input
                type="datetime-local"
                value={customDateTime}
                onChange={e => setCustomDateTime(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                className="datetime-input"
              />
              {customDateTime && (
                <div className="custom-preview">
                  Will appear: {formatPresetTime(customDateTime)}
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="modal-actions">
            <button onClick={onClose} className="cancel-btn">
              Cancel
            </button>
            <button
              onClick={handleSnooze}
              disabled={!canSnooze || loading}
              className="snooze-btn primary"
            >
              {loading ? 'Snoozing...' : 'Snooze Email'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
