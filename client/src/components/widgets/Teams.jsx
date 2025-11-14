import React from 'react'
import { SiMicrosoftteams } from 'react-icons/si'

export default function Teams(){
  return (
    <div className="widget teams fade-in" role="button" tabIndex={0} aria-label="Teams widget">
      <div className="icon-row">
        <div className="icon-circle"><SiMicrosoftteams size={20} color="#0ea5e9"/></div>
        <div>
          <div className="title">Teams</div>
          <div className="desc">2 upcoming calls, 1 missed mention</div>
        </div>
      </div>
    </div>
  )
}
