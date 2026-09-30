/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  serverExternalPackages: ["nfc-pcsc", "@pokusew/pcsclite"],
};
export default nextConfig;
