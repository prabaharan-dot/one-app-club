import React, { useState, useEffect } from 'react'
import { MdTemplate, MdAdd, MdClose, MdEdit } from 'react-icons/md'

export default function EmailTemplateModal({ 
  isOpen, 
  onClose, 
  onTemplateSelect, 
  emailContent = null 
}) {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [selectedCategory, setSelectedCategory] = useState('all')
  
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    subject_template: '',
    body_template: '',
    category: 'general'
  })

  const categories = [
    { key: 'all', label: 'All Templates' },
    { key: 'general', label: 'General' },
    { key: 'thank_you', label: 'Thank You' },
    { key: 'follow_up', label: 'Follow Up' },
    { key: 'meeting_decline', label: 'Meeting Decline' },
    { key: 'meeting_accept', label: 'Meeting Accept' },
    { key: 'introduction', label: 'Introduction' }
  ]

  useEffect(() => {
    if (isOpen) {
      loadTemplates()
      if (emailContent) {
        loadSuggestions()
      }
    }
  }, [isOpen, selectedCategory])

  async function loadTemplates() {
    setLoading(true)
    try {
      const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
      const categoryParam = selectedCategory !== 'all' ? `?category=${selectedCategory}` : ''
      const res = await fetch(`${base}/api/templates${categoryParam}`, {
        credentials: 'include'
      })
      
      if (res.ok) {
        const json = await res.json()
        setTemplates(json.templates || [])
      }
    } catch (error) {
      console.error('Failed to load templates:', error)
    } finally {
      setLoading(false)
    }
  }

  async function loadSuggestions() {
    if (!emailContent) return
    
    try {
      const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
      const res = await fetch(`${base}/api/templates/suggest`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_content: emailContent })
      })
      
      if (res.ok) {
        const json = await res.json()
        setSuggestions(json.suggestions || [])
      }
    } catch (error) {
      console.error('Failed to load suggestions:', error)
    }
  }

  async function createTemplate() {
    try {
      const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
      const res = await fetch(`${base}/api/templates`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTemplate)
      })
      
      if (res.ok) {
        const json = await res.json()
        setTemplates(prev => [json.template, ...prev])
        setNewTemplate({
          name: '',
          subject_template: '',
          body_template: '',
          category: 'general'
        })
        setShowCreateForm(false)
      } else {
        console.error('Failed to create template')
      }
    } catch (error) {
      console.error('Error creating template:', error)
    }
  }

  async function useTemplate(template) {
    try {
      const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
      const res = await fetch(`${base}/api/templates/${template.id}/use`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variables: {
            sender_name: 'there', // This would come from email context
            user_name: 'Best regards' // This would come from user profile
          }
        })
      })
      
      if (res.ok) {
        const json = await res.json()
        onTemplateSelect(json.template)
        onClose()
      }
    } catch (error) {
      console.error('Error using template:', error)
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content template-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            <MdTemplate style={{ marginRight: '8px' }} />
            Email Templates
          </h2>
          <button onClick={onClose} className="modal-close">
            <MdClose />
          </button>
        </div>

        <div className="modal-body">
          {/* Category Filter */}
          <div className="template-categories">
            {categories.map(cat => (
              <button
                key={cat.key}
                onClick={() => setSelectedCategory(cat.key)}
                className={`category-btn ${selectedCategory === cat.key ? 'active' : ''}`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Suggestions Section */}
          {suggestions.length > 0 && (
            <div className="template-suggestions">
              <h3>💡 Suggested Templates</h3>
              <div className="suggestions-grid">
                {suggestions.map(template => (
                  <div key={template.id} className="suggestion-card">
                    <div className="suggestion-header">
                      <span className="template-name">{template.name}</span>
                      <span className="template-category">{template.category}</span>
                    </div>
                    <div className="template-preview">
                      {template.body_template.substring(0, 100)}...
                    </div>
                    <button
                      onClick={() => useTemplate(template)}
                      className="use-template-btn"
                    >
                      Use Template
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Create New Template Section */}
          <div className="template-actions">
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="create-template-btn"
            >
              <MdAdd /> {showCreateForm ? 'Cancel' : 'Create New Template'}
            </button>
          </div>

          {/* Create Template Form */}
          {showCreateForm && (
            <div className="create-template-form">
              <div className="form-group">
                <label>Template Name</label>
                <input
                  type="text"
                  value={newTemplate.name}
                  onChange={e => setNewTemplate(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Thank You Response"
                />
              </div>
              
              <div className="form-group">
                <label>Category</label>
                <select
                  value={newTemplate.category}
                  onChange={e => setNewTemplate(prev => ({ ...prev, category: e.target.value }))}
                >
                  {categories.filter(c => c.key !== 'all').map(cat => (
                    <option key={cat.key} value={cat.key}>{cat.label}</option>
                  ))}
                </select>
              </div>
              
              <div className="form-group">
                <label>Subject Template (optional)</label>
                <input
                  type="text"
                  value={newTemplate.subject_template}
                  onChange={e => setNewTemplate(prev => ({ ...prev, subject_template: e.target.value }))}
                  placeholder="Re: {original_subject}"
                />
              </div>
              
              <div className="form-group">
                <label>Body Template</label>
                <textarea
                  rows={6}
                  value={newTemplate.body_template}
                  onChange={e => setNewTemplate(prev => ({ ...prev, body_template: e.target.value }))}
                  placeholder="Hi {sender_name},&#10;&#10;Thank you for your email...&#10;&#10;Best regards,&#10;{user_name}"
                />
              </div>
              
              <button
                onClick={createTemplate}
                disabled={!newTemplate.name || !newTemplate.body_template}
                className="save-template-btn"
              >
                Save Template
              </button>
            </div>
          )}

          {/* Templates List */}
          <div className="templates-list">
            {loading ? (
              <div className="loading">Loading templates...</div>
            ) : templates.length === 0 ? (
              <div className="empty-state">
                <MdTemplate size={48} />
                <p>No templates found</p>
                <p>Create your first template to get started</p>
              </div>
            ) : (
              <div className="templates-grid">
                {templates.map(template => (
                  <div key={template.id} className="template-card">
                    <div className="template-header">
                      <span className="template-name">{template.name}</span>
                      <div className="template-meta">
                        <span className="category-badge">{template.category}</span>
                        <span className="usage-count">Used {template.usage_count || 0} times</span>
                      </div>
                    </div>
                    
                    {template.subject_template && (
                      <div className="template-subject">
                        <strong>Subject:</strong> {template.subject_template}
                      </div>
                    )}
                    
                    <div className="template-body">
                      {template.body_template.length > 150
                        ? `${template.body_template.substring(0, 150)}...`
                        : template.body_template
                      }
                    </div>
                    
                    <div className="template-actions">
                      <button
                        onClick={() => useTemplate(template)}
                        className="use-btn primary"
                      >
                        Use Template
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
