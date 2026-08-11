// Flat matte black backdrop. Rendered once at the app root so it never
// re-mounts as routes change.
export default function AmbientBackground() {
  return <div className="ambient-bg" aria-hidden="true" />;
}
