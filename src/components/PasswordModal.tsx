import { useState, useRef, useEffect } from 'react';
import { Lock, Eye, EyeOff, X, HelpCircle } from 'lucide-react';

type ModalMode = 'create' | 'unlock';

interface Props {
  mode: ModalMode;
  hint?: string;
  title?: string;
  onSubmit: (password: string, hint?: string) => void;
  onCancel: () => void;
  error?: string;
}

export default function PasswordModal({ mode, hint, title, onSubmit, onCancel, error }: Props) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordHint, setPasswordHint] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (error) setLocalError(error);
  }, [error]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');

    if (!password.trim()) {
      setLocalError('Digite uma senha.');
      return;
    }

    if (mode === 'create') {
      if (password.length < 3) {
        setLocalError('A senha deve ter pelo menos 3 caracteres.');
        return;
      }
      if (password !== confirmPassword) {
        setLocalError('As senhas não coincidem.');
        return;
      }
      onSubmit(password, passwordHint.trim() || undefined);
    } else {
      onSubmit(password);
    }
  };

  return (
    <div className="password-modal-overlay" onClick={onCancel}>
      <div className="password-modal" onClick={(e) => e.stopPropagation()}>
        <div className="password-modal-header">
          <Lock size={18} />
          <h3>{title || (mode === 'create' ? 'Criar senha de proteção' : 'Digite a senha')}</h3>
          <button className="password-modal-close" onClick={onCancel}><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          {hint && mode === 'unlock' && (
            <div className="password-hint">
              <HelpCircle size={13} />
              <span>Dica: {hint}</span>
            </div>
          )}

          <div className="password-field">
            <input
              ref={inputRef}
              type={showPassword ? 'text' : 'password'}
              placeholder="Senha"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setLocalError(''); }}
              autoComplete="off"
            />
            <button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>

          {mode === 'create' && (
            <>
              <div className="password-field">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Confirmar senha"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setLocalError(''); }}
                  autoComplete="off"
                />
              </div>
              <div className="password-field">
                <input
                  type="text"
                  placeholder="Dica de senha (opcional)"
                  value={passwordHint}
                  onChange={(e) => setPasswordHint(e.target.value)}
                />
              </div>
            </>
          )}

          {localError && <p className="password-error">{localError}</p>}

          <div className="password-modal-actions">
            <button type="button" className="password-btn-cancel" onClick={onCancel}>Cancelar</button>
            <button type="submit" className="password-btn-submit">
              {mode === 'create' ? 'Proteger' : 'Desbloquear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
