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
            {sale.picks.map((pick) => (
              <div key={pick.id} className="border rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                <div className="aspect-square relative overflow-hidden bg-muted">
                  <ImageWithFallback
                    src={pick.imageUrl}
                    alt={pick.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-5 space-y-3">
                  <h3 className="font-semibold text-base leading-tight">{pick.name}</h3>
                  <div className="flex items-baseline gap-2.5">
                    <span className="text-lg text-red-600">${pick.salePrice}</span>
                    <span className="text-sm text-gray-400 line-through">${pick.originalPrice}</span>
                    <span className="text-xs text-green-600 font-medium">{pick.percentOff}% off</span>
                  </div>
                  <Button
                    className="w-full mt-4"
                    size="sm"
                    onClick={() => window.open(pick.shopMyUrl, '_blank')}
                  >
                    Shop Now
                    <ExternalLink className="h-3 w-3 ml-2" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
        
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
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
