import React, {useState} from 'react'
import { SiMicrosoftteams } from 'react-icons/si'
import { MdVideoCall, MdNotifications, MdSummarize } from 'react-icons/md'

export default function Teams(){
  const [showHoverMenu, setShowHoverMenu] = useState(false)
  const [hoverTimeout, setHoverTimeout] = useState(null)

  function handleMouseEnter(){
    if(hoverTimeout) clearTimeout(hoverTimeout)
    const timeout = setTimeout(() => setShowHoverMenu(true), 800)
    setHoverTimeout(timeout)
  }

  function handleMouseLeave(){
    if(hoverTimeout) clearTimeout(hoverTimeout)
    const timeout = setTimeout(() => setShowHoverMenu(false), 300)
    setHoverTimeout(timeout)
  }

  function handleMenuHover(){
    if(hoverTimeout) clearTimeout(hoverTimeout)
  }

  function showUpcomingMeetings(){
    window.dispatchEvent(new CustomEvent('showTeamsMeetings'))
    setShowHoverMenu(false)
  }

  function showMentions(){
    window.dispatchEvent(new CustomEvent('showTeamsMentions'))
    setShowHoverMenu(false)
  }

  function showSummary(){
    window.dispatchEvent(new CustomEvent('showTeamsSummary'))
    setShowHoverMenu(false)
  }

  return (
    <div 
      className="widget teams fade-in widget-container"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="widget-content" role="button" tabIndex={0} aria-label="Teams widget" onClick={showUpcomingMeetings}>
        <div className="icon-row">
          <div className="icon-circle"><SiMicrosoftteams size={20} color="#0ea5e9"/></div>
          <div>
            <div className="title">Teams</div>
            <div className="desc">2 upcoming calls, 1 missed mention</div>
          </div>
        </div>
      </div>

      {showHoverMenu && (
        <div className="hover-menu" onMouseEnter={handleMenuHover} onMouseLeave={handleMouseLeave}>
          <div className="hover-menu-item" onClick={showUpcomingMeetings}>
            <MdVideoCall size={16} />
            <span>Upcoming Meetings</span>
          </div>
          <div className="hover-menu-item" onClick={showMentions}>
            <MdNotifications size={16} />
            <span>Show Mentions</span>
          </div>
          <div className="hover-menu-item" onClick={showSummary}>
            <MdSummarize size={16} />
            <span>Activity Summary</span>
          </div>
        </div>
      )}
    </div>
  )
}
