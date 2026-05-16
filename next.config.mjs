/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "image.spreadshirtmedia.com" },
      { protocol: "https", hostname: "image.spreadshirtmedia.net" },
      { protocol: "https", hostname: "*.spreadconnect.app" },
    ],
  },
};
export default nextConfig;
