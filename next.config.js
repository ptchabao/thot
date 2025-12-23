/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Mode standalone pour Docker
  output: 'standalone',
  webpack: (config, { isServer }) => {
    // Exclure ssh2 et ses dépendances natives du bundling côté client
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
      };
    }
    
    // Ignorer les fichiers .node (binaires natifs) dans node_modules
    config.module.rules.push({
      test: /\.node$/,
      include: /node_modules/,
      use: 'ignore-loader',
    });

    return config;
  },
}

module.exports = nextConfig

