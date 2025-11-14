import React from 'react'
import { SiJira } from 'react-icons/si'

export default function Jira(){
  return (
    <div className="widget jira fade-in" role="button" tabIndex={0} aria-label="Jira widget">
      <div className="icon-row">
        <div className="icon-circle"><SiJira size={20} color="#0ea5a9"/></div>
        <div>
          <div className="title">Jira</div>
          <div className="desc">4 issues assigned. 1 blocked. Review backlog grooming notes</div>
        </div>
      </div>
    </div>
  )
}
