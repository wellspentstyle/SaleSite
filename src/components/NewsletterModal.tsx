import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

export function NewsletterModal() {
  const [isOpen, setIsOpen] = useState(false);

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

        {/* Headline */}
        <h2
          style={{
            fontFamily: 'DM Sans, sans-serif',
            fontSize: '32px',
            fontWeight: 700,
            marginBottom: '16px',
            lineHeight: 1.3,
            letterSpacing: '0.02em'
          }}
        >
          Never Pay Full Price<br />for Good Design
        </h2>

        {/* Subtext */}
        <p
          style={{
            fontFamily: 'Crimson Pro, serif',
            fontSize: '18px',
            color: '#666',
            marginBottom: '24px',
            lineHeight: 1.6
          }}
        >
          Stay in the know with the best Creative Pragmatist designer deals.
        </p>

        {/* Substack Embed */}
        <div style={{ 
          width: '100%',
          display: 'flex',
          justifyContent: 'center'
        }}>
          <iframe 
            src="https://wellspentstyle.substack.com/embed" 
            width="100%" 
            height="150"
            style={{
              border: '1px solid white',
              background: 'white',
              maxWidth: '100%'
            }}
            frameBorder="0" 
            scrolling="no"
          />
        </div>
      </div>
    </div>
  );
}
