import React, { type MouseEvent } from 'react';
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
          <DialogTitle style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: '32px' }}>
            Our Faves from {sale.brandName}
          </DialogTitle>
        </DialogHeader>
        
        {sale.discountCode && (
          <div style={{
            padding: '16px 24px',
            backgroundColor: '#f5f5f5',
            borderRadius: '4px',
            marginTop: '16px'
          }}>
            <div style={{
              fontFamily: 'DM Sans, sans-serif',
              fontSize: '14px',
              fontWeight: 500,
              color: '#000'
            }}>
              Promo code: <span style={{ fontWeight: 700, letterSpacing: '0.5px' }}>{sale.discountCode}</span>
            </div>
          </div>
        )}
        
        <ScrollArea className="h-[60vh] pr-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {sale.picks.map((pick) => {
              // Fix decimal percent off values from Airtable (e.g., 0.19 should be 19)
              let percentOff = pick.percentOff;
              if (percentOff < 1 && percentOff > 0) {
                percentOff = percentOff * 100;
              }
              const roundedPercentOff = Math.round(percentOff);
              
              return (
                <div 
                  key={pick.id} 
                  onClick={() => window.open(pick.shopMyUrl, '_blank')}
                  className="border border-border hover:border-foreground transition-colors bg-white flex flex-col overflow-hidden cursor-pointer"
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
                    <div style={{ marginBottom: '12px' }}>
                      {pick.brand && pick.brand !== sale.brandName && (
                        <div 
                          style={{ 
                            fontFamily: 'DM Sans, sans-serif',
                            fontSize: '14px',
                            fontWeight: 400,
                            lineHeight: '1.4',
                            color: '#000',
                            marginBottom: '4px'
                          }}
                        >
                          {pick.brand}
                        </div>
                      )}
                      <div 
                        style={{ 
                          fontFamily: 'DM Sans, sans-serif',
                          fontSize: '14px',
                          fontWeight: 700,
                          lineHeight: '1.4',
                          color: '#000'
                        }}
                      >
                        {pick.name}
                      </div>
                    </div>
                    
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
                          {roundedPercentOff}% off
                        </span>
                      </div>
                    </div>
                    
                    <div style={{ marginTop: 'auto' }}>
                      <Button
                        className="w-full h-10 text-sm transition-colors"
                        size="sm"
                        style={{
                          fontFamily: 'DM Sans, sans-serif'
                        }}
                        onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => e.currentTarget.style.backgroundColor = '#374151'}
                        onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => e.currentTarget.style.backgroundColor = ''}
                        onClick={(e: MouseEvent) => {
                          e.stopPropagation();
                          window.open(pick.shopMyUrl, '_blank');
                        }}
                      >
                        Shop Now
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
            className="h-10 text-sm transition-colors"
            style={{
              fontFamily: 'DM Sans, sans-serif'
            }}
            onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => e.currentTarget.style.backgroundColor = '#374151'}
            onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => e.currentTarget.style.backgroundColor = ''}
            onClick={() => window.open(sale.saleUrl, '_blank')}
          >
            Shop All
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
