import { useState } from 'react';

export function Footer() {
  const currentYear = new Date().getFullYear();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleNewsletterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'Footer' })
      });

      if (response.ok) {
        setSubmitted(true);
        setEmail('');
        setTimeout(() => setSubmitted(false), 3000);
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

  return (
    <footer className="border-t border-border mt-32">
      <div className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-16 mb-16">
          {/* Brand */}
          <div>
            <h3 className="text-sm mb-5 tracking-[0.1em]" style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700 }}>
              WELL SPENT STYLE
            </h3>
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed" style={{ fontFamily: 'Crimson Pro, serif' }}>
              Curated designer sales and exclusive discount codes for the discerning shopper.
            </p>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-sm mb-5" style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 600 }}>
              Connect
            </h4>
            <ul className="space-y-3 text-sm text-muted-foreground" style={{ fontFamily: 'Crimson Pro, serif' }}>
              <li>
                <a href="mailto:wellspentstyle@gmail.com" className="hover:text-foreground transition-colors">
                  Email
                </a>
              </li>
              <li>
                <a href="https://www.instagram.com/wellspentstyle/" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
                  Instagram
                </a>
              </li>
              <li>
                <a href="https://wellspentstyle.substack.com/" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
                  Substack
                </a>
              </li>
            </ul>
          </div>

          {/* Newsletter */}
          <div>
            <h4 className="text-sm mb-5" style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 600 }}>
              Newsletter
            </h4>
            <p className="text-sm text-muted-foreground mb-4 leading-relaxed" style={{ fontFamily: 'Crimson Pro, serif' }}>
              Join for curated, CP-friendly designer deals
            </p>
            {!submitted ? (
              <form onSubmit={handleNewsletterSubmit} className="space-y-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                  required
                  className="w-full px-3 py-2 text-sm border border-border focus:outline-none focus:border-foreground transition-colors"
                  style={{ fontFamily: 'Crimson Pro, serif' }}
                />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full px-4 py-2 bg-foreground text-background text-sm hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 600 }}
                >
                  {isSubmitting ? 'Subscribing...' : 'Subscribe'}
                </button>
              </form>
            ) : (
              <p className="text-sm text-foreground" style={{ fontFamily: 'Crimson Pro, serif', fontWeight: 600 }}>
                Thanks for subscribing!
              </p>
            )}
          </div>
        </div>

        <div className="pt-10 border-t border-border text-center text-xs text-muted-foreground" style={{ fontFamily: 'Crimson Pro, serif' }}>
          <p>&copy; {currentYear} Well Spent Style</p>
        </div>
      </div>
    </footer>
  );
}
