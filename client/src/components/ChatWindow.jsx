import React, { useState, useRef, useEffect } from 'react'

export default function ChatWindow(){
  const [messages, setMessages] = useState([
    {id:1,from:'ai',text:'Hi! I\'m your assistant. How can I help today?'}
  ])
  const [text, setText] = useState('')
  const [focusedSuggest, setFocusedSuggest] = useState(null) // 'recent' | 'important' | 'brief' | null
  const bodyRef = useRef()

  useEffect(()=>{ if(bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight },[messages])

  // helper to load pending messages and stream them into the chat
  async function loadPendingMessages(){
    try{
      const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
      const res = await fetch(`${base}/api/messages/pending`, {credentials:'include'})
      if(!res.ok) return
      const json = await res.json()
      const items = json.items || []
      if(items.length===0){
        setMessages(m=>[...m,{id:Date.now(), from:'ai', text:'No pending messages needing action.'}])
        return
      }
      for(const it of items.reverse()){
        const summary = `From: ${it.sender} • ${it.subject}`
        await new Promise(r=>setTimeout(r, 500))
        setMessages(m=>[...m,{id:Date.now()+Math.random(), from:'ai', text:summary, messageData: it}])
      }
    }catch(e){
      setMessages(m=>[...m,{id:Date.now(), from:'ai', text:'Failed to load pending messages.'}])
    }
  }

  useEffect(()=>{
    // Event listeners for widget interactions
    window.addEventListener('showPendingMessages', loadPendingMessages)
    window.addEventListener('showEmailSummary', handleEmailSummary)
    window.addEventListener('showDailyBriefing', handleDailyBriefing)
    
    return ()=> {
      window.removeEventListener('showPendingMessages', loadPendingMessages)
      window.removeEventListener('showEmailSummary', handleEmailSummary)
      window.removeEventListener('showDailyBriefing', handleDailyBriefing)
    }
  },[])

  // helper to load "important" messages (heuristic filter)
  async function loadImportantMessages(){
    try{
      const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
      const res = await fetch(`${base}/api/messages/pending`, {credentials:'include'})
      if(!res.ok) return
      const json = await res.json()
      const items = json.items || []
      const important = items.filter(it=>{
        const s = (it.subject||'').toLowerCase()
        const snip = (it.snippet||'').toLowerCase()
        return s.includes('important') || s.includes('urgent') || snip.includes('important') || snip.includes('urgent')
      })
      const toShow = important.length>0 ? important : items.slice(0,3)
      if(toShow.length===0){
        setMessages(m=>[...m,{id:Date.now(), from:'ai', text:'No messages identified as important.'}])
        return
      }
      setMessages(m=>[...m,{id:Date.now(), from:'ai', text:'Here are some messages I consider important:'}])
      for(const it of toShow.reverse()){
        const summary = `From: ${it.sender} • ${it.subject}`
        await new Promise(r=>setTimeout(r, 400))
        setMessages(m=>[...m,{id:Date.now()+Math.random(), from:'ai', text:summary, messageData: it}])
      }
    }catch(e){
      setMessages(m=>[...m,{id:Date.now(), from:'ai', text:'Failed to load important messages.'}])
    }
  }

  // brief me: summarise counts from pending endpoint
  async function briefMe(){
    try{
      const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
      const res = await fetch(`${base}/api/messages/pending`, {credentials:'include'})
      if(!res.ok) return
      const json = await res.json()
      const totalUnread = json.total_unread || 0
      const totalAction = json.total_action_required || 0
      const textSummary = `You have ${totalUnread} unread messages; ${totalAction} need action. Would you like me to surface them?`
      setMessages(m=>[...m,{id:Date.now(), from:'ai', text: textSummary}])
    }catch(e){
      setMessages(m=>[...m,{id:Date.now(), from:'ai', text:'Failed to generate a brief.'}])
    }
  }

  // Handle email summary from hover menu
  async function handleEmailSummary(event){
    const summaryData = event.detail
    if(!summaryData) return
    
    try {
      setMessages(m=>[...m,{id:Date.now(), from:'ai', text:'Here\'s your email summary for today:'}])
      await new Promise(r=>setTimeout(r, 400))
      
      const summary = `📧 **Email Summary**
• Total emails: ${summaryData.total_count || 0}
• Urgent items: ${summaryData.urgent_count || 0}
• Key senders: ${summaryData.key_senders ? summaryData.key_senders.join(', ') : 'None'}
• Main themes: ${summaryData.main_themes ? summaryData.main_themes.join(', ') : 'None'}

${summaryData.summary_text || 'No additional insights available.'}`

      setMessages(m=>[...m,{id:Date.now(), from:'ai', text:summary, type:'email_summary', data:summaryData}])
    } catch(e) {
      setMessages(m=>[...m,{id:Date.now(), from:'ai', text:'Failed to load email summary.'}])
    }
  }

  // Handle daily briefing from hover menu  
  async function handleDailyBriefing(event){
    const briefingData = event.detail
    if(!briefingData) return
    
    try {
      setMessages(m=>[...m,{id:Date.now(), from:'ai', text:briefingData.greeting || 'Good morning! Here\'s your daily briefing:'}])
      await new Promise(r=>setTimeout(r, 500))
      
      // Priority items
      if(briefingData.priority_items && briefingData.priority_items.length > 0){
        setMessages(m=>[...m,{id:Date.now(), from:'ai', text:'🎯 **Top Priorities:**\n' + briefingData.priority_items.map((item, idx) => `${idx+1}. ${item}`).join('\n')}])
        await new Promise(r=>setTimeout(r, 400))
      }
      
      // Email overview
      if(briefingData.email_overview){
        setMessages(m=>[...m,{id:Date.now(), from:'ai', text:'📧 **Emails:** ' + briefingData.email_overview}])
        await new Promise(r=>setTimeout(r, 400))
      }
      
      // Calendar overview  
      if(briefingData.calendar_overview){
        setMessages(m=>[...m,{id:Date.now(), from:'ai', text:'📅 **Calendar:** ' + briefingData.calendar_overview}])
        await new Promise(r=>setTimeout(r, 400))
      }
      
      // Recommendations
      if(briefingData.recommendations && briefingData.recommendations.length > 0){
        setMessages(m=>[...m,{id:Date.now(), from:'ai', text:'💡 **Recommendations:**\n' + briefingData.recommendations.map(rec => `• ${rec}`).join('\n')}])
      }
      
    } catch(e) {
      setMessages(m=>[...m,{id:Date.now(), from:'ai', text:'Failed to load daily briefing.'}])
    }
  }

  // keyboard shortcuts: Alt+1 = recent, Alt+2 = important, Alt+3 = brief
  useEffect(()=>{
    function onKey(e){
      // ignore when typing in input or textarea
      const ae = document.activeElement
      if(ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return
      // require Alt (Option) or Ctrl for accessibility, support metaKey for mac users optionally
      const mod = e.altKey || e.ctrlKey || e.metaKey
      if(!mod) return
      if(e.key === '1'){
        e.preventDefault()
        loadPendingMessages()
      } else if(e.key === '2'){
        e.preventDefault()
        loadImportantMessages()
      } else if(e.key === '3'){
        e.preventDefault()
        briefMe()
      }
    }
    window.addEventListener('keydown', onKey)
    return ()=> window.removeEventListener('keydown', onKey)
  },[])

  // performAction: execute immediately for simple actions; for complex actions we'll call prepare first
  async function performAction(messageId, actionType, payload){
    try{
      const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''

      // immediate actions
      if(actionType === 'mark_read' || actionType === 'delete'){
        const res = await fetch(`${base}/api/messages/${messageId}/action`, {method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({actionType, payload})})
        if(!res.ok) throw new Error('action_failed')
        const j = await res.json()
        setMessages(m=>[...m,{id:Date.now(), from:'ai', text:`Action ${actionType} executed.`}])
        return j
      }

      // for other actions (create_event, create_task, reply, forward) first ask server to prepare using LLM
      setMessages(m=>[...m,{id:Date.now(), from:'ai', text:'Okay, let me draft some suggestions...'}])
      const prepRes = await fetch(`${base}/api/messages/${messageId}/prepare`, {method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({actionType, payload})})
      if(!prepRes.ok) throw new Error('prepare_failed')
      const prepJson = await prepRes.json()
      const actions = prepJson.actions || []

      if(actions.length===0){
        setMessages(m=>[...m,{id:Date.now(), from:'ai', text:'I could not generate suggestions.'}])
        return {actions: []}
      }

      // display suggested actions and present Confirm buttons
      const assistantId = Date.now()+Math.random()
      setMessages(m=>[...m,{id:assistantId, from:'ai', text:'Here are suggested options:'}])
      for(const act of actions){
        setMessages(m=>[...m,{id:Date.now()+Math.random(), from:'ai', text: `${act.type}: ${act.title || act.summary || JSON.stringify(act.payload || act)}`, suggestedAction: act, messageId}])
      }

      // Append a small UI message with Confirm buttons by adding a message that contains all actions (rendered below)
      setMessages(m=>[...m,{id:Date.now(), from:'ai', text:'Choose an option to confirm.', suggestedBatch: {messageId, actions}}])

      return {actions}
    }catch(e){
      setMessages(m=>[...m,{id:Date.now(), from:'ai', text:`Action failed: ${e.message || e}`}])
      throw e
    }
  }

  // helper to confirm and execute a suggested action returned from prepare
  async function confirmSuggestedAction(messageId, action){
    try{
      const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
      const res = await fetch(`${base}/api/messages/${messageId}/action`, {method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({actionType: action.type, payload: action.payload || action})})
      if(!res.ok) throw new Error('execute_failed')
      const j = await res.json()
      setMessages(m=>[...m,{id:Date.now(), from:'ai', text:`Executed ${action.type}` }])
      return j
    }catch(e){
      setMessages(m=>[...m,{id:Date.now(), from:'ai', text:`Execution failed: ${e.message || e}` }])
      throw e
    }
  }

  function send(){
    if(!text.trim()) return
    const userMsg = {id:Date.now(),from:'user',text}
    setMessages(m=>[...m,userMsg])
    setText('')
    // simple simulated AI response
    setTimeout(()=>{
      setMessages(m=>[...m,{id:Date.now()+1,from:'ai',text:`I heard you: "${text}" — I can summarize, draft emails, or check your calendar.`}])
    },800)
  }

  function handleKey(e){ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); send() }}

  return (
    <main className="chat-root">
      <div className="chat-card" role="region" aria-label="AI chat window">
        <div className="chat-header">
          <div className="brand">One App Club <span className="small">assistant</span></div>
          <div className="small">Minimal • Fast • Thoughtful</div>
        </div>
        <div className="chat-body" ref={bodyRef}>
          {messages.map(m=> (
            <div key={m.id} className={`message ${m.from}`} aria-live="polite">
              <div style={{whiteSpace:'pre-wrap'}}>{m.text}</div>

              {/* render single suggested action buttons attached to a message */}
              {m.suggestedAction && (
                <div style={{marginTop:8,display:'flex',gap:8}}>
                  <button onClick={()=>confirmSuggestedAction(m.messageId || m.suggestedAction.messageId, m.suggestedAction)} style={{padding:'6px 8px',borderRadius:8,border:'1px solid rgba(0,0,0,0.06)'}}>Confirm {m.suggestedAction.type}</button>
                </div>
              )}

              {/* render batch suggested actions (from prepare) */}
              {m.suggestedBatch && Array.isArray(m.suggestedBatch.actions) && (
                <div style={{marginTop:8,display:'flex',flexDirection:'column',gap:8}}>
                  {m.suggestedBatch.actions.map((act, idx)=> (
                    <div key={idx} style={{display:'flex',gap:8,alignItems:'center'}}>
                      <div style={{flex:1}}>{act.type} — {act.title || act.summary || (act.payload && (act.payload.title || act.payload.summary))}</div>
                      <button onClick={()=>confirmSuggestedAction(m.suggestedBatch.messageId, act)} style={{padding:'6px 8px',borderRadius:8,border:'1px solid rgba(0,0,0,0.06)'}}>Confirm</button>
                    </div>
                  ))}
                </div>
              )}

              {/* legacy support: inline suggested actions stored on messageData (from pending list) */}
              {m.messageData && m.messageData.suggested && m.messageData.suggested.length>0 && (
                <div style={{marginTop:8,display:'flex',gap:8}}>
                  {m.messageData.suggested.map((act,idx)=> (
                    <button key={idx} onClick={()=>{
                      // if simple, execute directly; otherwise run prepare flow
                      if(act.type === 'mark_read' || act.type === 'delete'){
                        performAction(m.messageData.id, act.type, act)
                      } else {
                        performAction(m.messageData.id, act.type, act)
                      }
                    }} style={{padding:'6px 8px',borderRadius:8,border:'1px solid rgba(0,0,0,0.06)'}}>{act.type}</button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="chat-input">
          <textarea className="input-box" rows={1} value={text} onChange={e=>setText(e.target.value)} onKeyDown={handleKey} placeholder="Type a message... (Enter to send)" />
          <button className="send-btn" onClick={send} aria-label="Send message">Send</button>
        </div>

        {/* suggestions bar below input */}
        <div style={{padding:'10px',borderTop:'1px solid rgba(0,0,0,0.04)', display:'flex', gap:8, alignItems:'center', justifyContent:'center'}} aria-hidden="false">
          <button
            onClick={loadPendingMessages}
            onFocus={()=>setFocusedSuggest('recent')}
            onBlur={()=>setFocusedSuggest(null)}
            onKeyDown={(e)=>{ if(e.key==='Enter' || e.key===' ') { e.preventDefault(); loadPendingMessages() } }}
            aria-label="Recent unread mails (Alt+1)"
            aria-keyshortcuts="Alt+1"
            title="Recent unread mails — Alt+1"
            style={{padding:'8px 12px', borderRadius:20, border:'1px solid rgba(0,0,0,0.06)', background:'#fff', outline: focusedSuggest==='recent' ? '3px solid rgba(21,156,228,0.25)' : 'none'}}
          >recent unread mails</button>

          <button
            onClick={loadImportantMessages}
            onFocus={()=>setFocusedSuggest('important')}
            onBlur={()=>setFocusedSuggest(null)}
            onKeyDown={(e)=>{ if(e.key==='Enter' || e.key===' ') { e.preventDefault(); loadImportantMessages() } }}
            aria-label="Important messages (Alt+2)"
            aria-keyshortcuts="Alt+2"
            title="Important messages — Alt+2"
            style={{padding:'8px 12px', borderRadius:20, border:'1px solid rgba(0,0,0,0.06)', background:'#fff', outline: focusedSuggest==='important' ? '3px solid rgba(21,156,228,0.25)' : 'none'}}
          >important messages</button>

          <button
            onClick={briefMe}
            onFocus={()=>setFocusedSuggest('brief')}
            onBlur={()=>setFocusedSuggest(null)}
            onKeyDown={(e)=>{ if(e.key==='Enter' || e.key===' ') { e.preventDefault(); briefMe() } }}
            aria-label="Brief me (Alt+3)"
            aria-keyshortcuts="Alt+3"
            title="Brief me — Alt+3"
            style={{padding:'8px 12px', borderRadius:20, border:'1px solid rgba(0,0,0,0.06)', background:'#fff', outline: focusedSuggest==='brief' ? '3px solid rgba(21,156,228,0.25)' : 'none'}}
          >brief me</button>
        </div>
      </div>
    </main>
  )
}
