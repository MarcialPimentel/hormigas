// Feedback button in the top bar of every screen. Messages go to the admin Feedback screen.
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useGame } from '../game';

const KINDS = [
  { id: 'bug', label: 'Bug' },
  { id: 'idea', label: 'Idea' },
  { id: 'confusing', label: 'Confusing' },
  { id: 'other', label: 'Other' },
] as const;

export function FeedbackButton({ screen }: { screen: string }) {
  const { colony, toast } = useGame();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<string>('idea');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const textRef = useRef<HTMLTextAreaElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    textRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  function close() {
    setOpen(false);
    setError('');
    buttonRef.current?.focus();
  }

  async function send() {
    setSending(true);
    setError('');
    try {
      await api.post('/api/feedback', {
        kind,
        message,
        context: { screen, colonyId: colony?.id, viewport: `${window.innerWidth}x${window.innerHeight}`, userAgent: navigator.userAgent },
      });
      setMessage('');
      setKind('idea');
      close();
      toast('ok', 'Thanks! Your feedback reached the colony’s keeper.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send. Try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button ref={buttonRef} className="btn ghost small feedback-btn" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 5h16v11H9l-5 4V5Z" />
          <path d="M8 9.5h8M8 12.5h5" />
        </svg>
        <span className="feedback-label">Feedback</span>
      </button>
      {open && (
        <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
            <header className="panel-head">
              <h2 id="feedback-title">Send feedback</h2>
              <button className="btn ghost small" onClick={close}>Close</button>
            </header>
            <p className="muted small">Found a bug, got an idea, or stuck on something? Tell the developer. Your screen and colony are attached for you.</p>
            <div className="seg" role="radiogroup" aria-label="Kind of feedback">
              {KINDS.map((k) => (
                <button key={k.id} role="radio" aria-checked={kind === k.id} className={kind === k.id ? 'on' : ''} onClick={() => setKind(k.id)}>
                  {k.label}
                </button>
              ))}
            </div>
            <label className="sr-only" htmlFor="feedback-text">Your feedback</label>
            <textarea
              id="feedback-text"
              ref={textRef}
              rows={5}
              maxLength={2000}
              placeholder="What happened, or what would make the game better?"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <div className="sheet-foot">
              <span className="muted small">{message.length}/2000</span>
              <button className="btn primary" disabled={sending || message.trim().length < 3} onClick={send}>
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
            {error && <p className="form-error">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}
