/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone-Output für schlanke Docker-Images
  output: "standalone",
  images: {
    // Lokale Uploads & S3/MinIO werden über eigene Loader/Route ausgeliefert.
    remotePatterns: [],
  },
  // sharp (Bildpipeline) & archiver (ZIP-Downloads) laden interne Dateien
  // dynamisch nach — daher nicht durch Webpack bündeln lassen.
  serverExternalPackages: ["sharp", "archiver"],
};

export default nextConfig;
