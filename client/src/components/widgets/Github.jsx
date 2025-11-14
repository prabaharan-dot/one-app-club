import React from 'react'
import { FaGithub } from 'react-icons/fa'

export default function Github(){
  return (
    <div className="widget github fade-in" role="button" tabIndex={0} aria-label="Github widget">
      <div className="icon-row">
        <div className="icon-circle"><FaGithub size={20} color="#111827"/></div>
        <div>
          <div className="title">GitHub</div>
          <div className="desc">3 pull requests awaiting review. 1 CI failing</div>
        </div>
      </div>
    </div>
  )
}
