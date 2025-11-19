import React, {useState} from 'react'
import { SiSlack } from 'react-icons/si'
import { MdSummarize, MdNotifications, MdChat } from 'react-icons/md'

export default function Slack(){
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

  function showMentions(){
    window.dispatchEvent(new CustomEvent('showSlackMentions'))
    setShowHoverMenu(false)
  }

  function showSummary(){
    window.dispatchEvent(new CustomEvent('showSlackSummary'))
    setShowHoverMenu(false)
  }

  function showDirectMessages(){
    window.dispatchEvent(new CustomEvent('showSlackDMs'))
    setShowHoverMenu(false)
  }

  return (
    <div 
      className="widget slack fade-in widget-container"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="widget-content" role="button" tabIndex={0} aria-label="Slack widget" onClick={showMentions}>
        <div className="icon-row">
          <div className="icon-circle"><SiSlack size={20} color="#4f46e5"/></div>
          <div>
            <div className="title">Slack</div>
            <div className="desc">5 new mentions in #product, 2 direct messages</div>
          </div>
        </div>
      </div>

      {showHoverMenu && (
        <div className="hover-menu" onMouseEnter={handleMenuHover} onMouseLeave={handleMouseLeave}>
          <div className="hover-menu-item" onClick={showMentions}>
            <MdNotifications size={16} />
            <span>Show Mentions</span>
          </div>
          <div className="hover-menu-item" onClick={showDirectMessages}>
            <MdChat size={16} />
            <span>Direct Messages</span>
          </div>
          <div className="hover-menu-item" onClick={showSummary}>
            <MdSummarize size={16} />
            <span>Channel Summary</span>
          </div>
        </div>
      )}
    </div>
  )
}
