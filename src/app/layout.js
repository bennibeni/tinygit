import "./globals.css";

export const metadata = {
  title: "TinyGit — impara Git sotto il cofano",
  description:
    "Un mini-Git giocattolo nel browser: oggetti content-addressed, staging area, branch e merge veri, con un percorso guidato in italiano.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
