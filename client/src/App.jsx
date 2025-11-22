import React, {useEffect, useState} from 'react'
import SidebarWidget from './components/SidebarWidget'
import ChatWindow from './components/ChatWindow'
import CalendarPane from './components/CalendarPane'
import SignIn from './components/SignIn'
import NotificationPanel from './components/NotificationPanel'
import PersonalizationPanel from './components/PersonalizationPanel'
import api from './api'

export default function App() {
  const [user, setUser] = useState(null)

  useEffect(()=>{
    api.getMe().then((r)=>{
      if(r && r.user) setUser(r.user)
    }).catch(()=>{})
  },[])

  return (
    <div className="app-root">
      {/* Top Right Corner Panels */}
      {user && (
        <div style={{
          position: 'fixed',
          top: '16px',
          right: '16px',
          zIndex: 1000,
          display: 'flex',
          gap: '12px',
          alignItems: 'center'
        }}>
          <PersonalizationPanel />
          <NotificationPanel />
        </div>
      )}
      
      <SidebarWidget />
      {!user ? <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'80vh'}}><SignIn /></div> : <ChatWindow />}
      <CalendarPane />
    </div>
  )
}
