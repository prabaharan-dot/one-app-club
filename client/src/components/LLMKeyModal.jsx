import React, {useState} from 'react'

export default function LLMKeyModal({onSave}){
  const [key, setKey] = useState('')
  const [model, setModel] = useState('gpt-4o-mini')
  function save(){
    if(!key.trim()) return
    // send to server to persist (endpoint not implemented yet)
    fetch((window.location.hostname==='localhost'? 'http://localhost:4000' : '') + '/api/settings/llm', {method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({key, model})}).then(r=>{
      if(r.ok) onSave({model})
    })
  }

  return (
    <div style={{position:'fixed',inset:0,display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999}}>
      <div style={{position:'absolute',inset:0,backdropFilter:'blur(6px)',background:'rgba(0,0,0,0.25)'}} />
      <div style={{position:'relative',background:'white',padding:24,borderRadius:12,width:420,boxShadow:'0 20px 60px rgba(2,6,23,0.2)'}}>
        <h3>Enter your LLM API key</h3>
        <p style={{color:'#666'}}>We will use your key to process emails and take actions. Your key will be stored encrypted (demo).</p>
        <input value={key} onChange={e=>setKey(e.target.value)} style={{width:'100%',padding:10,marginBottom:10}} placeholder="sk-..." />
        <select value={model} onChange={e=>setModel(e.target.value)} style={{width:'100%',padding:10,marginBottom:10}}>
          <option value="gpt-4o-mini">gpt-4o-mini</option>
          <option value="gpt-4o">gpt-4o</option>
          <option value="gpt-4o-mini-2025">gpt-4o-mini-2025</option>
        </select>
        <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
          <button onClick={save} style={{background:'#7c3aed',color:'white',padding:'8px 12px',borderRadius:8}}>Save</button>
        </div>
      </div>
    </div>
  )
}
