export function Hero() {
  return (
    <div className="relative h-[70vh] min-h-[500px] overflow-hidden">
      {/* Background Video */}
      <div className="absolute inset-0">
        <video
          autoPlay
          loop
          muted
          playsInline
          poster="/hero-background.png"
          className="w-full h-full object-cover"
          style={{ objectPosition: 'center 35%' }}
        >
          <source src="/hero-video.webm" type="video/webm" />
          <source src="/hero-video.mp4" type="video/mp4" />
          Your browser does not support the video tag.
        </video>
        {/* Overlay */}
        <div className="absolute inset-0 bg-black/55" />
      </div>
      
      {/* Content */}
      <div className="relative h-full flex items-center">
        <div className="container mx-auto px-6 md:px-8 lg:px-12">
          <div className="max-w-3xl text-white">
            <h1 className="text-5xl md:text-6xl lg:text-7xl mb-6 tracking-tight leading-tight" style={{ fontWeight: 700 }}>
              Your Favorite Brands,<br />
              Now in Your Budget
            </h1>
            
            <p className="text-xl md:text-2xl max-w-2xl" style={{ fontFamily: 'Crimson Pro, serif' }}>
              A daily roundup of the best designer deals worth your closet space.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
