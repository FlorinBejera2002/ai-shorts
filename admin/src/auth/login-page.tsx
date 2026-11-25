import { ArrowRight } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { api, type SessionUser } from '../api'
import { BrandLogo } from '../components/brand-logo'
import { illustrations } from '../components/illustrations'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'

export function LoginPage({ onAuthenticated }: { onAuthenticated: (user: SessionUser) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [secondFactor, setSecondFactor] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try { onAuthenticated(await api.login(email, password, secondFactor)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Autentificarea a eșuat') }
    finally { setBusy(false) }
  }

  return (
    <div className="login-screen">
      <BrandLogo className="login-brand" />
      <Card className="login-panel">
        <img className="login-illustration" src={illustrations.login} alt="" width={128} height={128} />
        <h1>Admin</h1>
        <Button type="button" variant="outline" size="lg" className="w-full" onClick={() => api.googleSignIn()}>
          <span className="google-mark" aria-hidden="true">G</span> Continuă cu Google
        </Button>
        <div className="login-divider"><span>sau</span></div>
        <form onSubmit={submit}>
          <Label>Email administrativ<Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></Label>
          <Label>Parolă<Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></Label>
          <Label>Cod 2FA<Input inputMode="numeric" value={secondFactor} onChange={(e) => setSecondFactor(e.target.value)} autoComplete="one-time-code" /></Label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <Button size="lg" className="w-full" disabled={busy}>{busy ? 'Se verifică…' : 'Intră în consolă'} <ArrowRight /></Button>
        </form>
      </Card>
    </div>
  )
}
