/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Compile the shared workspace package from TypeScript source.
  transpilePackages: ["@vertix/shared"],
};

export default nextConfig;
