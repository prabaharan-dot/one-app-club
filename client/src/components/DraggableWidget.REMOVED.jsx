import React, { useState, useRef, useEffect } from 'react'

export default function DraggableWidget({id, children, initialTop = 8, initialLeft = 12}){
  const elRef = useRef(null)
  const posRef = useRef({left: initialLeft, top: initialTop})
  const draggingRef = useRef(false)
  const startRef = useRef({x:0,y:0, left:0, top:0})
  const [pos, setPos] = useState(()=>{
    try{
      const raw = localStorage.getItem(`widget-pos-${id}`)
      return raw? JSON.parse(raw): {left: initialLeft, top: initialTop}
    }catch(e){return {left: initialLeft, top: initialTop}}
  })

  useEffect(()=>{ posRef.current = pos },[pos])

  useEffect(()=>{
    return ()=>{
      // cleanup
    }
  },[])

  function save(p){
    try{ localStorage.setItem(`widget-pos-${id}`, JSON.stringify(p)) }catch(e){}
  }

  function onPointerDown(e){
    const el = elRef.current
    if(!el) return
    el.setPointerCapture(e.pointerId)
    draggingRef.current = true
    startRef.current = {x: e.clientX, y: e.clientY, left: posRef.current.left, top: posRef.current.top}
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp, {once:true})
    // raise z
    el.style.zIndex = 999
  }

  function onPointerMove(e){
    if(!draggingRef.current) return
    const dx = e.clientX - startRef.current.x
    const dy = e.clientY - startRef.current.y
    const next = {left: Math.max(4, Math.round(startRef.current.left + dx)), top: Math.max(4, Math.round(startRef.current.top + dy))}
    setPos(next)
  }

  function onPointerUp(e){
    draggingRef.current = false
    const el = elRef.current
    if(el) el.style.zIndex = ''
    window.removeEventListener('pointermove', onPointerMove)
    save(posRef.current)
  }

  // clone child and inject props
  const child = React.isValidElement(children) ? React.cloneElement(children, {
    ref: elRef,
    onPointerDown: onPointerDown,
    style: {position:'absolute', left: pos.left + 'px', top: pos.top + 'px', touchAction:'none', userSelect:'none', ...children.props.style}
  }) : null

  return child
}
