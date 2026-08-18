import { useCallback, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Reveal from '../components/Reveal';
import Card from '../components/Card';
import GoogleSignInButton from '../components/GoogleSignInButton';
import SectionHeading from '../components/SectionHeading';
import { useAuth } from '../hooks/useAuth';

const inputClass =
  'rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm text-text transition-[border-color,box-shadow] focus:border-accent focus:shadow-[0_0_0_3px_rgba(91,140,255,0.15)] focus:outline-none hover:border-border-hover';

export default function Login() {
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/demo';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setSubmitting(false);
    }
  }

  const handleGoogleCredential = useCallback(
    async (idToken: string) => {
      setError('');
      try {
        await loginWithGoogle(idToken);
        navigate(from, { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error inesperado');
      }
    },
    [loginWithGoogle, navigate, from],
  );

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 pb-16 pt-4">
      <div className="pt-10 pb-2">
        <SectionHeading icon="🔑" eyebrow="Cuenta" title="Entrar" />
      </div>
      <Reveal>
        <Card>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm text-text-muted">
              Email
              <input
                className={inputClass}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-text-muted">
              Contraseña
              <input
                className={inputClass}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            <button type="submit" disabled={submitting} className="btn-neo btn-neo-primary self-start">
              Entrar
            </button>
          </form>
          {error && <p className="mt-2 text-sm text-[#ff6b6b]">{error}</p>}

          <div className="my-4 flex items-center gap-3 text-xs text-text-muted">
            <span className="h-px flex-1 bg-border" />
            <span>o</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <GoogleSignInButton onCredential={(idToken) => void handleGoogleCredential(idToken)} />

          <p className="mt-4 text-sm text-text-muted">
            ¿No tienes cuenta?{' '}
            <Link to="/register" className="text-accent hover:text-accent-2 hover:underline">
              Regístrate
            </Link>
          </p>
        </Card>
      </Reveal>
    </main>
  );
}
