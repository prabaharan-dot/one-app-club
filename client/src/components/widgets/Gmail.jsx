import React, {useEffect, useState} from 'react'
import { MdEmail, MdSummarize, MdToday, MdPlaylistAddCheck } from 'react-icons/md'

export default function Gmail(){
  const [loading, setLoading] = useState(true)
  const [counts, setCounts] = useState({total_unread:0, total_action_required:0, immediate_action:0})
  const [error, setError] = useState(null)
  const [showHoverMenu, setShowHoverMenu] = useState(false)
  const [hoverTimeout, setHoverTimeout] = useState(null)

  useEffect(()=>{
    let abort = false
    async function load(){
      setLoading(true)
      try{
        const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
        const res = await fetch(`${base}/api/messages/pending`, {credentials:'include'})
        if(!res.ok){
          setError('failed')
          setLoading(false)
          return
        }
        const json = await res.json()
        if(abort) return
        setCounts({
          total_unread: json.total_unread || 0,
          total_action_required: json.total_action_required || 0,
          immediate_action: json.immediate_action || 0
        })
      }catch(e){
        if(!abort) setError(e.message || 'error')
      }finally{ if(!abort) setLoading(false) }
    }
    load()
    const id = setInterval(load, 60 * 1000) // refresh every minute
    return ()=>{ abort = true; clearInterval(id) }
  },[])

  function openInbox(){
    // dispatch event for ChatWindow to fetch and render pending messages like an agent
    window.dispatchEvent(new CustomEvent('showPendingMessages'))
    // also focus chat input if available
    const ta = document.querySelector('.chat-card .input-box')
    if(ta){ ta.focus() }
    setShowHoverMenu(false)
  }

  async function requestEmailSummary(){
    try {
      const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
      const res = await fetch(`${base}/api/llm/summary/today`, {credentials:'include'})
      if(res.ok) {
        const json = await res.json()
        // Dispatch custom event with summary data for ChatWindow to display
        window.dispatchEvent(new CustomEvent('showEmailSummary', { detail: json.result }))
      }
    } catch(e) {
      console.error('Summary request failed:', e)
    }
    setShowHoverMenu(false)
  }

  async function requestDailyBriefing(){
    try {
      const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
      const res = await fetch(`${base}/api/llm/briefing`, {credentials:'include'})
      if(res.ok) {
        const json = await res.json()
        // Dispatch custom event with briefing data for ChatWindow to display
        window.dispatchEvent(new CustomEvent('showDailyBriefing', { detail: json.result }))
      }
    } catch(e) {
      console.error('Briefing request failed:', e)
    }
    setShowHoverMenu(false)
  }

  function handleMouseEnter(){
    if(hoverTimeout) clearTimeout(hoverTimeout)
    const timeout = setTimeout(() => setShowHoverMenu(true), 800) // Show after 800ms hover
    setHoverTimeout(timeout)
  }

  function handleMouseLeave(){
    if(hoverTimeout) clearTimeout(hoverTimeout)
    const timeout = setTimeout(() => setShowHoverMenu(false), 300) // Hide after 300ms
    setHoverTimeout(timeout)
  }

  function handleMenuHover(){
    if(hoverTimeout) clearTimeout(hoverTimeout) // Keep menu open when hovering over it
  }

  return (
    <div 
      className="widget gmail fade-in widget-container" 
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="widget-content" role="button" tabIndex={0} aria-label="Gmail widget" onClick={openInbox} onKeyDown={(e)=>{ if(e.key==='Enter') openInbox() }}>
        <div className="icon-row">
          <div className="icon-circle"><MdEmail size={22} color="#c026d3"/></div>
          <div>
            <div className="title">Gmail</div>
            <div className="desc">
              {loading ? 'Loading…' : error ? 'Unable to load' : `You have ${counts.total_unread} new mails. ${counts.immediate_action} of them need immediate action`}
            </div>
          </div>
        </div>
      </div>

      {showHoverMenu && (
        <div className="hover-menu" onMouseEnter={handleMenuHover} onMouseLeave={handleMouseLeave}>
          <div className="hover-menu-item" onClick={openInbox}>
            <MdPlaylistAddCheck size={16} />
            <span>Show Action Items</span>
          </div>
          <div className="hover-menu-item" onClick={requestEmailSummary}>
            <MdSummarize size={16} />
            <span>Email Summary</span>
          </div>
          <div className="hover-menu-item" onClick={requestDailyBriefing}>
            <MdToday size={16} />
            <span>Daily Briefing</span>
          </div>
        </div>
      )}
    </div>
  )
}
