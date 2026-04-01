import "./globals.css";

export const metadata = {
  title: "GanaPlay Diseño",
  description: "Communication platform for Designers and Digital Traffickers",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <head>
        <link rel="icon" href="/logo.png" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
