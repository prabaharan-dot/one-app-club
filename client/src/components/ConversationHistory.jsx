import React, { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { useNavigate } from 'react-router-dom'

export default function ConversationHistory() {
  const [sessions, setSessions] = useState([])
  const [selectedSession, setSelectedSession] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [sessionLoading, setSessionLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    loadSessions()
  }, [])

  async function loadSessions() {
    try {
      const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
      const res = await fetch(`${base}/api/chat/sessions`, {
        credentials: 'include'
      })
      
      if (!res.ok) {
        if (res.status === 401) {
          setSessions([])
          return
        }
        throw new Error('Failed to load sessions')
      }
      
      const json = await res.json()
      setSessions(json.sessions || [])
    } catch (err) {
      console.error('Failed to load conversation sessions:', err)
      setSessions([])
    } finally {
      setLoading(false)
    }
  }

  async function loadSessionMessages(sessionId) {
    setSessionLoading(true)
    try {
      const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
      const res = await fetch(`${base}/api/chat/sessions/${sessionId}`, {
        credentials: 'include'
      })
      
      if (!res.ok) {
        console.error('Failed to load session messages. Status:', res.status)
        throw new Error('Failed to load session messages')
      }
      
      const json = await res.json()
      console.log('Messages response for session', sessionId, ':', json)
      console.log('Messages array:', json.messages)
      console.log('First message structure:', json.messages?.[0])
      console.log('Setting messages:', json.messages?.length || 0, 'messages')
      setMessages(json.messages || [])
    } catch (err) {
      console.error('Failed to load session messages:', err)
      setMessages([])
    } finally {
      setSessionLoading(false)
    }
  }

  function selectSession(session) {
    console.log('Selecting session:', session)
    setSelectedSession(session)
    loadSessionMessages(session.id)
  }

  function formatRelativeTime(dateString) {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now - date
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffHours / 24)
    
    if (diffHours < 1) {
      const diffMins = Math.floor(diffMs / (1000 * 60))
      return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`
    } else if (diffDays < 7) {
      return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`
    } else {
      return date.toLocaleDateString()
    }
  }

  async function deleteSession(sessionId, sessionTitle) {
    const confirmDelete = window.confirm(`Are you sure you want to delete "${sessionTitle}"? This action cannot be undone.`)
    
    if (!confirmDelete) return
    
    try {
      const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
      const res = await fetch(`${base}/api/chat/sessions/${sessionId}`, {
        method: 'DELETE',
        credentials: 'include'
      })
      
      if (!res.ok) {
        throw new Error('Failed to delete session')
      }
      
      // Remove from local state
      setSessions(sessions.filter(s => s.id !== sessionId))
      
      // Clear selected session if it was deleted
      if (selectedSession && selectedSession.id === sessionId) {
        setSelectedSession(null)
        setMessages([])
      }
      
    } catch (err) {
      console.error('Failed to delete session:', err)
      alert('Failed to delete conversation. Please try again.')
    }
  }

  if (loading) {
    return (
      <div className="history-root">
        <div className="loading-messages">
          🔄 Loading conversation history...
        </div>
      </div>
    )
  }

  // Debug logging
  console.log('ConversationHistory render - messages:', messages.length, messages)
  if (selectedSession) {
    console.log('Selected session:', selectedSession.id, 'Messages to render:', messages.length)
  }

  return (
    <div className="history-new-root">
      {/* Modern Navigation Bar */}
      <nav className="history-nav">
        <button onClick={() => navigate('/')} className="nav-back-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Chat
        </button>
        <div className="nav-title">
          <span className="nav-icon">💭</span>
          <span>Conversation History</span>
        </div>
        <div className="nav-actions">
          <span className="session-count">{sessions.length} conversations</span>
        </div>
      </nav>

      {/* Main Content Area */}
      <div className="history-main">
        {sessions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-illustration">
              <div className="bubble bubble-1">💬</div>
              <div className="bubble bubble-2">🤖</div>
              <div className="bubble bubble-3">✨</div>
            </div>
            <h2>No conversations yet</h2>
            <p>Start chatting to see your conversation history here</p>
            <button onClick={() => navigate('/')} className="start-chat-btn">
              Start New Conversation
            </button>
          </div>
        ) : (
          <div className="conversations-grid">
            {sessions.map(session => (
              <div
                key={session.id}
                className="conversation-card"
                onClick={() => selectSession(session)}
              >
                <div className="card-header">
                  <div className="card-avatar">
                    {session.title ? session.title.charAt(0).toUpperCase() : '💬'}
                  </div>
                  <div className="card-actions">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteSession(session.id, session.title)
                      }}
                      className="delete-btn"
                      title="Delete conversation"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c0-1 1-2 2-2v2"/>
                      </svg>
                    </button>
                  </div>
                </div>
                
                <div className="card-content">
                  <h3 className="card-title">
                    {session.title || 'Untitled Conversation'}
                  </h3>
                  <div className="card-meta">
                    <span className="meta-item">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12,6 12,12 16,14"/>
                      </svg>
                      {formatRelativeTime(session.created_at)}
                    </span>
                    <span className="meta-item">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                      </svg>
                      {session.message_count || 0} messages
                    </span>
                  </div>
                </div>

                <div className="card-footer">
                  <div className="conversation-preview">
                    Recent activity • Click to view full conversation
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal for viewing conversation */}
      {selectedSession && (
        <div className="conversation-modal" onClick={() => setSelectedSession(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <div className="modal-avatar">
                  {selectedSession.title ? selectedSession.title.charAt(0).toUpperCase() : '💬'}
                </div>
                <div>
                  <h2>{selectedSession.title || 'Untitled Conversation'}</h2>
                  <p>Started {formatRelativeTime(selectedSession.created_at)} • {messages.length} messages</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedSession(null)} 
                className="modal-close"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div className="modal-messages">
              {sessionLoading ? (
                <div className="modal-loading">
                  <div className="spinner"></div>
                  <p>Loading conversation...</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="modal-empty">
                  <p>No messages in this conversation</p>
                </div>
              ) : (
                <div className="messages-timeline">
                  {messages.map((message, index) => (
                    <div
                      key={message.id || index}
                      className={`timeline-message ${message.from}`}
                    >
                      <div className="message-avatar">
                        {message.from === 'user' ? '👤' : '🤖'}
                      </div>
                      <div className="message-bubble">
                        <div className="bubble-header">
                          <span className="sender">
                            {message.from === 'user' ? 'You' : 'Assistant'}
                          </span>
                          {message.timestamp && (
                            <span className="timestamp">
                              {new Date(message.timestamp).toLocaleString()}
                            </span>
                          )}
                        </div>
                        <div className="bubble-content">
                          {message.from === 'assistant' || message.from === 'ai' ? (
                            <ReactMarkdown
                              components={{
                                h1: ({node, ...props}) => <h1 className="md-h1" {...props} />,
                                h2: ({node, ...props}) => <h2 className="md-h2" {...props} />,
                                h3: ({node, ...props}) => <h3 className="md-h3" {...props} />,
                                p: ({node, ...props}) => <p className="md-p" {...props} />,
                                ul: ({node, ...props}) => <ul className="md-ul" {...props} />,
                                ol: ({node, ...props}) => <ol className="md-ol" {...props} />,
                                li: ({node, ...props}) => <li className="md-li" {...props} />,
                                strong: ({node, ...props}) => <strong className="md-strong" {...props} />,
                                code: ({node, inline, ...props}) => 
                                  inline ? 
                                    <code className="md-code-inline" {...props} /> :
                                    <code className="md-code-block" {...props} />,
                                pre: ({node, ...props}) => <pre className="md-pre" {...props} />,
                                a: ({node, ...props}) => <a className="md-link" target="_blank" rel="noopener noreferrer" {...props} />
                              }}
                            >
                              {message.text}
                            </ReactMarkdown>
                          ) : (
                            <p>{message.text}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
