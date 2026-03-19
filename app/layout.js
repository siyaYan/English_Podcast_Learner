import "./globals.css";

export const metadata = {
  title: "English Podcast Learner",
  description:
    "Turn podcast transcripts into level-aware summaries, vocabulary takeaways, and quizzes.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
