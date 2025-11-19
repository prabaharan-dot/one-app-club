import React, {useEffect, useState} from 'react'
import SidebarWidget from './components/SidebarWidget'
import ChatWindow from './components/ChatWindow'
import CalendarPane from './components/CalendarPane'
import SignIn from './components/SignIn'
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
      <SidebarWidget />
      {!user ? <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'80vh'}}><SignIn /></div> : <ChatWindow />}
      <CalendarPane />
    </div>
  )
}
