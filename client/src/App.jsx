import React, {useEffect, useState} from 'react'
import SidebarWidget from './components/SidebarWidget'
import ChatWindow from './components/ChatWindow'
import CalendarPane from './components/CalendarPane'
import SignIn from './components/SignIn'
import api from './api'
import LLMKeyModal from './components/LLMKeyModal'

export default function App() {
  const [user, setUser] = useState(null)
  const [needsKey, setNeedsKey] = useState(false)

  useEffect(()=>{
    api.getMe().then((r)=>{
      if(r && r.user) setUser(r.user)
      // check if user has llm key
      fetch((window.location.hostname==='localhost'? 'http://localhost:4000' : '') + '/api/settings/llm', {credentials:'include'}).then(async res=>{
        if(res.status===200){
          const json = await res.json()
          if(!json || !json.hasKey) setNeedsKey(true)
        }else{
          setNeedsKey(true)
        }
      }).catch(()=>setNeedsKey(true))
    }).catch(()=>{})
  },[])

  function onKeySaved(){ setNeedsKey(false) }

  return (
    <div className="app-root">
      <SidebarWidget />
      {!user ? <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'80vh'}}><SignIn /></div> : <ChatWindow />}
      <CalendarPane />
      {needsKey && <LLMKeyModal onSave={onKeySaved} />}
      {needsKey && <div style={{position:'fixed',inset:0,backdropFilter:'blur(6px)'}} />}
    </div>
  )
}
