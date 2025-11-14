const SERVER_BASE = (typeof window !== 'undefined' && window.location.hostname === 'localhost') ? `${window.location.protocol}//${window.location.hostname}:4000` : ''

export async function getMe(){
  const res = await fetch(`${SERVER_BASE}/api/auth/me`, {credentials:'include'})
  if(res.status === 401){
    // redirect to server signup flow for Google sign-in
    const signupUrl = SERVER_BASE ? `${SERVER_BASE}/api/auth/signup` : '/api/auth/signup'
    window.location.href = signupUrl
    return null
  }
  if(!res.ok) return null
  return res.json()
}

export default { getMe }
