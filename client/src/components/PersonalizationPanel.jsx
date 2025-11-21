import React, { useState, useEffect, useRef } from 'react'
import { FaUser, FaTimes, FaSave, FaGlobe, FaClock, FaBriefcase, FaEdit } from 'react-icons/fa'

export default function PersonalizationPanel() {
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState({
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    location: '',
    role: '',
    personalNote: ''
  })
  const [hasChanges, setHasChanges] = useState(false)
  const panelRef = useRef()

  // Close panel when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Load user profile on component mount
  useEffect(() => {
    if (isOpen) {
      loadProfile()
    }
  }, [isOpen])

  const loadProfile = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/settings/profile', {
        credentials: 'include'
      })
      if (response.ok) {
        const data = await response.json()
        setProfile({
          timezone: data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          location: data.location || '',
          role: data.role || '',
          personalNote: data.personalNote || ''
        })
      }
    } catch (error) {
      console.error('Failed to load profile:', error)
    } finally {
      setLoading(false)
    }
  }

  const saveProfile = async () => {
    setSaving(true)
    try {
      const response = await fetch('/api/settings/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(profile)
      })
      
      if (response.ok) {
        console.log('✅ Profile saved successfully')
        setHasChanges(false)
        // Show success feedback
        const button = document.querySelector('.save-btn')
        if (button) {
          button.style.background = 'rgba(34,197,94,0.2)'
          button.style.color = '#16a34a'
          setTimeout(() => {
            button.style.background = 'rgba(99,102,241,0.1)'
            button.style.color = '#4f46e5'
          }, 1000)
        }
      } else {
        throw new Error('Failed to save profile')
      }
    } catch (error) {
      console.error('Failed to save profile:', error)
      alert('Failed to save profile. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleInputChange = (field, value) => {
    setProfile(prev => ({ ...prev, [field]: value }))
    setHasChanges(true)
  }

  // Get list of common timezones
  const commonTimezones = [
    'UTC',
    'America/New_York',
    'America/Chicago', 
    'America/Denver',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Asia/Kolkata',
    'Australia/Sydney'
  ]

  const currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  return (
    <div className="personalization-panel" ref={panelRef} style={{position: 'relative'}}>
      {/* Profile Icon */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="personalization-button"
        style={{
          position: 'relative',
          background: 'rgba(99,102,241,0.1)',
          border: '1px solid rgba(99,102,241,0.2)',
          padding: '8px',
          borderRadius: '50%',
          cursor: 'pointer',
          color: '#4f46e5',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '40px',
          height: '40px',
          fontSize: '16px',
          transition: 'all 0.2s ease'
        }}
        onMouseEnter={(e) => {
          e.target.style.background = 'rgba(99,102,241,0.2)'
          e.target.style.borderColor = 'rgba(99,102,241,0.3)'
        }}
        onMouseLeave={(e) => {
          e.target.style.background = 'rgba(99,102,241,0.1)'
          e.target.style.borderColor = 'rgba(99,102,241,0.2)'
        }}
        title="Personalization Settings"
      >
        <FaUser />
      </button>

      {/* Profile Settings Popup */}
      {isOpen && (
        <div 
          className="personalization-popup"
          style={{
            position: 'absolute',
            top: '50px',
            right: '0',
            width: '420px',
            maxHeight: '600px',
            overflowY: 'auto',
            background: 'var(--glass)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '16px',
            padding: '20px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            zIndex: 1001,
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '20px',
            paddingBottom: '15px',
            borderBottom: '1px solid rgba(255,255,255,0.1)'
          }}>
            <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
              <FaUser style={{color: '#4f46e5'}} />
              <h3 style={{margin: 0, color: 'var(--text)', fontSize: '18px', fontWeight: '600'}}>
                Personalization
              </h3>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--muted)',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px'
              }}
            >
              <FaTimes />
            </button>
          </div>

          {loading ? (
            <div style={{textAlign: 'center', padding: '40px', color: 'var(--muted)'}}>
              Loading profile...
            </div>
          ) : (
            <div style={{display: 'flex', flexDirection: 'column', gap: '20px'}}>
              
              {/* Timezone Section */}
              <div>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '8px',
                  color: 'var(--text)',
                  fontSize: '14px',
                  fontWeight: '500'
                }}>
                  <FaClock style={{color: '#059669'}} />
                  Timezone
                </label>
                <select
                  value={profile.timezone}
                  onChange={(e) => handleInputChange('timezone', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(255,255,255,0.05)',
                    color: 'var(--text)',
                    fontSize: '14px'
                  }}
                >
                  {currentTimezone && !commonTimezones.includes(currentTimezone) && (
                    <option value={currentTimezone}>{currentTimezone} (Detected)</option>
                  )}
                  {commonTimezones.map(tz => (
                    <option key={tz} value={tz}>
                      {tz} {tz === currentTimezone ? '(Detected)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Location Section */}
              <div>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '8px',
                  color: 'var(--text)',
                  fontSize: '14px',
                  fontWeight: '500'
                }}>
                  <FaGlobe style={{color: '#0284c7'}} />
                  Location
                </label>
                <input
                  type="text"
                  placeholder="e.g., San Francisco, CA or Remote"
                  value={profile.location}
                  onChange={(e) => handleInputChange('location', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(255,255,255,0.05)',
                    color: 'var(--text)',
                    fontSize: '14px'
                  }}
                />
              </div>

              {/* Role Section */}
              <div>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '8px',
                  color: 'var(--text)',
                  fontSize: '14px',
                  fontWeight: '500'
                }}>
                  <FaBriefcase style={{color: '#7c3aed'}} />
                  Current Role
                </label>
                <input
                  type="text"
                  placeholder="e.g., Software Engineer, Product Manager, CEO"
                  value={profile.role}
                  onChange={(e) => handleInputChange('role', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(255,255,255,0.05)',
                    color: 'var(--text)',
                    fontSize: '14px'
                  }}
                />
              </div>

              {/* Personal Note Section */}
              <div>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '8px',
                  color: 'var(--text)',
                  fontSize: '14px',
                  fontWeight: '500'
                }}>
                  <FaEdit style={{color: '#dc2626'}} />
                  Personal Note for AI Assistant
                </label>
                <textarea
                  placeholder="Tell your AI assistant about your preferences, work style, or anything that would help it assist you better..."
                  value={profile.personalNote}
                  onChange={(e) => handleInputChange('personalNote', e.target.value)}
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(255,255,255,0.05)',
                    color: 'var(--text)',
                    fontSize: '14px',
                    resize: 'vertical',
                    minHeight: '100px',
                    fontFamily: 'inherit'
                  }}
                />
                <div style={{
                  fontSize: '12px',
                  color: 'var(--muted)',
                  marginTop: '6px'
                }}>
                  This note helps the AI understand your context and provide more personalized assistance.
                </div>
              </div>

              {/* Save Button */}
              <div style={{paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.1)'}}>
                <button
                  onClick={saveProfile}
                  disabled={!hasChanges || saving}
                  className="save-btn"
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: hasChanges ? '1px solid rgba(99,102,241,0.3)' : '1px solid rgba(255,255,255,0.1)',
                    background: hasChanges ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.05)',
                    color: hasChanges ? '#4f46e5' : 'var(--muted)',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: hasChanges ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <FaSave />
                  {saving ? 'Saving...' : hasChanges ? 'Save Changes' : 'No Changes'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-10px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        
        .personalization-popup::-webkit-scrollbar {
          width: 6px;
        }
        
        .personalization-popup::-webkit-scrollbar-track {
          background: rgba(255,255,255,0.1);
          border-radius: 3px;
        }
        
        .personalization-popup::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.3);
          border-radius: 3px;
        }
        
        .personalization-popup::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.4);
        }
      `}</style>
    </div>
  )
}
