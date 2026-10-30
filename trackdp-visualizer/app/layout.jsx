import "./globals.css";

export const metadata = {
  title: "trackdp Visualizer",
  description:
    "Visualize traceroute output streamed from the trackdp trackdp-agent over WebSocket.",
  applicationName: "visualizer",
  other: {
    trackdp: "trackdp-visualizer",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
