import { Sale } from '../types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { ScrollArea } from './ui/scroll-area';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { ExternalLink } from 'lucide-react';
import { Button } from './ui/button';

interface SalePicksDialogProps {
  sale: Sale | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SalePicksDialog({ sale, open, onOpenChange }: SalePicksDialogProps) {
  if (!sale) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{sale.brandName} Sale Picks</DialogTitle>
          <DialogDescription>
            Kari's curated selection from the {sale.discount} sale
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="h-[60vh] pr-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {sale.picks.map((pick) => {
              const roundedPercentOff = Math.round(pick.percentOff);
              
              return (
                <div 
                  key={pick.id} 
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    border: '1px solid #e5e5e5',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    backgroundColor: '#fff',
                    transition: 'box-shadow 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.1)'}
                  onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
                >
                  <div 
                    style={{ 
                      width: '100%',
                      aspectRatio: '3/4',
                      overflow: 'hidden',
                      backgroundColor: '#f5f5f5'
                    }}
                  >
                    <ImageWithFallback
                      src={pick.imageUrl}
                      alt={pick.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div 
                    style={{ 
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      padding: '16px'
                    }}
                  >
                    <h3 
                      style={{ 
                        fontFamily: 'DM Sans, sans-serif',
                        fontSize: '14px',
                        fontWeight: 400,
                        lineHeight: '1.4',
                        marginBottom: '12px',
                        color: '#000'
                      }}
                    >
                      {pick.name}
                    </h3>
                    
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                        <span 
                          style={{ 
                            fontFamily: 'DM Sans, sans-serif',
                            fontSize: '14px',
                            fontWeight: 600,
                            color: '#000'
                          }}
                        >
                          ${pick.salePrice}
                        </span>
                        <span 
                          style={{ 
                            fontFamily: 'DM Sans, sans-serif',
                            fontSize: '14px',
                            textDecoration: 'line-through',
                            color: '#999'
                          }}
                        >
                          ${pick.originalPrice}
                        </span>
                      </div>
                      <div style={{ marginTop: '4px' }}>
                        <span 
                          style={{ 
                            fontFamily: 'DM Sans, sans-serif',
                            fontSize: '12px',
                            color: '#999'
                          }}
                        >
                          {roundedPercentOff}% OFF
                        </span>
                      </div>
                    </div>
                    
                    <div style={{ marginTop: 'auto' }}>
                      <Button
                        className="w-full"
                        size="sm"
                        onClick={() => window.open(pick.shopMyUrl, '_blank')}
                      >
                        Shop Now
                        <ExternalLink className="h-3 w-3 ml-2" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
        
        <div className="flex justify-end pt-4 border-t">
          <Button
            onClick={() => window.open(sale.saleUrl, '_blank')}
          >
            Shop All
            <ExternalLink className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
