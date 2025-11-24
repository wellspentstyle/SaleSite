export function Footer() {
  const currentYear = new Date().getFullYear();

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
            <p className="text-base text-muted-foreground mb-4 leading-relaxed" style={{ fontFamily: 'Crimson Pro, serif' }}>
              Join for curated, CP-friendly designer deals
            </p>
            <iframe 
              src="https://wellspentstyle.substack.com/embed" 
              width="100%" 
              height="150"
              style={{
                border: '1px solid white',
                background: 'white',
                maxWidth: '100%'
              }}
              frameBorder={0}
              scrolling="no"
            />
          </div>
        </div>

        <div className="pt-10 border-t border-border text-center text-xs text-muted-foreground" style={{ fontFamily: 'Crimson Pro, serif' }}>
          <p>&copy; {currentYear} Well Spent Style</p>
        </div>
      </div>
    </footer>
  );
}
