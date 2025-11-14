import React, { useState, useRef, useEffect } from 'react'

export default function ChatWindow(){
  const [messages, setMessages] = useState([
    {id:1,from:'ai',text:'Hi! I\'m your assistant. How can I help today?'}
  ])
  const [text, setText] = useState('')
  const bodyRef = useRef()

  useEffect(()=>{ if(bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight },[messages])

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
              {m.text}
            </div>
          ))}
        </div>
        <div className="chat-input">
          <textarea className="input-box" rows={1} value={text} onChange={e=>setText(e.target.value)} onKeyDown={handleKey} placeholder="Type a message... (Enter to send)" />
          <button className="send-btn" onClick={send} aria-label="Send message">Send</button>
        </div>
      </div>
    </main>
  )
}
