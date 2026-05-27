import "./globals.css";

// Nota: el favicon se genera automáticamente desde app/icon.jpg
// (convención de Next.js App Router). No hace falta <link rel="icon">.
export const metadata = {
  title: "GanaPlay Diseño",
  description: "Plataforma de solicitudes creativas — GanaPlay",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        {children}
      </body>
    </html>
  );
}
