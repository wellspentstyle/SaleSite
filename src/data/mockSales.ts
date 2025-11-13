import { Sale } from '../types';

export const mockSales: Sale[] = [
  {
    id: '1',
    brandName: 'Tibi',
    brandLogo: 'TIBI',
    discount: '30% Off',
    discountCode: 'STYLE30',
    startDate: '2025-11-05',
    endDate: '2025-11-10',
    saleUrl: 'https://tibi.com',
    heroImage: 'https://images.unsplash.com/photo-1624533523809-3d27d9ea6d80?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtaW5pbWFsaXN0JTIwZmFzaGlvbiUyMG1vZGVsfGVufDF8fHx8MTc2MjE2MzY1NHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    picks: [
      {
        id: '1-1',
        name: 'Oversized Blazer',
        description: 'Classic oversized blazer in navy',
        price: 595,
        imageUrl: 'https://images.unsplash.com/photo-1613909671501-f9678ffc1d33?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBmYXNoaW9ufGVufDF8fHx8MTc2MjE5ODkyOHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      },
      {
        id: '1-2',
        name: 'Pleated Midi Skirt',
        description: 'Elegant pleated midi skirt',
        price: 395,
        imageUrl: 'https://images.unsplash.com/photo-1654512697655-b2899afacae5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkZXNpZ25lciUyMGNsb3RoaW5nfGVufDF8fHx8MTc2MjEyNjI5OXww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      },
      {
        id: '1-3',
        name: 'Silk Camisole',
        description: 'Luxe silk camisole',
        price: 295,
        imageUrl: 'https://images.unsplash.com/photo-1574201635302-388dd92a4c3f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtaW5pbWFsJTIwZmFzaGlvbnxlbnwxfHx8fDE3NjIxOTg5Mjl8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      },
      {
        id: '1-4',
        name: 'Wide Leg Trousers',
        description: 'Tailored wide leg trousers',
        price: 450,
        imageUrl: 'https://images.unsplash.com/photo-1617922001439-4a2e6562f328?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx3b21lbiUyMGZhc2hpb258ZW58MXx8fHwxNzYyMTQ0ODE5fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      },
      {
        id: '1-5',
        name: 'Leather Tote',
        description: 'Structured leather tote',
        price: 695,
        imageUrl: 'https://images.unsplash.com/photo-1570857502809-08184874388e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmYXNoaW9uJTIwYm91dGlxdWV8ZW58MXx8fHwxNzYyMTAyNTc1fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      }
    ]
  },
  {
    id: '2',
    brandName: 'Toteme',
    brandLogo: 'TOTEME',
    discount: '40% Off',
    startDate: '2025-11-07',
    endDate: '2025-11-15',
    saleUrl: 'https://toteme-studio.com',
    heroImage: 'https://images.unsplash.com/photo-1611025504703-8c143abe6996?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkZXNpZ25lciUyMGNvYXQlMjBmYXNoaW9ufGVufDF8fHx8MTc2MjE4MDQ0MXww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    picks: [
      {
        id: '2-1',
        name: 'Monogram Scarf',
        description: 'Signature monogram scarf',
        price: 250,
        imageUrl: 'https://images.unsplash.com/photo-1613909671501-f9678ffc1d33?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBmYXNoaW9ufGVufDF8fHx8MTc2MjE5ODkyOHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      },
      {
        id: '2-2',
        name: 'Wool Coat',
        description: 'Double-breasted wool coat',
        price: 890,
        imageUrl: 'https://images.unsplash.com/photo-1654512697655-b2899afacae5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkZXNpZ25lciUyMGNsb3RoaW5nfGVufDF8fHx8MTc2MjEyNjI5OXww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      },
      {
        id: '2-3',
        name: 'Straight Jeans',
        description: 'Classic straight cut jeans',
        price: 320,
        imageUrl: 'https://images.unsplash.com/photo-1574201635302-388dd92a4c3f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtaW5pbWFsJTIwZmFzaGlvbnxlbnwxfHx8fDE3NjIxOTg5Mjl8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      },
      {
        id: '2-4',
        name: 'Cashmere Sweater',
        description: 'Luxurious cashmere crewneck',
        price: 450,
        imageUrl: 'https://images.unsplash.com/photo-1617922001439-4a2e6562f328?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx3b21lbiUyMGZhc2hpb258ZW58MXx8fHwxNzYyMTQ0ODE5fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      },
      {
        id: '2-5',
        name: 'Ankle Boots',
        description: 'Leather ankle boots',
        price: 590,
        imageUrl: 'https://images.unsplash.com/photo-1570857502809-08184874388e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmYXNoaW9uJTIwYm91dGlxdWV8ZW58MXx8fHwxNzYyMTAyNTc1fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      },
      {
        id: '2-6',
        name: 'Leather Belt',
        description: 'Classic leather belt with gold hardware',
        price: 180,
        imageUrl: 'https://images.unsplash.com/photo-1613909671501-f9678ffc1d33?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBmYXNoaW9ufGVufDF8fHx8MTc2MjE5ODkyOHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      }
    ]
  },
  {
    id: '3',
    brandName: 'Ruti',
    brandLogo: 'RUTI',
    discount: '25% Off',
    discountCode: 'WELLSPENT25',
    saleUrl: 'https://ruti.com',
    heroImage: 'https://images.unsplash.com/photo-1678637803367-ab57283cd9c2?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxlbGVnYW50JTIwd29tYW4lMjBmYXNoaW9ufGVufDF8fHx8MTc2MjE2NTc5NHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    picks: [
      {
        id: '3-1',
        name: 'Linen Dress',
        description: 'Breezy linen midi dress',
        price: 385,
        imageUrl: 'https://images.unsplash.com/photo-1654512697655-b2899afacae5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkZXNpZ25lciUyMGNsb3RoaW5nfGVufDF8fHx8MTc2MjEyNjI5OXww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      },
      {
        id: '3-2',
        name: 'Cotton Shirt',
        description: 'Oversized cotton shirt',
        price: 245,
        imageUrl: 'https://images.unsplash.com/photo-1574201635302-388dd92a4c3f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtaW5pbWFsJTIwZmFzaGlvbnxlbnwxfHx8fDE3NjIxOTg5Mjl8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      },
      {
        id: '3-3',
        name: 'Knit Cardigan',
        description: 'Chunky knit cardigan',
        price: 425,
        imageUrl: 'https://images.unsplash.com/photo-1617922001439-4a2e6562f328?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx3b21lbiUyMGZhc2hpb258ZW58MXx8fHwxNzYyMTQ0ODE5fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      },
      {
        id: '3-4',
        name: 'Tailored Shorts',
        description: 'High-waisted tailored shorts',
        price: 285,
        imageUrl: 'https://images.unsplash.com/photo-1570857502809-08184874388e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmYXNoaW9uJTIwYm91dGlxdWV8ZW58MXx8fHwxNzYyMTAyNTc1fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      },
      {
        id: '3-5',
        name: 'Straw Bag',
        description: 'Handwoven straw tote',
        price: 195,
        imageUrl: 'https://images.unsplash.com/photo-1613909671501-f9678ffc1d33?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBmYXNoaW9ufGVufDF8fHx8MTc2MjE5ODkyOHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      }
    ]
  },
  {
    id: '4',
    brandName: 'Rouje',
    brandLogo: 'ROUJE',
    discount: '50% Off',
    startDate: '2025-11-03',
    endDate: '2025-11-08',
    saleUrl: 'https://rouje.com',
    heroImage: 'https://images.unsplash.com/photo-1719518411339-5158cea86caf?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBmYXNoaW9uJTIwZWRpdG9yaWFsfGVufDF8fHx8MTc2MjE1MzYxMHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    picks: [
      {
        id: '4-1',
        name: 'Floral Print Dress',
        description: 'Romantic floral midi dress',
        price: 295,
        imageUrl: 'https://images.unsplash.com/photo-1654512697655-b2899afacae5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkZXNpZ25lciUyMGNsb3RoaW5nfGVufDF8fHx8MTc2MjEyNjI5OXww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      },
      {
        id: '4-2',
        name: 'Puff Sleeve Blouse',
        description: 'Cotton puff sleeve blouse',
        price: 165,
        imageUrl: 'https://images.unsplash.com/photo-1574201635302-388dd92a4c3f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtaW5pbWFsJTIwZmFzaGlvbnxlbnwxfHx8fDE3NjIxOTg5Mjl8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      },
      {
        id: '4-3',
        name: 'Denim Jacket',
        description: 'Vintage-inspired denim jacket',
        price: 225,
        imageUrl: 'https://images.unsplash.com/photo-1617922001439-4a2e6562f328?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx3b21lbiUyMGZhc2hpb258ZW58MXx8fHwxNzYyMTQ0ODE5fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      },
      {
        id: '4-4',
        name: 'Slip Skirt',
        description: 'Satin slip skirt',
        price: 175,
        imageUrl: 'https://images.unsplash.com/photo-1570857502809-08184874388e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmYXNoaW9uJTIwYm91dGlxdWV8ZW58MXx8fHwxNzYyMTAyNTc1fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      },
      {
        id: '4-5',
        name: 'Espadrilles',
        description: 'Canvas espadrilles',
        price: 95,
        imageUrl: 'https://images.unsplash.com/photo-1613909671501-f9678ffc1d33?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBmYXNoaW9ufGVufDF8fHx8MTc2MjE5ODkyOHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      }
    ]
  },
  {
    id: '5',
    brandName: 'Ganni',
    brandLogo: 'GANNI',
    discount: '35% Off',
    discountCode: 'SAVE35',
    startDate: '2025-11-10',
    endDate: '2025-11-20',
    saleUrl: 'https://ganni.com',
    heroImage: 'https://images.unsplash.com/photo-1761370571873-5d869310d731?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmYXNoaW9uJTIwYm91dGlxdWUlMjBpbnRlcmlvcnxlbnwxfHx8fDE3NjIxMzIyMzR8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    picks: [
      {
        id: '5-1',
        name: 'Printed Wrap Dress',
        description: 'Bold printed wrap dress',
        price: 385,
        imageUrl: 'https://images.unsplash.com/photo-1654512697655-b2899afacae5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkZXNpZ25lciUyMGNsb3RoaW5nfGVufDF8fHx8MTc2MjEyNjI5OXww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      },
      {
        id: '5-2',
        name: 'Smocked Top',
        description: 'Floral smocked top',
        price: 195,
        imageUrl: 'https://images.unsplash.com/photo-1574201635302-388dd92a4c3f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtaW5pbWFsJTIwZmFzaGlvbnxlbnwxfHx8fDE3NjIxOTg5Mjl8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      },
      {
        id: '5-3',
        name: 'Cowboy Boots',
        description: 'Western-inspired boots',
        price: 525,
        imageUrl: 'https://images.unsplash.com/photo-1617922001439-4a2e6562f328?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx3b21lbiUyMGZhc2hpb258ZW58MXx8fHwxNzYyMTQ0ODE5fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      },
      {
        id: '5-4',
        name: 'Bucket Hat',
        description: 'Reversible bucket hat',
        price: 95,
        imageUrl: 'https://images.unsplash.com/photo-1570857502809-08184874388e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmYXNoaW9uJTIwYm91dGlxdWV8ZW58MXx8fHwxNzYyMTAyNTc1fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      },
      {
        id: '5-5',
        name: 'Recycled Polyester Puffer',
        description: 'Sustainable puffer jacket',
        price: 445,
        imageUrl: 'https://images.unsplash.com/photo-1613909671501-f9678ffc1d33?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBmYXNoaW9ufGVufDF8fHx8MTc2MjE5ODkyOHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      }
    ]
  },
  {
    id: '6',
    brandName: 'Reformation',
    brandLogo: 'REFORMATION',
    discount: '20% Off',
    saleUrl: 'https://thereformation.com',
    heroImage: 'https://images.unsplash.com/photo-1709282028322-35c1fb068ef8?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBzaG9lcyUyMGhlZWxzfGVufDF8fHx8MTc2MjIwMjcyOXww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    picks: [
      {
        id: '6-1',
        name: 'Linen Jumpsuit',
        description: 'Sustainable linen jumpsuit',
        price: 248,
        imageUrl: 'https://images.unsplash.com/photo-1654512697655-b2899afacae5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkZXNpZ25lciUyMGNsb3RoaW5nfGVufDF8fHx8MTc2MjEyNjI5OXww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      },
      {
        id: '6-2',
        name: 'Silk Midi Dress',
        description: 'Vintage-inspired silk dress',
        price: 298,
        imageUrl: 'https://images.unsplash.com/photo-1574201635302-388dd92a4c3f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtaW5pbWFsJTIwZmFzaGlvbnxlbnwxfHx8fDE3NjIxOTg5Mjl8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      },
      {
        id: '6-3',
        name: 'High Rise Jeans',
        description: 'Classic high-rise skinny jeans',
        price: 128,
        imageUrl: 'https://images.unsplash.com/photo-1617922001439-4a2e6562f328?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx3b21lbiUyMGZhc2hpb258ZW58MXx8fHwxNzYyMTQ0ODE5fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      },
      {
        id: '6-4',
        name: 'Knit Tank',
        description: 'Ribbed knit tank',
        price: 58,
        imageUrl: 'https://images.unsplash.com/photo-1570857502809-08184874388e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmYXNoaW9uJTIwYm91dGlxdWV8ZW58MXx8fHwxNzYyMTAyNTc1fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      },
      {
        id: '6-5',
        name: 'Strappy Heels',
        description: 'Minimalist strappy heels',
        price: 198,
        imageUrl: 'https://images.unsplash.com/photo-1613909671501-f9678ffc1d33?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBmYXNoaW9ufGVufDF8fHx8MTc2MjE5ODkyOHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      }
    ]
  },
  {
    id: '7',
    brandName: '& Other Stories',
    brandLogo: '& OTHER STORIES',
    discount: '30% Off',
    discountCode: 'STORIES30',
    startDate: '2025-11-08',
    endDate: '2025-11-14',
    saleUrl: 'https://stories.com',
    heroImage: 'https://images.unsplash.com/photo-1664851449299-cc7db4ea9858?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxoaWdoJTIwZmFzaGlvbiUyMHJ1bndheXxlbnwxfHx8fDE3NjIyMDI3Mjh8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    picks: [
      {
        id: '7-1',
        name: 'Alpaca Blend Sweater',
        description: 'Soft alpaca blend crewneck',
        price: 129,
        imageUrl: 'https://images.unsplash.com/photo-1654512697655-b2899afacae5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkZXNpZ25lciUyMGNsb3RoaW5nfGVufDF8fHx8MTc2MjEyNjI5OXww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      },
      {
        id: '7-2',
        name: 'Leather Loafers',
        description: 'Classic leather loafers',
        price: 179,
        imageUrl: 'https://images.unsplash.com/photo-1574201635302-388dd92a4c3f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtaW5pbWFsJTIwZmFzaGlvbnxlbnwxfHx8fDE3NjIxOTg5Mjl8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      },
      {
        id: '7-3',
        name: 'Tailored Blazer',
        description: 'Double-breasted blazer',
        price: 229,
        imageUrl: 'https://images.unsplash.com/photo-1617922001439-4a2e6562f328?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx3b21lbiUyMGZhc2hpb258ZW58MXx8fHwxNzYyMTQ0ODE5fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      },
      {
        id: '7-4',
        name: 'Midi Skirt',
        description: 'A-line midi skirt',
        price: 99,
        imageUrl: 'https://images.unsplash.com/photo-1570857502809-08184874388e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmYXNoaW9uJTIwYm91dGlxdWV8ZW58MXx8fHwxNzYyMTAyNTc1fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      },
      {
        id: '7-5',
        name: 'Crossbody Bag',
        description: 'Leather crossbody bag',
        price: 149,
        imageUrl: 'https://images.unsplash.com/photo-1613909671501-f9678ffc1d33?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBmYXNoaW9ufGVufDF8fHx8MTc2MjE5ODkyOHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      }
    ]
  },
  {
    id: '8',
    brandName: 'Sézane',
    brandLogo: 'SÉZANE',
    discount: '40% Off',
    startDate: '2025-11-06',
    endDate: '2025-11-12',
    saleUrl: 'https://sezane.com',
    heroImage: 'https://images.unsplash.com/photo-1761646238279-30de81702a97?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkZXNpZ25lciUyMGhhbmRiYWclMjBsdXh1cnl8ZW58MXx8fHwxNzYyMTc3NTE2fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    picks: [
      {
        id: '8-1',
        name: 'Striped Marinière',
        description: 'Classic striped top',
        price: 85,
        imageUrl: 'https://images.unsplash.com/photo-1654512697655-b2899afacae5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkZXNpZ25lciUyMGNsb3RoaW5nfGVufDF8fHx8MTc2MjEyNjI5OXww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      },
      {
        id: '8-2',
        name: 'Wool Trench',
        description: 'Elegant wool trench coat',
        price: 395,
        imageUrl: 'https://images.unsplash.com/photo-1574201635302-388dd92a4c3f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtaW5pbWFsJTIwZmFzaGlvbnxlbnwxfHx8fDE3NjIxOTg5Mjl8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      },
      {
        id: '8-3',
        name: 'Suede Mules',
        description: 'Pointed toe suede mules',
        price: 195,
        imageUrl: 'https://images.unsplash.com/photo-1617922001439-4a2e6562f328?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx3b21lbiUyMGZhc2hpb258ZW58MXx8fHwxNzYyMTQ0ODE5fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      },
      {
        id: '8-4',
        name: 'Cashmere Scarf',
        description: 'Luxe cashmere scarf',
        price: 145,
        imageUrl: 'https://images.unsplash.com/photo-1570857502809-08184874388e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmYXNoaW9uJTIwYm91dGlxdWV8ZW58MXx8fHwxNzYyMTAyNTc1fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      },
      {
        id: '8-5',
        name: 'Floral Midi Dress',
        description: 'Parisian floral print dress',
        price: 225,
        imageUrl: 'https://images.unsplash.com/photo-1613909671501-f9678ffc1d33?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBmYXNoaW9ufGVufDF8fHx8MTc2MjE5ODkyOHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
      }
    ]
  }
];
