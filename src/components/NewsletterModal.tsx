import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

export function NewsletterModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const hasSeenModal = localStorage.getItem('newsletter-modal-seen');
    if (!hasSeenModal) {
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    localStorage.setItem('newsletter-modal-seen', 'true');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      if (response.ok) {
        setSubmitted(true);
        setTimeout(() => {
          handleClose();
        }, 2000);
      } else {
        alert('Failed to subscribe. Please try again.');
      }
    } catch (error) {
      console.error('Newsletter subscription error:', error);
      alert('Failed to subscribe. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: '16px'
      }}
      onClick={handleClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          border: '1px solid var(--border)',
          maxWidth: '500px',
          width: '100%',
          padding: '48px 40px',
          position: 'relative'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '8px',
            color: '#666'
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = '#000'}
          onMouseLeave={(e) => e.currentTarget.style.color = '#666'}
        >
          <X size={20} />
        </button>

        {!submitted ? (
          <>
            {/* Headline */}
            <h2
              style={{
                fontFamily: 'Crimson Pro, serif',
                fontSize: '32px',
                fontWeight: 600,
                marginBottom: '16px',
                lineHeight: 1.2,
                letterSpacing: '-0.02em'
              }}
            >
              Never Pay Full Price for Good Design
            </h2>

            {/* Subtext */}
            <p
              style={{
                fontFamily: 'Crimson Pro, serif',
                fontSize: '16px',
                color: '#666',
                marginBottom: '32px',
                lineHeight: 1.6
              }}
            >
              Stay in the know with the best CP-friendly designer deals.
            </p>

            {/* Form */}
            <form onSubmit={handleSubmit}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your email address"
                required
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  border: '1px solid var(--border)',
                  fontFamily: 'Crimson Pro, serif',
                  fontSize: '15px',
                  marginBottom: '16px',
                  outline: 'none'
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = '#000'}
                onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
              />

              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  padding: '14px',
                  backgroundColor: '#000',
                  color: 'white',
                  border: 'none',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: '14px',
                  fontWeight: 600,
                  letterSpacing: '0.05em',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => !isSubmitting && (e.currentTarget.style.backgroundColor = '#374151')}
                onMouseLeave={(e) => !isSubmitting && (e.currentTarget.style.backgroundColor = '#000')}
              >
                {isSubmitting ? 'Subscribing...' : "I'm In"}
              </button>
            </form>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <h3
              style={{
                fontFamily: 'Crimson Pro, serif',
                fontSize: '24px',
                fontWeight: 600,
                marginBottom: '12px'
              }}
            >
              Welcome to the club!
            </h3>
            <p
              style={{
                fontFamily: 'Crimson Pro, serif',
                fontSize: '16px',
                color: '#666'
              }}
            >
              Check your inbox for great deals.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
