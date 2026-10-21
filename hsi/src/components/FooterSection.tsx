export function FooterSection() {
  return (
    <footer className="footer">
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <img src="/logo.png" alt="Hollywood Studios" style={{ height: 32, width: 'auto', objectFit: 'contain' }} />
      </div>
      <div className="footer-links">
        <a href="#">Privacy</a>
        <a href="#">Terms</a>
        <a href="#">Contact</a>
        <a href="#">Twitter</a>
      </div>
      <div className="footer-copy">&copy; 2026 HSI.ai — All rights reserved.</div>
    </footer>
  );
}
