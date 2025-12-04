import React, { useState, useEffect } from 'react'

const EmailAnalyticsDashboard = ({ isOpen, onClose }) => {
  const [analytics, setAnalytics] = useState(null)
  const [insights, setInsights] = useState(null)
  const [loading, setLoading] = useState(false)
  const [timeRange, setTimeRange] = useState(30)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    if (isOpen) {
      fetchAnalytics()
      fetchInsights()
    }
  }, [isOpen, timeRange])

  const fetchAnalytics = async () => {
    setLoading(true)
    try {
      const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
      const response = await fetch(`${base}/api/phase2/analytics?days=${timeRange}&includeAggregates=true`, {
        credentials: 'include'
      })
      
      if (response.ok) {
        const data = await response.json()
        setAnalytics(data.analytics)
      }
    } catch (error) {
      console.error('Error fetching analytics:', error)
    }
    setLoading(false)
  }

  const fetchInsights = async () => {
    try {
      const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
      const response = await fetch(`${base}/api/phase2/analytics/insights?days=${timeRange}`, {
        credentials: 'include'
      })
      
      if (response.ok) {
        const data = await response.json()
        setInsights(data.insights)
      }
    } catch (error) {
      console.error('Error fetching insights:', error)
    }
  }

  const formatPercentage = (value) => {
    return value ? `${parseFloat(value).toFixed(1)}%` : '0%'
  }

  const formatNumber = (value) => {
    return value ? parseFloat(value).toFixed(1) : '0'
  }

  const getInsightIcon = (type) => {
    switch (type) {
      case 'response_time': return '⏱️'
      case 'engagement': return '📈'
      case 'timing': return '🎯'
      case 'trend': return '📊'
      default: return '💡'
    }
  }

  const getInsightColor = (severity) => {
    switch (severity) {
      case 'success': return '#10b981'
      case 'warning': return '#f59e0b'
      case 'info': return '#3b82f6'
      default: return '#6b7280'
    }
  }

  if (!isOpen) return null

  return (
    <div className="analytics-dashboard-overlay">
      <div className="analytics-dashboard">
        <div className="analytics-dashboard-header">
          <div className="dashboard-title">
            <span>📊 Email Analytics</span>
          </div>
          <div className="dashboard-controls">
            <select
              className="time-range-select"
              value={timeRange}
              onChange={(e) => setTimeRange(parseInt(e.target.value))}
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <button className="dashboard-close-button" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="analytics-tabs">
          <button
            className={`analytics-tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button
            className={`analytics-tab ${activeTab === 'engagement' ? 'active' : ''}`}
            onClick={() => setActiveTab('engagement')}
          >
            Engagement
          </button>
          <button
            className={`analytics-tab ${activeTab === 'insights' ? 'active' : ''}`}
            onClick={() => setActiveTab('insights')}
          >
            Insights
          </button>
        </div>

        <div className="analytics-dashboard-body">
          {loading ? (
            <div className="analytics-loading">
              <div className="loading-spinner"></div>
              <p>Loading analytics...</p>
            </div>
          ) : (
            <>
              {activeTab === 'overview' && analytics && (
                <div className="overview-tab">
                  <div className="metrics-grid">
                    <div className="metric-card">
                      <div className="metric-icon">📤</div>
                      <div className="metric-content">
                        <h3>{analytics.aggregates?.total_sent || 0}</h3>
                        <p>Emails Sent</p>
                      </div>
                    </div>

                    <div className="metric-card">
                      <div className="metric-icon">👀</div>
                      <div className="metric-content">
                        <h3>{formatPercentage(analytics.aggregates?.open_rate_percent)}</h3>
                        <p>Open Rate</p>
                      </div>
                    </div>

                    <div className="metric-card">
                      <div className="metric-icon">↩️</div>
                      <div className="metric-content">
                        <h3>{formatPercentage(analytics.aggregates?.reply_rate_percent)}</h3>
                        <p>Reply Rate</p>
                      </div>
                    </div>

                    <div className="metric-card">
                      <div className="metric-icon">⏱️</div>
                      <div className="metric-content">
                        <h3>{formatNumber(analytics.aggregates?.avg_response_time_hours)}h</h3>
                        <p>Avg Response Time</p>
                      </div>
                    </div>

                    <div className="metric-card">
                      <div className="metric-icon">⭐</div>
                      <div className="metric-content">
                        <h3>{formatNumber(analytics.aggregates?.avg_engagement_score)}/10</h3>
                        <p>Engagement Score</p>
                      </div>
                    </div>

                    <div className="metric-card">
                      <div className="metric-icon">🎯</div>
                      <div className="metric-content">
                        <h3>{formatPercentage(analytics.aggregates?.click_rate_percent)}</h3>
                        <p>Click Rate</p>
                      </div>
                    </div>
                  </div>

                  {insights?.summary && (
                    <div className="summary-section">
                      <h3>📈 Performance Summary</h3>
                      <div className="summary-stats">
                        <div className="summary-item">
                          <strong>Total Activity:</strong> {insights.summary.emails_sent} sent, {insights.summary.emails_received} received
                        </div>
                        <div className="summary-item">
                          <strong>Engagement Trends:</strong> {insights.trends?.length > 0 ? 'Data available' : 'No trend data yet'}
                        </div>
                        <div className="summary-item">
                          <strong>Top Recipients:</strong> {insights.topRecipients?.length || 0} active contacts
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'engagement' && insights && (
                <div className="engagement-tab">
                  {insights.topRecipients && insights.topRecipients.length > 0 && (
                    <div className="recipients-section">
                      <h3>👥 Top Recipients by Engagement</h3>
                      <div className="recipients-list">
                        {insights.topRecipients.slice(0, 10).map((recipient, index) => (
                          <div key={index} className="recipient-item">
                            <div className="recipient-info">
                              <div className="recipient-email">{recipient.recipient_email}</div>
                              <div className="recipient-stats">
                                {recipient.emails_sent} emails • {formatPercentage(recipient.reply_rate_percent)} reply rate
                              </div>
                            </div>
                            <div className="engagement-score">
                              <div className="score-number">{formatNumber(recipient.avg_engagement_score)}/10</div>
                              <div className="score-bar">
                                <div 
                                  className="score-fill" 
                                  style={{ width: `${(recipient.avg_engagement_score / 10) * 100}%` }}
                                ></div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {insights.optimalTimes && insights.optimalTimes.length > 0 && (
                    <div className="optimal-times-section">
                      <h3>🎯 Optimal Send Times</h3>
                      <div className="optimal-times-grid">
                        {insights.optimalTimes.slice(0, 5).map((time, index) => (
                          <div key={index} className="optimal-time-card">
                            <div className="time-info">
                              <div className="day-name">{time.dayName}</div>
                              <div className="time-hour">{time.hour}:00</div>
                            </div>
                            <div className="time-stats">
                              <div className="stat">
                                <span className="stat-label">Reply Rate:</span>
                                <span className="stat-value">{formatPercentage(time.replyRate)}</span>
                              </div>
                              <div className="stat">
                                <span className="stat-label">Avg Response:</span>
                                <span className="stat-value">{formatNumber(time.avgResponseTime)}h</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {insights.trends && insights.trends.length > 0 && (
                    <div className="trends-section">
                      <h3>📈 Engagement Trends</h3>
                      <div className="trends-chart">
                        {insights.trends.slice(0, 14).map((trend, index) => (
                          <div key={index} className="trend-item">
                            <div className="trend-date">
                              {new Date(trend.date).toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric' 
                              })}
                            </div>
                            <div className="trend-bars">
                              <div className="trend-bar">
                                <div className="bar-label">Sent</div>
                                <div className="bar-fill" style={{ 
                                  width: `${Math.min(100, (trend.emails_sent / 20) * 100)}%`,
                                  backgroundColor: '#3b82f6'
                                }}></div>
                                <div className="bar-value">{trend.emails_sent}</div>
                              </div>
                              <div className="trend-bar">
                                <div className="bar-label">Replied</div>
                                <div className="bar-fill" style={{ 
                                  width: `${Math.min(100, (trend.emails_replied / 10) * 100)}%`,
                                  backgroundColor: '#10b981'
                                }}></div>
                                <div className="bar-value">{trend.emails_replied}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'insights' && insights?.insights && (
                <div className="insights-tab">
                  <h3>💡 AI-Powered Insights</h3>
                  {insights.insights.length === 0 ? (
                    <div className="no-insights">
                      <div className="no-insights-icon">🤔</div>
                      <p>No specific insights available yet. Send more emails to get personalized recommendations!</p>
                    </div>
                  ) : (
                    <div className="insights-list">
                      {insights.insights.map((insight, index) => (
                        <div 
                          key={index} 
                          className="insight-item"
                          style={{ borderLeftColor: getInsightColor(insight.severity) }}
                        >
                          <div className="insight-header">
                            <span className="insight-icon">{getInsightIcon(insight.type)}</span>
                            <span className="insight-type">{insight.type.replace('_', ' ').toUpperCase()}</span>
                            <span className={`insight-severity ${insight.severity}`}>
                              {insight.severity.toUpperCase()}
                            </span>
                          </div>
                          <div className="insight-message">
                            {insight.message}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="insights-actions">
                    <h4>🚀 Recommended Actions</h4>
                    <div className="action-recommendations">
                      <div className="action-item">
                        <span className="action-icon">📝</span>
                        <span>Use email templates to improve consistency and response rates</span>
                      </div>
                      <div className="action-item">
                        <span className="action-icon">📅</span>
                        <span>Schedule emails for optimal times to increase engagement</span>
                      </div>
                      <div className="action-item">
                        <span className="action-icon">🔔</span>
                        <span>Set up smart notifications for high-priority emails</span>
                      </div>
                      <div className="action-item">
                        <span className="action-icon">⏰</span>
                        <span>Use snooze feature to manage email timing better</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default EmailAnalyticsDashboard
