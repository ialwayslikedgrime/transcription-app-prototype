/** @type {import('next').NextConfig} */
const nextConfig = {
  // Increase size limit for API routes and server actions
  experimental: {
    serverActions: {
      bodySizeLimit: '25mb', // Increased to 25MB to handle larger audio files
    },
  },
  
  // Optional: Configure image domains if you're displaying images from external sources
  images: {
    domains: [],
  },
  
  // Optional: Configure headers if needed
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
    ];
  },
  
  // Optional: Add rewrites for API proxying if needed
  async rewrites() {
    return [];
  },
  
  // Configures webpack if you need custom loaders or rules
  webpack: (config, { isServer }) => {
    // Add any custom webpack configuration here if needed
    return config;
  },
};

module.exports = nextConfig;