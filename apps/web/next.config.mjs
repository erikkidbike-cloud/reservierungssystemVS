/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The shared packages ship TypeScript source (no build step), so Next must
  // transpile them.
  transpilePackages: ['@vs/pricing', '@vs/domain', '@vs/documents'],
};

export default nextConfig;
