import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Reveal from '../components/Reveal';
import Card from '../components/Card';
import SectionHeading from '../components/SectionHeading';
import { useAuth } from '../hooks/useAuth';

const inputClass =
  'rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm text-text transition-[border-color,box-shadow] focus:border-accent focus:shadow-[0_0_0_3px_rgba(91,140,255,0.15)] focus:outline-none hover:border-border-hover';

export default function Register() {
  const { register, login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await register(email, password);
      await login(email, password);
      navigate('/demo', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 pb-16 pt-4">
      <div className="pt-10 pb-2">
        <SectionHeading icon="📝" eyebrow="Cuenta" title="Crear cuenta" />
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
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <span className="text-xs text-text-muted">Mínimo 8 caracteres.</span>
            </label>
            <button type="submit" disabled={submitting} className="btn-neo btn-neo-primary self-start">
              Crear cuenta
            </button>
          </form>
          {error && <p className="mt-2 text-sm text-[#ff6b6b]">{error}</p>}
          <p className="mt-4 text-sm text-text-muted">
            ¿Ya tienes cuenta?{' '}
            <Link to="/login" className="text-accent hover:text-accent-2 hover:underline">
              Entra
            </Link>
          </p>
        </Card>
      </Reveal>
    </main>
  );
}
