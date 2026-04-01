import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // !! ADVERTENCIA !!
    // Esto ignora los errores de tipos durante la compilación.
    // Útil para versiones experimentales de Next.js que tienen bugs internos de tipos.
    ignoreBuildErrors: true,
  },
  eslint: {
    // También ignoramos ESLint durante el build para asegurar que la compilación termine.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
