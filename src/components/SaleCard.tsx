import { Sale } from '../types';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

interface SaleCardProps {
  sale: Sale;
  onViewPicks: (sale: Sale) => void;
}

export function SaleCard({ sale, onViewPicks }: SaleCardProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const isActiveNow = () => {
    if (!sale.startDate) return false;
    const now = new Date();
    const start = new Date(sale.startDate);
    const end = sale.endDate ? new Date(sale.endDate) : null;
    
    return now >= start && (!end || now <= end);
  };

  const isEndingSoon = () => {
    if (!sale.endDate) return false;
    const now = new Date();
    const end = new Date(sale.endDate);
    const daysUntilEnd = (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    
    return daysUntilEnd > 0 && daysUntilEnd <= 3 && isActiveNow();
  };

  return (
    <div className="border border-border p-5 md:p-8 hover:border-foreground transition-colors bg-white h-full flex flex-col">
      <div className="flex-1 space-y-5">
        {/* Brand Logo - styled text placeholder for actual logo */}
        <div className="flex items-start justify-between">
          <div className="h-12 flex items-center">
            {/* Replace this div with <img src={sale.brandLogoUrl} alt={sale.brandName} className="h-full" /> when you have actual logos */}
            <span className="text-xl tracking-[0.15em]" style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700 }}>
              {sale.brandLogo}
            </span>
          </div>
          <div className="flex gap-2">
            {isEndingSoon() && (
              <Badge variant="destructive" className="text-xs px-2.5 py-1">
                Ending Soon
              </Badge>
            )}
          </div>
        </div>

        {/* Discount */}
        <div>
          <div className="text-4xl mb-2" style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700 }}>
            {sale.discount}
          </div>
        </div>

        {/* Discount Code */}
        {sale.discountCode && (
          <div className="text-base" style={{ fontFamily: 'Crimson Pro, serif' }}>
            <span className="text-muted-foreground">Code:</span>{' '}
            <span className="tracking-wider" style={{ fontWeight: 500 }}>{sale.discountCode}</span>
          </div>
        )}

        {/* Dates */}
        {(sale.startDate && sale.endDate) && (
          <div className="text-sm text-muted-foreground" style={{ fontFamily: 'Crimson Pro, serif' }}>
            {formatDate(sale.startDate)} – {formatDate(sale.endDate)}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="pt-4 flex gap-3">
        {sale.picks && sale.picks.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-10 text-sm"
            style={{ fontFamily: 'DM Sans, sans-serif' }}
            onClick={() => onViewPicks(sale)}
          >
            Our Faves
          </Button>
        )}
        <Button
          size="sm"
          className="flex-1 h-10 text-sm transition-colors font-normal"
          style={{ fontFamily: 'DM Sans, sans-serif' }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#374151'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = ''}
          asChild
        >
          <a
            href={sale.saleUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Shop Sale
          </a>
        </Button>
      </div>
    </div>
  );
}
