import React, { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { useNavigate } from 'react-router-dom'
import { monitorOAuthPopup, openOAuthPopup } from '../utils/oauth'
import EmailTemplateModal from './EmailTemplateModal'
import SnoozeModal from './SnoozeModal'
import EnhancedSearchBar from './EnhancedSearchBar'
import EmailSchedulingModal from './EmailSchedulingModal'
import SmartNotificationPanel from './SmartNotificationPanel'
import EmailAnalyticsDashboard from './EmailAnalyticsDashboard'

export default function ChatWindow(){
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [focusedSuggest, setFocusedSuggest] = useState(null) // 'unread' | 'important' | 'brief' | null
  const [currentSessionId, setCurrentSessionId] = useState(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  
  // Phase 1 feature states
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [showSnoozeModal, setShowSnoozeModal] = useState(false)
  const [selectedMessageForAction, setSelectedMessageForAction] = useState(null)
  const [showSearchBar, setShowSearchBar] = useState(false)
  const [searchResults, setSearchResults] = useState([])
  
  // Phase 2 feature states
  const [showSchedulingModal, setShowSchedulingModal] = useState(false)
  const [showNotificationPanel, setShowNotificationPanel] = useState(false)
  const [showAnalyticsDashboard, setShowAnalyticsDashboard] = useState(false)
  const [notificationCount, setNotificationCount] = useState(0)
  
  const bodyRef = useRef()
  const navigate = useNavigate()

  useEffect(()=>{ if(bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight },[messages])
  
  // Check for auth-related URL parameters on component mount
  useEffect(() => {
    // Don't create session yet - wait for user's first message
    setSessionLoading(false)
    
    // Show initial welcome message
    setMessages([{id: 1, from: 'ai', text: 'Hi! I\'m your assistant. How can I help today?'}])
    
    // Check for auth-related URL parameters
    const urlParams = new URLSearchParams(window.location.search)
    
    if (urlParams.get('reauth') === 'success') {
      setTimeout(() => {
        setMessages(m=>[...m,{
          id:Date.now(), 
          from:'ai', 
          text:'✅ **Permissions Updated Successfully!**\n\nYour Google permissions have been refreshed. You can now use all email management features including:\n• Mark emails as read\n• Delete emails\n• Send replies\n• Create calendar meetings\n• Create tasks\n\nTry using the email action buttons again!'
        }])
        
        // Trigger permission check update for notification panel
        window.dispatchEvent(new CustomEvent('permissionsUpdated'))
      }, 1000)
      
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname)
    }
    
    if (urlParams.get('signup') === 'success') {
      setTimeout(() => {
        setMessages(m=>[...m,{
          id:Date.now(), 
          from:'ai', 
          text:'🎉 **Welcome to One App Club!**\n\nYour account has been created successfully with full permissions! You can now:\n\n• **Manage emails** - Mark as read, delete, draft AI-powered replies\n• **Schedule meetings** - Create calendar events with email senders\n• **Create tasks** - Turn emails into actionable items\n• **Get summaries** - AI-powered email insights and daily briefings\n\nTry clicking "📬 all unread" below to get started!'
        }])
      }, 1000)
      
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname)
    }
    
    if (urlParams.get('signup') === 'incomplete_permissions') {
      setTimeout(() => {
        setMessages(m=>[...m,{
          id:Date.now(), 
          from:'ai', 
          text:'⚠️ **Setup Incomplete**\n\nYour account was created, but some Google permissions are missing. This means some features won\'t work properly.\n\n**Missing features may include:**\n• Email management (mark as read, delete)\n• Sending replies\n• Creating calendar meetings\n• Creating tasks\n\nWould you like to complete the setup now?',
          needsReauth: true,
          reauthUrl: '/api/auth/onboard',
          actionType: 'complete_setup',
          requiredPermission: 'all Google services'
        }])
      }, 1000)
      
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname)
    }
    
    if (urlParams.get('onboard') === 'success') {
      setTimeout(() => {
        setMessages(m=>[...m,{
          id:Date.now(), 
          from:'ai', 
          text:'🎉 **Setup Complete!**\n\nAll Google permissions have been granted successfully. You now have access to all One App Club features!\n\nTry using the email management tools below to get started.'
        }])
        
        // Trigger permission check update for notification panel
        window.dispatchEvent(new CustomEvent('permissionsUpdated'))
      }, 1000)
      
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname)
    }
    
    if (urlParams.get('onboard') === 'incomplete') {
      setTimeout(() => {
        setMessages(m=>[...m,{
          id:Date.now(), 
          from:'ai', 
          text:'❌ **Setup Still Incomplete**\n\nSome required permissions are still missing. Please ensure you grant access to:\n• Gmail (read, send, modify)\n• Google Calendar\n• Google Tasks\n\nTry the setup process again or contact support if you continue to have issues.',
          needsReauth: true,
          reauthUrl: '/api/auth/onboard',
          actionType: 'retry_setup',
          requiredPermission: 'all Google services'
        }])
      }, 1000)
      
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [])
  
  // Initialize session when user sends first message
  async function initializeSession() {
    if (currentSessionId) return currentSessionId // Already initialized
    
    try {
      const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
      
      // Create new session
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
      return sessionId
      
    } catch (err) {
      console.error('Session initialization failed:', err)
      // Return null to indicate local-only mode
      return null
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

  // helper to load pending messages and stream them into the chat with enhanced action buttons
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
      
      setMessages(m=>[...m,{id:Date.now(), from:'ai', text:`Found ${items.length} unread messages. Here they are with action options:`}])
      
      for(const it of items.reverse()){
        const snippet = it.snippet ? ` - ${it.snippet.substring(0, 100)}${it.snippet.length > 100 ? '...' : ''}` : ''
        const summary = `📧 **From:** ${it.sender}\n**Subject:** ${it.subject}${snippet}`
        await new Promise(r=>setTimeout(r, 500))
        setMessages(m=>[...m,{
          id:Date.now()+Math.random(), 
          from:'ai', 
          text:summary, 
          messageData: it,
          showActions: true
        }])
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

  // helper to load all unread emails with full action buttons
  async function loadAllUnreadEmails(){
    try{
      const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
      const res = await fetch(`${base}/api/messages/unread`, {credentials:'include'})
      if(!res.ok) {
        console.error('Failed to fetch unread messages:', res.status, res.statusText)
        setMessages(m=>[...m,{id:Date.now(), from:'ai', text:'❌ Failed to load unread messages. Please check your connection.'}])
        return
      }
      const json = await res.json()
      const items = json.items || []
      const totalUnread = json.total_unread || 0
      
      if(items.length === 0 && totalUnread === 0){
        setMessages(m=>[...m,{id:Date.now(), from:'ai', text:'📬 No unread messages found. Your inbox is clean!'}])
        return
      } else if(items.length === 0 && totalUnread > 0) {
        setMessages(m=>[...m,{id:Date.now(), from:'ai', text:`📬 You have ${totalUnread} unread messages, but they haven't been processed yet. Try running the Gmail polling job or check back in a few minutes.`}])
        return
      }
      
      setMessages(m=>[...m,{id:Date.now(), from:'ai', text:`📬 **All Unread Emails** (${items.length} of ${totalUnread} total)\n\nHere are your unread messages with action options:`}])
      
      for(const it of items.reverse()){
        const snippet = it.snippet ? ` - ${it.snippet.substring(0, 120)}${it.snippet.length > 120 ? '...' : ''}` : ''
        const timeAgo = it.received_at ? new Date(it.received_at).toLocaleString() : ''
        const summary = `📧 **From:** ${it.sender}\n**Subject:** ${it.subject}\n**Time:** ${timeAgo}${snippet}`
        await new Promise(r=>setTimeout(r, 300))
        setMessages(m=>[...m,{
          id:Date.now()+Math.random(), 
          from:'ai', 
          text:summary, 
          messageData: it,
          showActions: true
        }])
      }
    }catch(e){
      console.error('Error loading unread messages:', e)
      setMessages(m=>[...m,{id:Date.now(), from:'ai', text:'Failed to load unread messages. Please try again.'}])
    }
  }

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
        const snippet = it.snippet ? ` - ${it.snippet.substring(0, 100)}${it.snippet.length > 100 ? '...' : ''}` : ''
        const summary = `📧 **From:** ${it.sender}\n**Subject:** ${it.subject}${snippet}`
        await new Promise(r=>setTimeout(r, 400))
        setMessages(m=>[...m,{id:Date.now()+Math.random(), from:'ai', text:summary, messageData: it, showActions: true}])
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

  // keyboard shortcuts: Alt+1 = all unread, Alt+2 = important, Alt+3 = brief, Alt+4 = recent pending
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
        loadAllUnreadEmails()
      } else if(e.key === '2'){
        e.preventDefault()
        loadImportantMessages()
      } else if(e.key === '3'){
        e.preventDefault()
        briefMe()
      } else if(e.key === '4'){
        e.preventDefault()
        loadPendingMessages()
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
        
        if(!res.ok) {
          if(res.status === 403) {
            const errorData = await res.json()
            if(errorData.error === 'insufficient_permissions') {
              setMessages(m=>[...m,{
                id:Date.now(), 
                from:'ai', 
                text:`🔐 **Permission Required**\n\n${errorData.message}\n\nTo enable this action, you need to grant additional Google permissions.`,
                needsReauth: true,
                reauthUrl: errorData.reauthUrl,
                actionType: errorData.actionType,
                requiredPermission: errorData.requiredPermission
              }])
              return {error: 'insufficient_permissions'}
            }
          }
          throw new Error('action_failed')
        }
        
        const j = await res.json()
        setMessages(m=>[...m,{id:Date.now(), from:'ai', text:`✅ ${actionType === 'mark_read' ? 'Marked as read' : 'Deleted'} successfully.`}])
        return j
      }

      // for other actions (create_event, create_task, reply, forward, draft_reply, create_meeting) first ask server to prepare using LLM
      if(actionType === 'draft_reply'){
        setMessages(m=>[...m,{id:Date.now(), from:'ai', text:'🤖 Analyzing the email and drafting a reply...'}])
      } else if(actionType === 'create_meeting'){
        setMessages(m=>[...m,{id:Date.now(), from:'ai', text:'📅 Preparing meeting details...'}])
      } else {
        setMessages(m=>[...m,{id:Date.now(), from:'ai', text:'Okay, let me draft some suggestions...'}])
      }
      
      const prepRes = await fetch(`${base}/api/messages/${messageId}/prepare`, {method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({actionType, payload})})
      
      if(!prepRes.ok) {
        if(prepRes.status === 403) {
          const errorData = await prepRes.json()
          if(errorData.error === 'insufficient_permissions') {
            setMessages(m=>[...m,{
              id:Date.now(), 
              from:'ai', 
              text:`🔐 **Permission Required**\n\n${errorData.message}\n\nTo enable this action, you need to grant additional Google permissions.`,
              needsReauth: true,
              reauthUrl: errorData.reauthUrl,
              actionType: errorData.actionType,
              requiredPermission: errorData.requiredPermission
            }])
            return {error: 'insufficient_permissions'}
          }
        }
        throw new Error('prepare_failed')
      }
      
      const prepJson = await prepRes.json()
      const actions = prepJson.actions || []

      if(actions.length===0){
        if(actionType === 'create_meeting'){
          setMessages(m=>[...m,{id:Date.now(), from:'ai', text:'I need more information to schedule a meeting. Please provide:\n• Preferred date and time\n• Meeting duration\n• Any specific agenda items\n\nType your response in the chat below.', needsInput: true, actionType: 'create_meeting', messageId}])
        } else {
          setMessages(m=>[...m,{id:Date.now(), from:'ai', text:'I could not generate suggestions.'}])
        }
        return {actions: []}
      }

      // display suggested actions and present Confirm buttons
      if(actionType === 'draft_reply'){
        setMessages(m=>[...m,{id:Date.now(), from:'ai', text:'📝 **Draft Reply Generated:**'}])
      } else {
        setMessages(m=>[...m,{id:Date.now(), from:'ai', text:'Here are suggested options:'}])
      }
      
      for(const act of actions){
        let displayText = `${act.type}: ${act.title || act.summary || ''}`
        if(act.payload && act.payload.body && actionType === 'draft_reply'){
          displayText = `**To:** ${act.payload.to || 'sender'}\n**Subject:** ${act.payload.subject || 'Re: Original Subject'}\n\n${act.payload.body}`
        }
        setMessages(m=>[...m,{id:Date.now()+Math.random(), from:'ai', text: displayText, suggestedAction: act, messageId}])
      }

      // Append a small UI message with Confirm buttons by adding a message that contains all actions (rendered below)
      const confirmText = actionType === 'draft_reply' ? 'Send this reply?' : 
                         actionType === 'create_meeting' ? 'Create this meeting?' : 
                         'Choose an option to confirm.'
      setMessages(m=>[...m,{id:Date.now(), from:'ai', text:confirmText, suggestedBatch: {messageId, actions}}])

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
      
      if(!res.ok) {
        if(res.status === 403) {
          const errorData = await res.json()
          if(errorData.error === 'insufficient_permissions') {
            setMessages(m=>[...m,{
              id:Date.now(), 
              from:'ai', 
              text:`🔐 **Permission Required**\n\n${errorData.message}\n\nTo enable this action, you need to grant additional Google permissions.`,
              needsReauth: true,
              reauthUrl: errorData.reauthUrl,
              actionType: errorData.actionType,
              requiredPermission: errorData.requiredPermission
            }])
            return {error: 'insufficient_permissions'}
          }
        }
        throw new Error('execute_failed')
      }
      
      const j = await res.json()
      
      let successText = `✅ Executed ${action.type}`
      if(action.type === 'reply' || action.type === 'draft_reply'){
        successText = '📧 Reply sent successfully!'
      } else if(action.type === 'create_event' || action.type === 'create_meeting'){
        successText = '📅 Meeting created successfully!'
      } else if(action.type === 'create_task'){
        successText = '✓ Task created successfully!'
      }
      
      setMessages(m=>[...m,{id:Date.now(), from:'ai', text:successText}])
      return j
    }catch(e){
      setMessages(m=>[...m,{id:Date.now(), from:'ai', text:`Execution failed: ${e.message || e}` }])
      throw e
    }
  }

  async function send(){
    if(!text.trim()) return
    
    const userMsg = {id:Date.now(),from:'user',text}
    const userText = text
    setMessages(m=>[...m,userMsg])
    setText('')
    
    // Initialize session if this is the first message
    let sessionId = currentSessionId
    if (!sessionId) {
      sessionId = await initializeSession()
      // If session creation failed, still continue with local-only mode
    }
    
    // Check if this is a response to a meeting input request
    const lastMessage = messages[messages.length - 1]
    if(lastMessage && lastMessage.needsInput && lastMessage.actionType === 'create_meeting') {
      await handleMeetingInput(lastMessage.messageId, userText)
      return
    }
    
    // Save user message to database (only if session exists)
    if (sessionId) {
      await saveMessage('user', userText, 'chat_response')
    }
    
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
          sessionId: sessionId
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
          } else if (detectedType === 'error') {
            // Handle error responses properly - prioritize content field
            aiResponse = json.response.content || json.response.message || json.response.text || "I had trouble processing your request. Could you try again with more details?"
          } else if (detectedType === 'create_meeting') {
            // Handle meeting creation responses - prioritize content field
            aiResponse = json.response.content || json.response.message || json.response.text || "I'd be happy to help you create a meeting. Could you provide the date, time, and meeting details?"
          } else {
            // Extract meaningful text from structured responses, avoid JSON.stringify
            aiResponse = json.response.content || json.response.message || json.response.response || json.response.text || "I processed your request."
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
      } else if (detectedType === 'create_meeting') {
        // Handle meeting creation responses with actions
        if (json.response.actions && json.response.actions.length > 0) {
          // Display the AI response
          setTimeout(async ()=>{
            setMessages(m=>[...m,{
              id:Date.now(),
              from:'ai',
              text:aiResponse,
              type: detectedType || 'chat_response',
              data: summaryData
            }])
            
            // Add action buttons for meeting creation
            setTimeout(() => {
              const actions = json.response.actions
              for(const action of actions) {
                setMessages(m=>[...m,{
                  id:Date.now()+Math.random(),
                  from:'ai',
                  text:`📅 **${action.title}**\n\nReady to create this meeting?`,
                  chatAction: action,
                  showChatActionButton: true
                }])
              }
            }, 300)
            
            // Save AI response to database
            await saveMessage('assistant', aiResponse, detectedType || 'chat_response', summaryData || {})
          }, 400)
          return // Don't continue with the normal flow
        }
      } else if (detectedType && detectedType !== 'chat_response') {
        // Add detected type info for debugging (optional)
        aiResponse = `🤖 *Detected: ${detectedType.replace('_', ' ')}*\n\n${aiResponse}`
      }
      
      // Ensure aiResponse is user-friendly (not raw JSON)
      const isJSON = (str) => {
        try {
          JSON.parse(str)
          return str.startsWith('{') || str.startsWith('[')
        } catch {
          return false
        }
      }
      
      if (isJSON(aiResponse)) {
        console.warn('Preventing raw JSON display:', aiResponse)
        aiResponse = "I understand your request. Let me help you with that."
        if (detectedType === 'create_meeting') {
          aiResponse = "I'd be happy to help you create a meeting. Could you provide more specific details like the date, time, and meeting title?"
        } else if (detectedType === 'error') {
          aiResponse = "I had some trouble processing that request. Could you please try rephrasing or providing more details?"
        }
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
        
        // Save AI response to database (only if session exists)
        if (sessionId) {
          await saveMessage('assistant', aiResponse, detectedType || 'chat_response', summaryData || {})
        }
      }, 400)
      
    } catch(e) {
      console.error('Chat error:', e)
      // Remove typing indicator and show error
      setMessages(m => m.filter(msg => !msg.typing))
      setTimeout(async ()=>{
        const errorMsg = `Sorry, I encountered an error: ${e.message}. You can still use the suggestion buttons below for email management.`
        setMessages(m=>[...m,{id:Date.now(),from:'ai',text:errorMsg}])
        
        // Save error message to database (only if session exists)
        if (sessionId) {
          await saveMessage('assistant', errorMsg, 'error_response', { error: e.message })
        }
      }, 400)
    }
  }

  // Function to execute chat-based actions (like creating meetings from chat)
  async function executeChatAction(action) {
    try {
      const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
      setMessages(m=>[...m,{id:Date.now(), from:'ai', text:`⏳ ${action.type === 'create_calendar_event' ? 'Creating your meeting...' : 'Executing action...'}`}])
      
      const res = await fetch(`${base}/api/llm/execute-action`, {
        method: 'POST',
        credentials: 'include',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ action })
      })
      
      if (!res.ok) {
        if(res.status === 403) {
          const errorData = await res.json()
          if(errorData.error === 'insufficient_permissions') {
            setMessages(m=>[...m,{
              id:Date.now(), 
              from:'ai', 
              text:`🔐 **Permission Required**\n\n${errorData.message}\n\nTo create meetings, you need to grant additional Google Calendar permissions.`,
              needsReauth: true,
              reauthUrl: errorData.reauthUrl,
              actionType: 'create_meeting',
              requiredPermission: errorData.requiredPermission
            }])
            return {error: 'insufficient_permissions'}
          }
        } else if(res.status === 400) {
          
          const errorData = await res.json()
          console.error(errorData)
          if(errorData.error === 'google_not_connected') {
            setMessages(m=>[...m,{
              id:Date.now(), 
              from:'ai', 
              text:`🔗 **Google Calendar Not Connected**\n\nTo create meetings, you need to connect your Google Calendar first. Please go to Settings → Integrations to connect your Google account.`
            }])
            return {error: 'google_not_connected'}
          }
        }
        throw new Error(`HTTP ${res.status}`)
      }
      
      const result = await res.json()
      
      if (result.success) {
        let successText = '✅ Action completed successfully!'
        if (action.type === 'create_calendar_event') {
          successText = `📅 **Meeting Created Successfully!**\n\n**${result.event.title}**\n📅 ${new Date(result.event.start).toLocaleString()}\n🔗 [View in Calendar](${result.event.link})`
        }
        setMessages(m=>[...m,{id:Date.now(), from:'ai', text:successText}])
      } else {
        throw new Error(result.message || 'Action failed')
      }
      
      return result
    } catch(e) {
      console.error('Chat action execution error:', e)
      setMessages(m=>[...m,{id:Date.now(), from:'ai', text:`❌ Action failed: ${e.message}`}])
      throw e
    }
  }

  // Function to handle meeting creation with user input
  async function handleMeetingInput(messageId, userInput) {
    try {
      const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
      setMessages(m=>[...m,{id:Date.now(), from:'ai', text:'📅 Creating meeting with your details...'}])
      
      const res = await fetch(`${base}/api/messages/${messageId}/action`, {
        method:'POST', 
        credentials:'include', 
        headers:{'Content-Type':'application/json'}, 
        body:JSON.stringify({
          actionType: 'create_meeting', 
          payload: { 
            userInput,
            meetingDetails: userInput 
          }
        })
      })
      
      if(!res.ok) {
        if(res.status === 403) {
          const errorData = await res.json()
          if(errorData.error === 'insufficient_permissions') {
            setMessages(m=>[...m,{
              id:Date.now(), 
              from:'ai', 
              text:`🔐 **Permission Required**\n\n${errorData.message}\n\nTo create meetings, you need to grant additional Google Calendar permissions.`,
              needsReauth: true,
              reauthUrl: errorData.reauthUrl,
              actionType: 'create_meeting',
              requiredPermission: errorData.requiredPermission
            }])
            return {error: 'insufficient_permissions'}
          }
        }
        throw new Error('meeting_creation_failed')
      }
      
      const j = await res.json()
      setMessages(m=>[...m,{id:Date.now(), from:'ai', text:'✅ Meeting created successfully! Check your calendar for details.'}])
      return j
    } catch(e) {
      setMessages(m=>[...m,{id:Date.now(), from:'ai', text:`Failed to create meeting: ${e.message || e}`}])
      throw e
    }
  }

  function handleKey(e){ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); send() }}

  return (
    <main className="chat-root">
      <div className="chat-card" role="region" aria-label="AI chat window">
        <div className="chat-header">
          <div>
            <div className="brand">One App Club <span className="small">assistant</span></div>
            <div className="small">Minimal • Fast • Thoughtful</div>
          </div>
          <button
            onClick={() => navigate('/history')}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid rgba(0,0,0,0.1)',
              background: 'rgba(255,255,255,0.8)',
              cursor: 'pointer',
              fontSize: '12px',
              color: '#4f46e5',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={e => {
              e.target.style.background = 'rgba(59,130,246,0.1)'
              e.target.style.borderColor = 'rgba(59,130,246,0.3)'
            }}
            onMouseLeave={e => {
              e.target.style.background = 'rgba(255,255,255,0.8)'
              e.target.style.borderColor = 'rgba(0,0,0,0.1)'
            }}
            title="View conversation history"
          >
            📜 History
          </button>
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
                whiteSpace: m.from === 'user' ? 'pre-wrap' : 'normal',
                background: m.type === 'email_summary' ? 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' : 'transparent',
                padding: m.type === 'email_summary' ? '12px' : '0',
                borderRadius: m.type === 'email_summary' ? '8px' : '0',
                border: m.type === 'email_summary' ? '1px solid rgba(0,0,0,0.05)' : 'none',
                fontSize: m.typing ? '14px' : '15px',
                color: m.typing ? '#666' : 'inherit'
              }}>
                {m.typing ? '💭 Thinking...' : (
                  m.from === 'ai' ? 
                    <ReactMarkdown
                      components={{
                        // Custom styling for markdown elements
                        h1: ({node, ...props}) => <h1 style={{fontSize: '18px', fontWeight: 'bold', margin: '12px 0 8px 0'}} {...props} />,
                        h2: ({node, ...props}) => <h2 style={{fontSize: '16px', fontWeight: 'bold', margin: '10px 0 6px 0'}} {...props} />,
                        h3: ({node, ...props}) => <h3 style={{fontSize: '14px', fontWeight: 'bold', margin: '8px 0 4px 0'}} {...props} />,
                        p: ({node, ...props}) => <p style={{margin: '4px 0', lineHeight: '1.4'}} {...props} />,
                        ul: ({node, ...props}) => <ul style={{margin: '8px 0', paddingLeft: '16px'}} {...props} />,
                        ol: ({node, ...props}) => <ol style={{margin: '8px 0', paddingLeft: '16px'}} {...props} />,
                        li: ({node, ...props}) => <li style={{margin: '2px 0'}} {...props} />,
                        strong: ({node, ...props}) => <strong style={{fontWeight: '600'}} {...props} />,
                        em: ({node, ...props}) => <em style={{fontStyle: 'italic'}} {...props} />,
                        code: ({node, inline, ...props}) => 
                          inline ? 
                            <code style={{background: 'rgba(0,0,0,0.08)', padding: '2px 4px', borderRadius: '3px', fontSize: '13px'}} {...props} /> :
                            <code style={{display: 'block', background: 'rgba(0,0,0,0.05)', padding: '8px', borderRadius: '6px', fontSize: '13px', overflow: 'auto'}} {...props} />,
                        pre: ({node, ...props}) => <pre style={{background: 'rgba(0,0,0,0.05)', padding: '8px', borderRadius: '6px', fontSize: '13px', overflow: 'auto'}} {...props} />,
                        blockquote: ({node, ...props}) => <blockquote style={{borderLeft: '3px solid #ddd', marginLeft: '0', paddingLeft: '12px', fontStyle: 'italic', color: '#666'}} {...props} />,
                        a: ({node, ...props}) => <a style={{color: '#1e40af', textDecoration: 'underline'}} target="_blank" rel="noopener noreferrer" {...props} />,
                        hr: ({node, ...props}) => <hr style={{border: 'none', borderTop: '1px solid #e5e7eb', margin: '12px 0'}} {...props} />
                      }}
                    >
                      {m.text}
                    </ReactMarkdown> 
                    : m.text
                )}
              </div>

              {/* render single suggested action buttons attached to a message */}
              {m.suggestedAction && (
                <div style={{marginTop:8,display:'flex',gap:8}}>
                  <button onClick={()=>confirmSuggestedAction(m.messageId || m.suggestedAction.messageId, m.suggestedAction)} style={{padding:'6px 8px',borderRadius:8,border:'1px solid rgba(0,0,0,0.06)'}}>Confirm {m.suggestedAction.type}</button>
                </div>
              )}

              {/* render chat action buttons (from direct chat meeting creation) */}
              {m.showChatActionButton && m.chatAction && (
                <div style={{marginTop:8,display:'flex',gap:8}}>
                  <button 
                    onClick={()=>executeChatAction(m.chatAction)} 
                    style={{
                      padding:'8px 12px',
                      borderRadius:8,
                      border:'1px solid #007bff',
                      backgroundColor:'#007bff',
                      color:'white',
                      cursor:'pointer'
                    }}
                  >
                    📅 Create Meeting
                  </button>
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

              {/* Enhanced action buttons for each email */}
              {m.messageData && m.showActions && (
                <div style={{
                  marginTop:12,
                  padding:'12px',
                  background:'linear-gradient(135deg, rgba(0,0,0,0.02) 0%, rgba(0,0,0,0.04) 100%)',
                  borderRadius:12,
                  border:'1px solid rgba(0,0,0,0.06)'
                }}>
                  <div style={{fontSize:'11px',color:'#666',marginBottom:8,fontWeight:'500'}}>
                    📧 Email Actions
                  </div>
                  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                    <button 
                      onClick={()=>performAction(m.messageData.id, 'draft_reply')} 
                      style={{
                        padding:'8px 12px',
                        borderRadius:8,
                        border:'1px solid rgba(59,130,246,0.3)',
                        background:'rgba(59,130,246,0.1)',
                        color:'#1e40af',
                        fontSize:'12px',
                        fontWeight:'500',
                        cursor:'pointer',
                        transition:'all 0.2s ease',
                        ':hover': {transform:'translateY(-1px)'}
                      }}
                      title="Draft AI-powered reply"
                      onMouseEnter={e => {
                        e.target.style.transform = 'translateY(-1px)'
                        e.target.style.boxShadow = '0 4px 8px rgba(59,130,246,0.2)'
                      }}
                      onMouseLeave={e => {
                        e.target.style.transform = 'translateY(0)'
                        e.target.style.boxShadow = 'none'
                      }}
                    >
                      ✍️ Draft Reply
                    </button>
                    <button 
                      onClick={()=>performAction(m.messageData.id, 'mark_read')} 
                      style={{
                        padding:'8px 12px',
                        borderRadius:8,
                        border:'1px solid rgba(16,185,129,0.3)',
                        background:'rgba(16,185,129,0.1)',
                        color:'#059669',
                        fontSize:'12px',
                        fontWeight:'500',
                        cursor:'pointer',
                        transition:'all 0.2s ease'
                      }}
                      title="Mark as read"
                      onMouseEnter={e => {
                        e.target.style.transform = 'translateY(-1px)'
                        e.target.style.boxShadow = '0 4px 8px rgba(16,185,129,0.2)'
                      }}
                      onMouseLeave={e => {
                        e.target.style.transform = 'translateY(0)'
                        e.target.style.boxShadow = 'none'
                      }}
                    >
                      ✓ Mark Read
                    </button>
                    <button 
                      onClick={()=>performAction(m.messageData.id, 'delete')} 
                      style={{
                        padding:'8px 12px',
                        borderRadius:8,
                        border:'1px solid rgba(239,68,68,0.3)',
                        background:'rgba(239,68,68,0.1)',
                        color:'#dc2626',
                        fontSize:'12px',
                        fontWeight:'500',
                        cursor:'pointer',
                        transition:'all 0.2s ease'
                      }}
                      title="Delete email"
                      onMouseEnter={e => {
                        e.target.style.transform = 'translateY(-1px)'
                        e.target.style.boxShadow = '0 4px 8px rgba(239,68,68,0.2)'
                      }}
                      onMouseLeave={e => {
                        e.target.style.transform = 'translateY(0)'
                        e.target.style.boxShadow = 'none'
                      }}
                    >
                      🗑️ Delete
                    </button>
                    <button 
                      onClick={()=>performAction(m.messageData.id, 'create_meeting')} 
                      style={{
                        padding:'8px 12px',
                        borderRadius:8,
                        border:'1px solid rgba(168,85,247,0.3)',
                        background:'rgba(168,85,247,0.1)',
                        color:'#7c3aed',
                        fontSize:'12px',
                        fontWeight:'500',
                        cursor:'pointer',
                        transition:'all 0.2s ease'
                      }}
                      title="Schedule meeting with sender"
                      onMouseEnter={e => {
                        e.target.style.transform = 'translateY(-1px)'
                        e.target.style.boxShadow = '0 4px 8px rgba(168,85,247,0.2)'
                      }}
                      onMouseLeave={e => {
                        e.target.style.transform = 'translateY(0)'
                        e.target.style.boxShadow = 'none'
                      }}
                    >
                      📅 Schedule Meeting
                    </button>
                    {/* Phase 1 Feature Buttons */}
                    <button 
                      onClick={() => {
                        setSelectedMessageForAction(m.messageData)
                        setShowTemplateModal(true)
                      }}
                      style={{
                        padding:'8px 12px',
                        borderRadius:8,
                        border:'1px solid rgba(245,158,11,0.3)',
                        background:'rgba(245,158,11,0.1)',
                        color:'#d97706',
                        fontSize:'12px',
                        fontWeight:'500',
                        cursor:'pointer',
                        transition:'all 0.2s ease'
                      }}
                      title="Use email template"
                      onMouseEnter={e => {
                        e.target.style.transform = 'translateY(-1px)'
                        e.target.style.boxShadow = '0 4px 8px rgba(245,158,11,0.2)'
                      }}
                      onMouseLeave={e => {
                        e.target.style.transform = 'translateY(0)'
                        e.target.style.boxShadow = 'none'
                      }}
                    >
                      📝 Template
                    </button>
                    <button 
                      onClick={() => {
                        setSelectedMessageForAction(m.messageData)
                        setShowSnoozeModal(true)
                      }}
                      style={{
                        padding:'8px 12px',
                        borderRadius:8,
                        border:'1px solid rgba(99,102,241,0.3)',
                        background:'rgba(99,102,241,0.1)',
                        color:'#4338ca',
                        fontSize:'12px',
                        fontWeight:'500',
                        cursor:'pointer',
                        transition:'all 0.2s ease'
                      }}
                      title="Snooze email"
                      onMouseEnter={e => {
                        e.target.style.transform = 'translateY(-1px)'
                        e.target.style.boxShadow = '0 4px 8px rgba(99,102,241,0.2)'
                      }}
                      onMouseLeave={e => {
                        e.target.style.transform = 'translateY(0)'
                        e.target.style.boxShadow = 'none'
                      }}
                    >
                      ⏰ Snooze
                    </button>
                    <button 
                      onClick={() => setShowSearchBar(true)}
                      style={{
                        padding:'8px 12px',
                        borderRadius:8,
                        border:'1px solid rgba(139,92,246,0.3)',
                        background:'rgba(139,92,246,0.1)',
                        color:'#7c2d12',
                        fontSize:'12px',
                        fontWeight:'500',
                        cursor:'pointer',
                        transition:'all 0.2s ease'
                      }}
                      title="Enhanced search"
                      onMouseEnter={e => {
                        e.target.style.transform = 'translateY(-1px)'
                        e.target.style.boxShadow = '0 4px 8px rgba(139,92,246,0.2)'
                      }}
                      onMouseLeave={e => {
                        e.target.style.transform = 'translateY(0)'
                        e.target.style.boxShadow = 'none'
                      }}
                    >
                      🔍 Search
                    </button>
                    {/* Phase 2 Feature Buttons */}
                    <button 
                      onClick={() => {
                        setSelectedMessageForAction(m.messageData)
                        setShowSchedulingModal(true)
                      }}
                      style={{
                        padding:'8px 12px',
                        borderRadius:8,
                        border:'1px solid rgba(16,185,129,0.3)',
                        background:'rgba(16,185,129,0.1)',
                        color:'#059669',
                        fontSize:'12px',
                        fontWeight:'500',
                        cursor:'pointer',
                        transition:'all 0.2s ease'
                      }}
                      title="Schedule email for optimal timing"
                      onMouseEnter={e => {
                        e.target.style.transform = 'translateY(-1px)'
                        e.target.style.boxShadow = '0 4px 8px rgba(16,185,129,0.2)'
                      }}
                      onMouseLeave={e => {
                        e.target.style.transform = 'translateY(0)'
                        e.target.style.boxShadow = 'none'
                      }}
                    >
                      📅 Schedule
                    </button>
                    <button 
                      onClick={() => setShowNotificationPanel(true)}
                      style={{
                        padding:'8px 12px',
                        borderRadius:8,
                        border:'1px solid rgba(239,68,68,0.3)',
                        background:'rgba(239,68,68,0.1)',
                        color:'#dc2626',
                        fontSize:'12px',
                        fontWeight:'500',
                        cursor:'pointer',
                        transition:'all 0.2s ease'
                      }}
                      title="Smart notifications and alerts"
                      onMouseEnter={e => {
                        e.target.style.transform = 'translateY(-1px)'
                        e.target.style.boxShadow = '0 4px 8px rgba(239,68,68,0.2)'
                      }}
                      onMouseLeave={e => {
                        e.target.style.transform = 'translateY(0)'
                        e.target.style.boxShadow = 'none'
                      }}
                    >
                      🔔 Alerts {notificationCount > 0 && <span className="notification-badge">{notificationCount}</span>}
                    </button>
                    <button 
                      onClick={() => setShowAnalyticsDashboard(true)}
                      style={{
                        padding:'8px 12px',
                        borderRadius:8,
                        border:'1px solid rgba(147,51,234,0.3)',
                        background:'rgba(147,51,234,0.1)',
                        color:'#7c2d12',
                        fontSize:'12px',
                        fontWeight:'500',
                        cursor:'pointer',
                        transition:'all 0.2s ease'
                      }}
                      title="View email analytics and insights"
                      onMouseEnter={e => {
                        e.target.style.transform = 'translateY(-1px)'
                        e.target.style.boxShadow = '0 4px 8px rgba(147,51,234,0.2)'
                      }}
                      onMouseLeave={e => {
                        e.target.style.transform = 'translateY(0)'
                        e.target.style.boxShadow = 'none'
                      }}
                    >
                      📊 Analytics
                    </button>
                  </div>
                </div>
              )}

              {/* legacy support: inline suggested actions stored on messageData (from pending list) */}
              {m.messageData && m.messageData.suggested && m.messageData.suggested.length>0 && !m.showActions && (
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

              {/* Re-authorization button for permission errors */}
              {m.needsReauth && (
                <div style={{
                  marginTop:12,
                  padding:'12px',
                  background:'linear-gradient(135deg, rgba(239,68,68,0.1) 0%, rgba(239,68,68,0.05) 100%)',
                  borderRadius:12,
                  border:'1px solid rgba(239,68,68,0.2)'
                }}>
                  <div style={{fontSize:'11px',color:'#dc2626',marginBottom:8,fontWeight:'500'}}>
                    🔐 Permission Required: {m.requiredPermission}
                  </div>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <button 
                      onClick={() => {
                        const popup = openOAuthPopup(m.reauthUrl)
                        monitorOAuthPopup(popup, () => {
                          console.log('🔐 Permission grant completed')
                          // Emit event to notify other components
                          window.dispatchEvent(new CustomEvent('permissionUpdated'))
                        })
                      }}
                      style={{
                        padding:'8px 16px',
                        borderRadius:8,
                        border:'1px solid rgba(239,68,68,0.3)',
                        background:'rgba(239,68,68,0.1)',
                        color:'#dc2626',
                        fontSize:'12px',
                        fontWeight:'500',
                        cursor:'pointer',
                        transition:'all 0.2s ease'
                      }}
                      onMouseEnter={e => {
                        e.target.style.transform = 'translateY(-1px)'
                        e.target.style.boxShadow = '0 4px 8px rgba(239,68,68,0.2)'
                      }}
                      onMouseLeave={e => {
                        e.target.style.transform = 'translateY(0)'
                        e.target.style.boxShadow = 'none'
                      }}
                    >
                      {m.actionType === 'complete_setup' || m.actionType === 'retry_setup' ? '🚀 Complete Setup' : '🔓 Grant Permissions'}
                    </button>
                    <button 
                      onClick={async () => {
                        try {
                          const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
                          const res = await fetch(`${base}/api/auth/permissions`, {credentials:'include'})
                          if(res.ok) {
                            const data = await res.json()
                            const permText = `**Current Permissions:**\n• Gmail Read: ${data.permissions.gmail_read ? '✅' : '❌'}\n• Gmail Send: ${data.permissions.gmail_send ? '✅' : '❌'}\n• Gmail Modify: ${data.permissions.gmail_modify ? '✅' : '❌'}\n• Calendar: ${data.permissions.calendar ? '✅' : '❌'}\n• Tasks: ${data.permissions.tasks ? '✅' : '❌'}\n\n${data.hasAllPermissions ? 'All permissions granted!' : `Missing: ${data.missingPermissions.join(', ')}`}`
                            setMessages(m=>[...m,{id:Date.now(), from:'ai', text:permText}])
                          }
                        } catch(e) {
                          setMessages(m=>[...m,{id:Date.now(), from:'ai', text:'Failed to check permissions.'}])
                        }
                      }}
                      style={{
                        padding:'6px 12px',
                        borderRadius:6,
                        border:'1px solid rgba(0,0,0,0.1)',
                        background:'#f9fafb',
                        color:'#6b7280',
                        fontSize:'11px',
                        cursor:'pointer'
                      }}
                    >
                      Check Status
                    </button>
                  </div>
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
            onClick={loadAllUnreadEmails}
            onFocus={()=>setFocusedSuggest('unread')}
            onBlur={()=>setFocusedSuggest(null)}
            onKeyDown={(e)=>{ if(e.key==='Enter' || e.key===' ') { e.preventDefault(); loadAllUnreadEmails() } }}
            aria-label="All unread emails (Alt+1)"
            aria-keyshortcuts="Alt+1"
            title="All unread emails with actions — Alt+1"
            style={{padding:'8px 12px', borderRadius:20, border:'1px solid rgba(59,130,246,0.3)', background:focusedSuggest==='unread'?'rgba(59,130,246,0.1)':'#fff', outline: focusedSuggest==='unread' ? '3px solid rgba(21,156,228,0.25)' : 'none', fontSize:'12px', fontWeight:'500', color:'#1e40af'}}
          >📬 all unread</button>

          <button
            onClick={loadImportantMessages}
            onFocus={()=>setFocusedSuggest('important')}
            onBlur={()=>setFocusedSuggest(null)}
            onKeyDown={(e)=>{ if(e.key==='Enter' || e.key===' ') { e.preventDefault(); loadImportantMessages() } }}
            aria-label="Important messages (Alt+2)"
            aria-keyshortcuts="Alt+2"
            title="Important messages — Alt+2"
            style={{padding:'8px 12px', borderRadius:20, border:'1px solid rgba(245,158,11,0.3)', background:focusedSuggest==='important'?'rgba(245,158,11,0.1)':'#fff', outline: focusedSuggest==='important' ? '3px solid rgba(21,156,228,0.25)' : 'none', fontSize:'12px', fontWeight:'500', color:'#d97706'}}
          >⚡ important</button>

          <button
            onClick={briefMe}
            onFocus={()=>setFocusedSuggest('brief')}
            onBlur={()=>setFocusedSuggest(null)}
            onKeyDown={(e)=>{ if(e.key==='Enter' || e.key===' ') { e.preventDefault(); briefMe() } }}
            aria-label="Brief me (Alt+3)"
            aria-keyshortcuts="Alt+3"
            title="Brief me — Alt+3"
            style={{padding:'8px 12px', borderRadius:20, border:'1px solid rgba(16,185,129,0.3)', background:focusedSuggest==='brief'?'rgba(16,185,129,0.1)':'#fff', outline: focusedSuggest==='brief' ? '3px solid rgba(21,156,228,0.25)' : 'none', fontSize:'12px', fontWeight:'500', color:'#059669'}}
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

          <button
            onClick={async () => {
              try {
                const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
                const debugRes = await fetch(`${base}/api/messages/debug`, {credentials:'include'})
                
                if (!debugRes.ok) {
                  setMessages(m=>[...m,{id:Date.now(), from:'ai', text:'Debug check failed: ' + debugRes.statusText}])
                  return
                }
                
                const debugJson = await debugRes.json()
                
                let sampleText = ''
                if (debugJson.sample_unread && debugJson.sample_unread.length > 0) {
                  sampleText += '\n\n**Sample Unread Messages:**\n'
                  debugJson.sample_unread.forEach((msg, idx) => {
                    sampleText += `${idx+1}. "${msg.subject}" from ${msg.sender} (${new Date(msg.received_at).toLocaleString()})\n`
                  })
                }
                
                const debugText = `🔍 **Email Database Debug:**
• Total messages: ${debugJson.counts.total}
• Unread messages: ${debugJson.counts.unread}
• Action required: ${debugJson.counts.action_required}
• Actioned: ${debugJson.counts.actioned}
• User ID: ${debugJson.user_id}${sampleText}

If unread count > 0 but you see "No unread messages", the Gmail polling job may need to run.`
                
                setMessages(m=>[...m,{id:Date.now(), from:'ai', text:debugText}])
              } catch(e) {
                setMessages(m=>[...m,{id:Date.now(), from:'ai', text:'Debug check failed: ' + e.message}])
              }
            }}
            style={{padding:'8px 12px', borderRadius:20, border:'1px solid rgba(156,163,175,0.3)', background:'#f9fafb', fontSize:'11px', color:'#6b7280'}}
            title="Debug email counts and endpoint status"
          >🔍 debug</button>

          <button
            onClick={async () => {
              try {
                const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
                const res = await fetch(`${base}/api/auth/permissions`, {credentials:'include'})
                
                if (!res.ok) {
                  setMessages(m=>[...m,{id:Date.now(), from:'ai', text:'❌ Failed to check permissions. Please ensure you are logged in.'}])
                  return
                }
                
                const data = await res.json()
                
                const statusIcons = {
                  gmail_read: data.permissions.gmail_read ? '✅' : '❌',
                  gmail_send: data.permissions.gmail_send ? '✅' : '❌', 
                  gmail_modify: data.permissions.gmail_modify ? '✅' : '❌',
                  calendar: data.permissions.calendar ? '✅' : '❌',
                  tasks: data.permissions.tasks ? '✅' : '❌'
                }
                
                let permissionText = `🔐 **Google Permissions Status**\n\n`
                permissionText += `• **Gmail Read:** ${statusIcons.gmail_read} ${data.permissions.gmail_read ? 'Enabled' : 'Missing'}\n`
                permissionText += `• **Gmail Send:** ${statusIcons.gmail_send} ${data.permissions.gmail_send ? 'Enabled' : 'Missing'}\n`
                permissionText += `• **Gmail Modify:** ${statusIcons.gmail_modify} ${data.permissions.gmail_modify ? 'Enabled' : 'Missing'}\n`
                permissionText += `• **Calendar:** ${statusIcons.calendar} ${data.permissions.calendar ? 'Enabled' : 'Missing'}\n`
                permissionText += `• **Tasks:** ${statusIcons.tasks} ${data.permissions.tasks ? 'Enabled' : 'Missing'}\n\n`
                
                if (data.hasAllPermissions) {
                  permissionText += `✅ **All permissions granted!** You can use all email management features.`
                } else {
                  permissionText += `⚠️ **Missing permissions:** ${data.missingPermissions.join(', ')}\n\n`
                  permissionText += `Some features may not work until you grant additional permissions.`
                  
                  setMessages(m=>[...m,{
                    id:Date.now(), 
                    from:'ai', 
                    text:permissionText,
                    needsReauth: !data.hasAllPermissions,
                    reauthUrl: data.reauthUrl || '/api/auth/reauth',
                    actionType: 'check_permissions',
                    requiredPermission: data.missingPermissions.join(', ')
                  }])
                  return
                }
                
                setMessages(m=>[...m,{id:Date.now(), from:'ai', text:permissionText}])
              } catch(e) {
                setMessages(m=>[...m,{id:Date.now(), from:'ai', text:'Failed to check permissions: ' + e.message}])
              }
            }}
            style={{padding:'8px 12px', borderRadius:20, border:'1px solid rgba(34,197,94,0.3)', background:'rgba(34,197,94,0.1)', fontSize:'11px', color:'#16a34a'}}
            title="Check Google API permissions status"
          >🔐 permissions</button>

          <button
            onClick={() => {
              const popup = openOAuthPopup('/api/auth/onboard')
              monitorOAuthPopup(popup, () => {
                console.log('🚀 Onboarding completed')
                // Emit event to notify other components
                window.dispatchEvent(new CustomEvent('permissionUpdated'))
              })
            }}
            style={{padding:'8px 12px', borderRadius:20, border:'1px solid rgba(99,102,241,0.3)', background:'rgba(99,102,241,0.1)', fontSize:'11px', color:'#4f46e5'}}
            title="Complete Google permissions setup for new users"
          >🚀 complete setup</button>

          <button
            onClick={() => {
              const markdownTestMessage = `## 📝 Markdown Test

This is a **bold text** and this is *italic text*.

### Features:
- ✅ **Bold** and *italic* formatting
- ✅ Lists with proper indentation
- ✅ \`inline code\` formatting
- ✅ Links: [One App Club](https://example.com)

#### Code Block Example:
\`\`\`javascript
function testMarkdown() {
  console.log("Markdown is working!");
}
\`\`\`

> **Note:** This is a blockquote to test styling.

---

All markdown features are now **fully functional** in AI responses! 🎉`

              setMessages(m=>[...m,{id:Date.now(), from:'ai', text:markdownTestMessage}])
            }}
            style={{padding:'8px 12px', borderRadius:20, border:'1px solid rgba(168,85,247,0.3)', background:'rgba(168,85,247,0.1)', fontSize:'11px', color:'#7c3aed'}}
            title="Test markdown rendering"
          >📝 test markdown</button>
        </div>
      </div>

      {/* Phase 1 Modals */}
      {showTemplateModal && (
        <EmailTemplateModal
          isOpen={showTemplateModal}
          onClose={() => {
            setShowTemplateModal(false)
            setSelectedMessageForAction(null)
          }}
          messageData={selectedMessageForAction}
          onTemplateSelect={async (template) => {
            // Handle template selection and draft creation
            try {
              const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
              const response = await fetch(`${base}/api/phase1/templates/${template.id}/apply`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  messageId: selectedMessageForAction?.id,
                  context: selectedMessageForAction
                })
              })

              if (response.ok) {
                const result = await response.json()
                setMessages(m => [...m, {
                  id: Date.now(),
                  from: 'ai',
                  text: `📝 **Template Applied Successfully**\n\nDraft created using "${template.name}" template:\n\n${result.draft_content}`
                }])
                setShowTemplateModal(false)
                setSelectedMessageForAction(null)
              } else {
                throw new Error('Failed to apply template')
              }
            } catch (error) {
              setMessages(m => [...m, {
                id: Date.now(),
                from: 'ai',
                text: `❌ Error applying template: ${error.message}`
              }])
            }
          }}
        />
      )}

      {showSnoozeModal && (
        <SnoozeModal
          isOpen={showSnoozeModal}
          onClose={() => {
            setShowSnoozeModal(false)
            setSelectedMessageForAction(null)
          }}
          messageData={selectedMessageForAction}
          onSnooze={async (snoozeData) => {
            try {
              const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
              const response = await fetch(`${base}/api/phase1/snooze`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  messageId: selectedMessageForAction?.id,
                  ...snoozeData
                })
              })

              if (response.ok) {
                const result = await response.json()
                setMessages(m => [...m, {
                  id: Date.now(),
                  from: 'ai',
                  text: `⏰ **Email Snoozed Successfully**\n\nEmail will reappear on ${new Date(result.snooze_until).toLocaleString()}`
                }])
                setShowSnoozeModal(false)
                setSelectedMessageForAction(null)

                // Refresh pending messages to reflect snooze status
                window.dispatchEvent(new CustomEvent('refreshPendingMessages'))
              } else {
                throw new Error('Failed to snooze email')
              }
            } catch (error) {
              setMessages(m => [...m, {
                id: Date.now(),
                from: 'ai',
                text: `❌ Error snoozing email: ${error.message}`
              }])
            }
          }}
        />
      )}

      {showSearchBar && (
        <EnhancedSearchBar
          isOpen={showSearchBar}
          onClose={() => {
            setShowSearchBar(false)
            setSearchResults([])
          }}
          onSearch={async (searchQuery) => {
            try {
              const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
              const response = await fetch(`${base}/api/phase1/search`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(searchQuery)
              })

              if (response.ok) {
                const results = await response.json()
                setSearchResults(results.messages || [])
                
                // Display search results in chat
                if (results.messages && results.messages.length > 0) {
                  const resultsText = `🔍 **Search Results** (${results.messages.length} found)\n\n` +
                    results.messages.slice(0, 5).map(msg => 
                      `📧 **${msg.subject}**\nFrom: ${msg.sender}\nDate: ${new Date(msg.received_at).toLocaleDateString()}\n---`
                    ).join('\n\n')
                  
                  setMessages(m => [...m, {
                    id: Date.now(),
                    from: 'ai',
                    text: resultsText
                  }])
                } else {
                  setMessages(m => [...m, {
                    id: Date.now(),
                    from: 'ai',
                    text: `🔍 No results found for your search query.`
                  }])
                }
              } else {
                throw new Error('Search failed')
              }
            } catch (error) {
              setMessages(m => [...m, {
                id: Date.now(),
                from: 'ai',
                text: `❌ Search error: ${error.message}`
              }])
            }
          }}
          searchResults={searchResults}
        />
      )}

      {/* Phase 2 Modals */}
      {showSchedulingModal && (
        <EmailSchedulingModal
          isOpen={showSchedulingModal}
          onClose={() => {
            setShowSchedulingModal(false)
            setSelectedMessageForAction(null)
          }}
          messageData={selectedMessageForAction}
          onSchedule={async (scheduleData) => {
            try {
              const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''
              const response = await fetch(`${base}/api/phase2/schedule`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(scheduleData)
              })

              if (response.ok) {
                const result = await response.json()
                setMessages(m => [...m, {
                  id: Date.now(),
                  from: 'ai',
                  text: `📅 **Email Scheduled Successfully**\n\nYour email to ${scheduleData.recipientEmail} will be sent on ${new Date(scheduleData.scheduledFor).toLocaleString()}\n\n**Subject:** ${scheduleData.subject}`
                }])
                setShowSchedulingModal(false)
                setSelectedMessageForAction(null)
              } else {
                throw new Error('Failed to schedule email')
              }
            } catch (error) {
              setMessages(m => [...m, {
                id: Date.now(),
                from: 'ai',
                text: `❌ Error scheduling email: ${error.message}`
              }])
            }
          }}
        />
      )}

      {showNotificationPanel && (
        <SmartNotificationPanel
          isOpen={showNotificationPanel}
          onClose={() => setShowNotificationPanel(false)}
        />
      )}

      {showAnalyticsDashboard && (
        <EmailAnalyticsDashboard
          isOpen={showAnalyticsDashboard}
          onClose={() => setShowAnalyticsDashboard(false)}
        />
      )}
    </main>
  )
}
