import { Geist } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/AuthContext";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

export const metadata = {
  title: "NeuroDent",
  description: "Стоматологиялық клиника CRM жүйесі",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru" className={geist.variable}>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
