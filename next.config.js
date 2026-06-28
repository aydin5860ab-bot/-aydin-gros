/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  async redirects() {
    return [
      {
        source: '/admin',
        destination: '/admin.html',
        permanent: true,
      },
      {
        source: '/pos',
        destination: '/pos.html',
        permanent: true,
      },
    ];
  }
};

module.exports = nextConfig;
