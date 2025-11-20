import React, { useState, useRef, useEffect } from 'react'

export default function ChatWindow(){
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [focusedSuggest, setFocusedSuggest] = useState(null) // 'recent' | 'important' | 'brief' | null
  const [currentSessionId, setCurrentSessionId] = useState(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const bodyRef = useRef()

  useEffect(()=>{ if(bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight },[messages])
  
  // Initialize session on component mount
  useEffect(() => {
    initializeSession()
  }, [])
  
  // Initialize or load existing session
  async function initializeSession() {
    try {
      const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
      
      // Create new session for now (in future, could load most recent session)
      const res = await fetch(`${base}/api/chat/sessions`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Chat' })
      })
      
      if (!res.ok) throw new Error('Failed to create session')
      
      const json = await res.json()
      const sessionId = json.session.id
      
      setCurrentSessionId(sessionId)
      
      // Load session messages (includes initial message)
      await loadSessionMessages(sessionId)
      
    } catch (err) {
      console.error('Session initialization failed:', err)
      // Fallback to local-only mode
      setMessages([{id: 1, from: 'ai', text: 'Hi! I\'m your assistant. How can I help today?'}])
    } finally {
      setSessionLoading(false)
    }
  }
  
  // Load messages for a session
  async function loadSessionMessages(sessionId) {
    try {
      const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
      const res = await fetch(`${base}/api/chat/sessions/${sessionId}`, {
        credentials: 'include'
      })
      
      if (!res.ok) throw new Error('Failed to load messages')
      
      const json = await res.json()
      setMessages(json.messages || [])
      
    } catch (err) {
      console.error('Failed to load session messages:', err)
    }
  }
  
  // Save message to database
  async function saveMessage(role, content, type = 'chat_response', metadata = {}) {
    if (!currentSessionId) return null
    
    try {
      const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
      const res = await fetch(`${base}/api/chat/messages`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSessionId,
          role,
          content,
          type,
          metadata,
          contextRelevant: true
        })
      })
      
      if (!res.ok) throw new Error('Failed to save message')
      
      const json = await res.json()
      return json.message
      
    } catch (err) {
      console.error('Failed to save message:', err)
      return null
    }
  }

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
      
      // Process key senders to handle both string arrays and object arrays
      let keySendersText = 'None'
      if (summaryData.key_senders && Array.isArray(summaryData.key_senders)) {
        const senderNames = summaryData.key_senders.map(sender => {
          if (typeof sender === 'string') return sender
          if (typeof sender === 'object' && sender.name) return sender.name
          if (typeof sender === 'object' && sender.email) return sender.email
          if (typeof sender === 'object' && sender.sender) return sender.sender
          return String(sender)
        }).filter(name => name && name !== '[object Object]')
        keySendersText = senderNames.length > 0 ? senderNames.join(', ') : 'None'
      }
      
      // Process themes
      let themesText = 'None'
      if (summaryData.main_themes && Array.isArray(summaryData.main_themes)) {
        themesText = summaryData.main_themes.join(', ')
      }
      
      const summary = `📧 **Email Summary**
• Total emails: ${summaryData.total_count || 0}
• Urgent items: ${summaryData.urgent_count || 0}
• Key senders: ${keySendersText}
• Main themes: ${themesText}

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

  async function send(){
    if(!text.trim() || !currentSessionId) return
    const userMsg = {id:Date.now(),from:'user',text}
    const userText = text
    setMessages(m=>[...m,userMsg])
    setText('')
    
    // Save user message to database
    await saveMessage('user', userText, 'chat_response')
    
    try {
      // Show typing indicator
      const typingId = Date.now() + 1
      setMessages(m=>[...m,{id:typingId,from:'ai',text:'...', typing: true}])
      
      const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
      const res = await fetch(`${base}/api/llm/intelligent`, {
        method: 'POST',
        credentials: 'include',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ 
          message: userText,
          sessionId: currentSessionId
        })
      })
      
      // Remove typing indicator
      setMessages(m => m.filter(msg => msg.id !== typingId))
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      
      const json = await res.json()
      console.log('Server response:', json) // Debug log
      
      // Extract the actual text response from the nested object structure
      let aiResponse = "I'm sorry, I couldn't process that request."
      let detectedType = null
      let summaryData = null
      
      if (json.response) {
        if (typeof json.response === 'string') {
          aiResponse = json.response
        } else if (json.response.type) {
          // Handle structured response object with type
          detectedType = json.response.type || json.detectedType
          
          if (detectedType === 'email_summary') {
            // For email summaries, the structured data IS the response object itself
            summaryData = json.response
            aiResponse = json.response.summary_text || "Email summary processed"
          } else if (detectedType === 'chat_response') {
            aiResponse = json.response.response || json.response.text || "Response received"
          } else if (detectedType === 'daily_briefing') {
            summaryData = json.response
            aiResponse = json.response.response || json.response.summary || "Daily briefing processed"
          } else {
            aiResponse = json.response.response || json.response.text || JSON.stringify(json.response)
          }
        } else if (json.response.response) {
          // Handle nested response object {type, response, timestamp}
          aiResponse = json.response.response
          detectedType = json.response.type || json.detectedType
          
          // Check if this is an email summary response with structured data
          if (detectedType === 'email_summary' && json.response.data) {
            summaryData = json.response.data
          }
        } else if (json.response.type === 'chat_response' && json.response.response) {
          aiResponse = json.response.response
          detectedType = json.response.type
        }
      }
      
      // Fallback to detectedType from top level
      if (!detectedType) {
        detectedType = json.detectedType
      }
      
      // Format email summaries specially
      if (detectedType === 'email_summary' && summaryData) {
        // Process key senders to handle both string arrays and object arrays
        let keySendersText = 'None'
        if (summaryData.key_senders && Array.isArray(summaryData.key_senders)) {
          const senderNames = summaryData.key_senders.map(sender => {
            if (typeof sender === 'string') return sender
            if (typeof sender === 'object' && sender.name) return sender.name
            if (typeof sender === 'object' && sender.email) return sender.email
            if (typeof sender === 'object' && sender.sender) return sender.sender
            return String(sender)
          }).filter(name => name && name !== '[object Object]')
          keySendersText = senderNames.length > 0 ? senderNames.join(', ') : 'None'
        }
        
        // Process themes
        let themesText = 'None'
        if (summaryData.main_themes && Array.isArray(summaryData.main_themes)) {
          themesText = summaryData.main_themes.join(', ')
        }
        
        // Format priority emails
        let priorityText = ''
        if (summaryData.priority_emails && summaryData.priority_emails.length > 0) {
          priorityText = '\n\n🎯 **Priority Emails:**\n' + 
            summaryData.priority_emails.map((email, idx) => 
              `${idx + 1}. "${email.subject}" - ${email.reason}`
            ).join('\n')
        }
        
        // Format recommendations
        let recommendationsText = ''
        if (summaryData.recommendations && summaryData.recommendations.length > 0) {
          recommendationsText = '\n\n💡 **Recommendations:**\n' + 
            summaryData.recommendations.map(rec => `• ${rec}`).join('\n')
        }
        
        // Format time estimate
        let timeText = ''
        if (summaryData.time_estimate) {
          timeText = `\n\n⏰ **Estimated time needed:** ${summaryData.time_estimate}`
        }
        
        aiResponse = `📧 **Email Summary for ${summaryData.timeframe || 'today'}**
