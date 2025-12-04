import React, { useState, useEffect, useRef } from 'react'
import { MdSearch, MdFilterList, MdSave, MdHistory, MdClose } from 'react-icons/md'

export default function EnhancedSearchBar({ onSearch, onResultSelect }) {
  const [query, setQuery] = useState('')
  const [searchType, setSearchType] = useState('semantic')
  const [showFilters, setShowFilters] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [savedSearches, setSavedSearches] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchResults, setSearchResults] = useState([])
  const [showResults, setShowResults] = useState(false)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [saveSearchName, setSaveSearchName] = useState('')
  
  const [filters, setFilters] = useState({
    sender: '',
    dateFrom: '',
    dateTo: '',
    hasAttachments: null,
    isRead: null,
    isImportant: null
  })

  const searchRef = useRef()
  const suggestionsRef = useRef()

  useEffect(() => {
    loadSavedSearches()
  }, [])

  useEffect(() => {
    // Load suggestions when user types
    if (query.length >= 2) {
      loadSuggestions(query)
    } else {
      setSuggestions([])
      setShowSuggestions(false)
    }
  }, [query])

  // Handle clicks outside to close suggestions
  useEffect(() => {
    function handleClickOutside(event) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function loadSuggestions(q) {
    try {
      const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
      const res = await fetch(`${base}/api/search/suggestions?q=${encodeURIComponent(q)}`, {
        credentials: 'include'
      })
      
      if (res.ok) {
        const json = await res.json()
        setSuggestions(json.suggestions || [])
        setShowSuggestions(json.suggestions.length > 0)
      }
    } catch (error) {
      console.error('Failed to load suggestions:', error)
    }
  }

  async function loadSavedSearches() {
    try {
      const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
      const res = await fetch(`${base}/api/search/saved`, {
        credentials: 'include'
      })
      
      if (res.ok) {
        const json = await res.json()
        setSavedSearches(json.saved_searches || [])
      }
    } catch (error) {
      console.error('Failed to load saved searches:', error)
    }
  }

  async function performSearch(searchQuery = query) {
    if (!searchQuery.trim()) return
    
    setLoading(true)
    setShowSuggestions(false)
    
    try {
      const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
      const payload = {
        query: searchQuery,
        search_type: searchType,
        limit: 20
      }
      
      if (searchType === 'advanced') {
        payload.filters = filters
      }
      
      const res = await fetch(`${base}/api/search`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      
      if (res.ok) {
        const json = await res.json()
        setSearchResults(json.results || [])
        setShowResults(true)
        onSearch?.(json.results, searchQuery, searchType)
      } else {
        console.error('Search failed')
      }
    } catch (error) {
      console.error('Error performing search:', error)
    } finally {
      setLoading(false)
    }
  }

  async function executeSavedSearch(savedSearchId) {
    setLoading(true)
    try {
      const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
      const res = await fetch(`${base}/api/search/saved/${savedSearchId}/execute`, {
        method: 'POST',
        credentials: 'include'
      })
      
      if (res.ok) {
        const json = await res.json()
        setSearchResults(json.results || [])
        setShowResults(true)
        onSearch?.(json.results, 'Saved Search', 'saved')
      }
    } catch (error) {
      console.error('Error executing saved search:', error)
    } finally {
      setLoading(false)
    }
  }

  async function saveCurrentSearch() {
    if (!query.trim() || !saveSearchName.trim()) return
    
    try {
      const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
      const payload = {
        name: saveSearchName,
        query,
        search_type: searchType
      }
      
      if (searchType === 'advanced') {
        payload.filters = filters
      }
      
      const res = await fetch(`${base}/api/search/save`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      
      if (res.ok) {
        const json = await res.json()
        setSavedSearches(prev => [json.saved_search, ...prev])
        setShowSaveModal(false)
        setSaveSearchName('')
      }
    } catch (error) {
      console.error('Error saving search:', error)
    }
  }

  function handleKeyPress(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      performSearch()
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
      setShowResults(false)
    }
  }

  function selectSuggestion(suggestion) {
    setQuery(suggestion.query)
    setShowSuggestions(false)
    performSearch(suggestion.query)
  }

  function clearFilters() {
    setFilters({
      sender: '',
      dateFrom: '',
      dateTo: '',
      hasAttachments: null,
      isRead: null,
      isImportant: null
    })
  }

  function formatResultDate(dateString) {
    const date = new Date(dateString)
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="enhanced-search-container">
      {/* Main Search Bar */}
      <div className="search-bar-wrapper" ref={searchRef}>
        <div className="search-input-container">
          <MdSearch className="search-icon" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyPress}
            onFocus={() => query.length >= 2 && setShowSuggestions(true)}
            placeholder="Search your emails..."
            className="search-input"
          />
          
          <div className="search-controls">
            <select
              value={searchType}
              onChange={e => setSearchType(e.target.value)}
              className="search-type-select"
            >
              <option value="semantic">Smart Search</option>
              <option value="keyword">Keyword Search</option>
              <option value="advanced">Advanced Search</option>
            </select>
            
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`filter-btn ${showFilters ? 'active' : ''}`}
              title="Filters"
            >
              <MdFilterList />
            </button>
            
            <button
              onClick={() => performSearch()}
              disabled={!query.trim() || loading}
              className="search-btn"
            >
              {loading ? '...' : 'Search'}
            </button>
          </div>
        </div>

        {/* Search Suggestions */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="search-suggestions" ref={suggestionsRef}>
            {suggestions.map((suggestion, index) => (
              <div
                key={index}
                onClick={() => selectSuggestion(suggestion)}
                className="suggestion-item"
              >
                <MdHistory className="suggestion-icon" />
                <span>{suggestion.query}</span>
                <span className="suggestion-frequency">{suggestion.frequency} times</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Advanced Filters */}
      {showFilters && searchType === 'advanced' && (
        <div className="advanced-filters">
          <div className="filters-grid">
            <div className="filter-group">
              <label>From Sender:</label>
              <input
                type="text"
                value={filters.sender}
                onChange={e => setFilters(prev => ({ ...prev, sender: e.target.value }))}
                placeholder="sender@example.com"
              />
            </div>
            
            <div className="filter-group">
              <label>Date From:</label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={e => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
              />
            </div>
            
            <div className="filter-group">
              <label>Date To:</label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={e => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
              />
            </div>
            
            <div className="filter-group">
              <label>Status:</label>
              <select
                value={filters.isRead ?? ''}
                onChange={e => setFilters(prev => ({ 
                  ...prev, 
                  isRead: e.target.value === '' ? null : e.target.value === 'true' 
                }))}
              >
                <option value="">All</option>
                <option value="true">Read</option>
                <option value="false">Unread</option>
              </select>
            </div>
          </div>
          
          <div className="filter-actions">
            <button onClick={clearFilters} className="clear-filters-btn">
              Clear Filters
            </button>
          </div>
        </div>
      )}

      {/* Saved Searches */}
      {savedSearches.length > 0 && (
        <div className="saved-searches">
          <div className="saved-searches-header">
            <span>Quick Searches:</span>
            {query && (
              <button
                onClick={() => setShowSaveModal(true)}
                className="save-search-btn"
              >
                <MdSave /> Save Current Search
              </button>
            )}
          </div>
          <div className="saved-searches-list">
            {savedSearches.slice(0, 5).map(saved => (
              <button
                key={saved.id}
                onClick={() => executeSavedSearch(saved.id)}
                className="saved-search-item"
              >
                {saved.name}
                <span className="usage-count">({saved.usage_count})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search Results */}
      {showResults && (
        <div className="search-results">
          <div className="results-header">
            <h3>Search Results ({searchResults.length})</h3>
            <button
              onClick={() => setShowResults(false)}
              className="close-results-btn"
            >
              <MdClose />
            </button>
          </div>
          
          <div className="results-list">
            {searchResults.length === 0 ? (
              <div className="no-results">
                <p>No emails found matching your search.</p>
              </div>
            ) : (
              searchResults.map(result => (
                <div
                  key={result.id}
                  onClick={() => onResultSelect?.(result)}
                  className="result-item"
                >
                  <div className="result-header">
                    <span className="result-sender">{result.sender}</span>
                    <span className="result-date">{formatResultDate(result.received_at)}</span>
                  </div>
                  <div className="result-subject">{result.subject}</div>
                  <div className="result-snippet">
                    {result.body_plain ? result.body_plain.substring(0, 150) + '...' : ''}
                  </div>
                  {result.similarity_score && (
                    <div className="result-meta">
                      Relevance: {Math.round((1 - result.similarity_score) * 100)}%
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Save Search Modal */}
      {showSaveModal && (
        <div className="modal-overlay" onClick={() => setShowSaveModal(false)}>
          <div className="modal-content save-search-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Save Search</h3>
              <button onClick={() => setShowSaveModal(false)} className="modal-close">
                <MdClose />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Search Name:</label>
                <input
                  type="text"
                  value={saveSearchName}
                  onChange={e => setSaveSearchName(e.target.value)}
                  placeholder="e.g., Important emails from John"
                  autoFocus
                />
              </div>
              <div className="search-preview">
                <strong>Query:</strong> {query}
                <br />
                <strong>Type:</strong> {searchType}
              </div>
            </div>
            <div className="modal-actions">
              <button onClick={() => setShowSaveModal(false)}>Cancel</button>
              <button
                onClick={saveCurrentSearch}
                disabled={!saveSearchName.trim()}
                className="primary"
              >
                Save Search
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
