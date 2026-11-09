/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["three"],
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
