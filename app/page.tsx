// Root landing page. The real flow lives at /r/[slug] (reached by tapping an
// NFC card). This page is just a friendly explainer for anyone who lands here.
export default function Home() {
  return (
    <main className="screen">
      <div className="center-card">
        <div className="big-emoji">📲</div>
        <h1>Tap to Share</h1>
        <p>
          Tap a restaurant&apos;s NFC card to open its share page, then grab a
          ready-to-post caption for your favorite platform.
        </p>
      </div>
    </main>
  );
}