• Total emails: ${summaryData.total_count || 0}
• Unread: ${summaryData.unread_count || 0} | Urgent: ${summaryData.urgent_count || 0}
• Key senders: ${keySendersText}
• Main themes: ${themesText}

${summaryData.summary_text || aiResponse}${priorityText}${recommendationsText}${timeText}`
      } else if (detectedType === 'daily_briefing' && json.response.data) {
        // Format daily briefing specially
        const briefingData = json.response.data
        let briefingText = json.response.response || ''
        
        if (briefingData.priority_items && briefingData.priority_items.length > 0) {
          briefingText += '\n\n🎯 **Top Priorities:**\n' + 
            briefingData.priority_items.map((item, idx) => `${idx + 1}. ${item}`).join('\n')
        }
        
        if (briefingData.email_overview) {
          briefingText += '\n\n📧 **Emails:** ' + briefingData.email_overview
        }
        
        if (briefingData.calendar_overview) {
          briefingText += '\n\n📅 **Calendar:** ' + briefingData.calendar_overview
        }
        
        aiResponse = briefingText
      } else if (detectedType && detectedType !== 'chat_response') {
        // Add detected type info for debugging (optional)
        aiResponse = `🤖 *Detected: ${detectedType.replace('_', ' ')}*\n\n${aiResponse}`
      }
      
      // Add AI response with slight delay for natural feel
      setTimeout(async ()=>{
        setMessages(m=>[...m,{
          id:Date.now(),
          from:'ai',
          text:aiResponse,
          type: detectedType || 'chat_response',
          data: summaryData
        }])
        
        // Save AI response to database
        await saveMessage('assistant', aiResponse, detectedType || 'chat_response', summaryData || {})
      }, 400)
      
    } catch(e) {
      console.error('Chat error:', e)
      // Remove typing indicator and show error
      setMessages(m => m.filter(msg => !msg.typing))
      setTimeout(async ()=>{
        const errorMsg = `Sorry, I encountered an error: ${e.message}. You can still use the suggestion buttons below for email management.`
        setMessages(m=>[...m,{id:Date.now(),from:'ai',text:errorMsg}])
        
        // Save error message to database
        await saveMessage('assistant', errorMsg, 'error_response', { error: e.message })
      }, 400)
    }
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
          {sessionLoading ? (
            <div className="message ai" style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
              <div>🔄 Initializing chat session...</div>
            </div>
          ) : (
            messages.map(m=> (
            <div key={m.id} className={`message ${m.from}`} aria-live="polite">
              <div style={{
                whiteSpace:'pre-wrap',
                background: m.type === 'email_summary' ? 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' : 'transparent',
                padding: m.type === 'email_summary' ? '12px' : '0',
                borderRadius: m.type === 'email_summary' ? '8px' : '0',
                border: m.type === 'email_summary' ? '1px solid rgba(0,0,0,0.05)' : 'none',
                fontSize: m.typing ? '14px' : '15px',
                color: m.typing ? '#666' : 'inherit'
              }}>
                {m.typing ? '💭 Thinking...' : m.text}
              </div>

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
            ))
          )}
        </div>
        <div className="chat-input">
          <textarea 
            className="input-box" 
            rows={1} 
            value={text} 
            onChange={e=>setText(e.target.value)} 
            onKeyDown={handleKey} 
            placeholder={sessionLoading ? "Setting up chat..." : "Type a message... (Enter to send)"} 
            disabled={sessionLoading}
          />
          <button 
            className="send-btn" 
            onClick={send} 
            aria-label="Send message"
            disabled={sessionLoading || !text.trim()}
          >
            Send
          </button>
        </div>

        {/* suggestions bar below input */}
        <div style={{padding:'10px',borderTop:'1px solid rgba(0,0,0,0.04)', display:'flex', gap:8, alignItems:'center', justifyContent:'center', flexWrap:'wrap'}} aria-hidden="false">
          <button
            onClick={loadPendingMessages}
            onFocus={()=>setFocusedSuggest('recent')}
            onBlur={()=>setFocusedSuggest(null)}
            onKeyDown={(e)=>{ if(e.key==='Enter' || e.key===' ') { e.preventDefault(); loadPendingMessages() } }}
            aria-label="Recent unread mails (Alt+1)"
            aria-keyshortcuts="Alt+1"
            title="Recent unread mails — Alt+1"
            style={{padding:'8px 12px', borderRadius:20, border:'1px solid rgba(0,0,0,0.06)', background:'#fff', outline: focusedSuggest==='recent' ? '3px solid rgba(21,156,228,0.25)' : 'none', fontSize:'12px'}}
          >📬 recent mails</button>

          <button
            onClick={loadImportantMessages}
            onFocus={()=>setFocusedSuggest('important')}
            onBlur={()=>setFocusedSuggest(null)}
            onKeyDown={(e)=>{ if(e.key==='Enter' || e.key===' ') { e.preventDefault(); loadImportantMessages() } }}
            aria-label="Important messages (Alt+2)"
            aria-keyshortcuts="Alt+2"
            title="Important messages — Alt+2"
            style={{padding:'8px 12px', borderRadius:20, border:'1px solid rgba(0,0,0,0.06)', background:'#fff', outline: focusedSuggest==='important' ? '3px solid rgba(21,156,228,0.25)' : 'none', fontSize:'12px'}}
          >⚡ important</button>

          <button
            onClick={briefMe}
            onFocus={()=>setFocusedSuggest('brief')}
            onBlur={()=>setFocusedSuggest(null)}
            onKeyDown={(e)=>{ if(e.key==='Enter' || e.key===' ') { e.preventDefault(); briefMe() } }}
            aria-label="Brief me (Alt+3)"
            aria-keyshortcuts="Alt+3"
            title="Brief me — Alt+3"
            style={{padding:'8px 12px', borderRadius:20, border:'1px solid rgba(0,0,0,0.06)', background:'#fff', outline: focusedSuggest==='brief' ? '3px solid rgba(21,156,228,0.25)' : 'none', fontSize:'12px'}}
          >📋 brief me</button>

          <button
            onClick={() => {
              setText('summarize my emails from today')
              setTimeout(() => send(), 100)
            }}
            style={{padding:'8px 12px', borderRadius:20, border:'1px solid rgba(0,0,0,0.06)', background:'#fff', fontSize:'12px'}}
            title="Get an AI-powered email summary"
          >📧 email summary</button>

          <button
            onClick={() => {
              setText('give me a daily briefing')
              setTimeout(() => send(), 100)
            }}
            style={{padding:'8px 12px', borderRadius:20, border:'1px solid rgba(0,0,0,0.06)', background:'#fff', fontSize:'12px'}}
            title="Get your daily briefing with priorities"
          >🌅 daily briefing</button>
        </div>
      </div>
    </main>
  )
}
