import React from 'react'
import { MdEmail } from 'react-icons/md'

export default function Gmail(){
  return (
    <div className="widget gmail fade-in" role="button" tabIndex={0} aria-label="Gmail widget">
      <div className="icon-row">
        <div className="icon-circle"><MdEmail size={22} color="#c026d3"/></div>
        <div>
          <div className="title">Gmail</div>
          <div className="desc">You have 10 new mails. 3 of them need immediate action</div>
        </div>
      </div>
    </div>
  )
}
