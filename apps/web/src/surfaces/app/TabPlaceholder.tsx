export function TabPlaceholder({ title }: { title: string }) {
  return (
    <section aria-labelledby="tab-title">
      <h2 id="tab-title">{title}</h2>
      <p className="muted">This section is not available yet.</p>
    </section>
  );
}
