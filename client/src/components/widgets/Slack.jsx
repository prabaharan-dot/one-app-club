import React from 'react'
import { SiSlack } from 'react-icons/si'

export default function Slack(){
  return (
    <div className="widget slack fade-in" role="button" tabIndex={0} aria-label="Slack widget">
      <div className="icon-row">
        <div className="icon-circle"><SiSlack size={20} color="#4f46e5"/></div>
        <div>
          <div className="title">Slack</div>
          <div className="desc">5 new mentions in #product, 2 direct messages</div>
        </div>
      </div>
    </div>
  )
}
