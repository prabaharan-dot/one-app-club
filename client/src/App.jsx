import React, {useEffect, useState} from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import SidebarWidget from './components/SidebarWidget'
import ChatWindow from './components/ChatWindow'
import CalendarPane from './components/CalendarPane'
import SignIn from './components/SignIn'
import NotificationPanel from './components/NotificationPanel'
import PersonalizationPanel from './components/PersonalizationPanel'
import ConversationHistory from './components/ConversationHistory'
import api from './api'

export default function App() {
  const [user, setUser] = useState(null)
  const [userLoading, setUserLoading] = useState(true)

  useEffect(()=>{
    api.getMe().then((r)=>{
      if(r && r.user) setUser(r.user)
    }).catch(()=>{
      // User not logged in
    }).finally(() => {
      setUserLoading(false)
    })
  },[])

  return (
    <Router>
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
        
        <Routes>
          <Route path="/" element={
            userLoading ? (
              <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'80vh'}}>
                <div style={{ color: '#666', textAlign: 'center' }}>
                  <div style={{ fontSize: '32px', marginBottom: '16px' }}>🔄</div>
                  <div>Loading...</div>
                </div>
              </div>
            ) : (
              <>
                <SidebarWidget />
                {!user ? <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'80vh'}}><SignIn /></div> : <ChatWindow />}
                <CalendarPane />
              </>
            )
          } />
          <Route path="/history" element={
            userLoading ? (
              <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'80vh'}}>
                <div style={{ color: '#666', textAlign: 'center' }}>
                  <div style={{ fontSize: '32px', marginBottom: '16px' }}>🔄</div>
                  <div>Loading...</div>
                </div>
              </div>
            ) : user ? <ConversationHistory /> : <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'80vh'}}><SignIn /></div>
          } />
        </Routes>
      </div>
    </Router>
  )
}
