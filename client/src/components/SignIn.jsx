import React from 'react'
import { FaGoogle } from 'react-icons/fa'

export default function SignIn(){
  function startSignup(){
    // redirect browser to server signup endpoint which starts Google OAuth
    window.location.href = (process.env.NODE_ENV === 'development' ? 'http://localhost:4000' : '') + '/api/auth/signup'
  }

  return (
    <button className="sign-btn" onClick={startSignup} aria-label="Sign in with Google">
      <FaGoogle style={{marginRight:8}} /> Sign in with Google
    </button>
  )
}
