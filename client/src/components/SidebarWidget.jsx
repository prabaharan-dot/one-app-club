import React from 'react'
import GmailWidget from './widgets/Gmail'
import SlackWidget from './widgets/Slack'
import TeamsWidget from './widgets/Teams'
import JiraWidget from './widgets/Jira'
import GithubWidget from './widgets/Github'

export default function SidebarWidget(){
  return (
    <aside className="sidebar">
      <GmailWidget />
      <SlackWidget />
      <TeamsWidget />
      <JiraWidget />
      <GithubWidget />
    </aside>
  )
}
