import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';

const links = [
  { to: '/', label: 'Inicio' },
  { to: '/demo', label: 'Demo' },
  { to: '/decisions', label: 'Decisiones técnicas' },
];

export default function NavBar() {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <nav className="glass sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-x-0 border-t-0 px-6 py-4">
      <NavLink
        to="/"
        className="flex items-center gap-2 text-sm font-bold tracking-tight text-text transition-opacity hover:opacity-85"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        <span className="inline-block h-2 w-2 rounded-full bg-gradient-to-br from-accent to-accent-2 shadow-[0_0_10px_rgba(91,140,255,0.8)]" />
        StudyDocs Pipeline
      </NavLink>
      <div className="flex items-center gap-6">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === '/'}
            className={({ isActive }) =>
              `relative py-1 text-base font-semibold uppercase tracking-wide transition-colors ${isActive ? 'text-text' : 'text-text-muted hover:text-text'}`
            }
          >
            {({ isActive }) => (
              <>
                {link.label}
                {isActive && (
                  <motion.span
                    layoutId="nav-underline"
                    className="absolute -bottom-0.5 left-0 right-0 h-0.5 rounded-full bg-gradient-to-r from-accent via-accent-2 to-accent-3"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
              </>
            )}
          </NavLink>
        ))}
        {isAuthenticated ? (
          <button
            type="button"
            onClick={() => {
              logout();
              navigate('/');
            }}
            className="text-base font-semibold uppercase tracking-wide text-text-muted transition-colors hover:text-text"
          >
            Salir
          </button>
        ) : (
          <NavLink
            to="/login"
            className="text-base font-semibold uppercase tracking-wide text-text-muted transition-colors hover:text-text"
          >
            Entrar
          </NavLink>
        )}
      </div>
    </nav>
  );
}
