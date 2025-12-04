import React from 'react'
import { useNavigate } from 'react-router-dom'
import GmailWidget from './widgets/Gmail'
import SlackWidget from './widgets/Slack'
import TeamsWidget from './widgets/Teams'
import JiraWidget from './widgets/Jira'
import GithubWidget from './widgets/Github'

export default function SidebarWidget(){
  const navigate = useNavigate()

  return (
    <aside className="sidebar">
      <GmailWidget />
      <SlackWidget />
      <TeamsWidget />
      <JiraWidget />
      <GithubWidget />
      
      {/* History Navigation Widget */}
      <div 
        className="widget history-widget"
        style={{ top: '320px' }}
        onClick={() => navigate('/history')}
      >
        <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'8px'}}>
          <span style={{fontSize:'20px'}}>📜</span>
          <div>
            <div className="title">Conversation History</div>
            <div className="desc">View past conversations</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
