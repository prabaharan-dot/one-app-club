import React from 'react'
import { format } from 'date-fns'

const sampleEvents = [
  {time:'09:00',title:'Daily Standup',loc:'Zoom',desc:'15m async updates'},
  {time:'11:00',title:'Product Sync',loc:'Conf A',desc:'Discuss roadmap'},
  {time:'15:30',title:'1:1 with Alex',loc:'Teams',desc:'Career conversation'}
]

export default function CalendarPane(){
  const today = new Date()
  return (
    <aside className="calendar" aria-label="Today calendar">
      <div className="calendar-header">
        <div>
          <div className="day">{format(today,'EEEE, MMM d')}</div>
          <div className="small">{format(today,'yyyy')}</div>
        </div>
        <div className="small">Timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}</div>
      </div>
      <div>
        {sampleEvents.map((ev,i)=> (
          <div className="event" key={i} role="article">
            <div className="time">{ev.time} • <span className="title">{ev.title}</span></div>
            <div className="desc small">{ev.loc} — {ev.desc}</div>
          </div>
        ))}
      </div>
    </aside>
  )
}
