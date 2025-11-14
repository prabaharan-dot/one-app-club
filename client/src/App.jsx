import React from 'react'
import SidebarWidget from './components/SidebarWidget'
import ChatWindow from './components/ChatWindow'
import CalendarPane from './components/CalendarPane'

export default function App() {
  return (
    <div className="app-root">
      <SidebarWidget />
      <ChatWindow />
      <CalendarPane />
    </div>
  )
}
