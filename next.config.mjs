/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "gelato-api-live.s3.eu-west-1.amazonaws.com" }],
  },
};
export default nextConfig;
