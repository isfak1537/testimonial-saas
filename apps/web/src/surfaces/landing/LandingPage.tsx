import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";
import { PRODUCT_NAME } from "@testimonial-saas/shared";
import "./landing.css";

// Copy rule: describe only planned MVP capabilities, never customers, logos,
// integrations, pricing or usage numbers. The development banner stays until I21
// confirms every claim matches shipped behaviour.

const FEATURES = [
  {
    title: "Shareable collection form",
    body: "Send customers a link to a mobile-friendly form with a few questions of your choosing and a clear consent statement.",
  },
  {
    title: "Review before anything is public",
    body: "Every submission starts private. Approve or reject it, then publish only approved testimonials with consent.",
  },
  {
    title: "Search, filter and tag",
    body: "Keep submissions organised in one inbox so the right testimonial is easy to find.",
  },
  {
    title: "Public Wall page",
    body: "Show your published testimonials on a simple public page for each Space.",
  },
  {
    title: "Embeddable widgets",
    body: "Add a grid or carousel of published testimonials to your own site with a small script.",
  },
  {
    title: "Team roles",
    body: "Add teammates who have an account as Admin, Editor or Viewer, each with clear permissions.",
  },
] as const;

const STEPS = [
  {
    title: "Create a Space",
    body: "Set up a Space for a product or brand and its collection form.",
  },
  {
    title: "Share your form",
    body: "Send the form link to customers by email, chat or anywhere else.",
  },
  {
    title: "Review and approve",
    body: "Read each submission privately and decide what to approve.",
  },
  {
    title: "Publish and embed",
    body: "Publish approved testimonials to your Wall and website widgets.",
  },
] as const;

function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        toggleRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="site-header">
      <div className="container site-header-inner">
        <Link to="/" className="brand">
          {PRODUCT_NAME}
        </Link>
        <button
          ref={toggleRef}
          type="button"
          className="menu-toggle"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={() => setMenuOpen((open) => !open)}
        >
          Menu
        </button>
        <nav aria-label="Main" id={menuId} className="site-nav" data-open={menuOpen}>
          <ul>
            <li>
              <a href="#features" onClick={closeMenu}>
                Features
              </a>
            </li>
            <li>
              <a href="#how-it-works" onClick={closeMenu}>
                How it works
              </a>
            </li>
            <li>
              <Link to="/login">Log in</Link>
            </li>
            <li>
              <Link to="/signup" className="button button-primary">
                Get started
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}

function ProductPreview() {
  return (
    <figure className="preview" data-testid="landing-preview">
      <div
        className="preview-frame"
        role="img"
        aria-label="Illustrative wireframe of an inbox of submissions next to an embedded testimonial grid"
      >
        <div className="preview-panel">
          <div className="preview-panel-title">Inbox</div>
          {["Pending", "Approved", "Pending"].map((status, index) => (
            <div className="preview-row" key={index}>
              <span className="skeleton skeleton-avatar" />
              <span className="preview-row-lines">
                <span className="skeleton skeleton-line" />
                <span className="skeleton skeleton-line short" />
              </span>
              <span className="preview-chip">{status}</span>
            </div>
          ))}
        </div>
        <div className="preview-panel">
          <div className="preview-panel-title">Widget</div>
          <div className="preview-grid">
            {[0, 1, 2, 3].map((index) => (
              <div className="preview-card" key={index}>
                <span className="skeleton skeleton-line" />
                <span className="skeleton skeleton-line" />
                <span className="skeleton skeleton-line short" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <figcaption>Illustrative preview — not real customer content.</figcaption>
    </figure>
  );
}

export default function LandingPage() {
  const year = new Date().getFullYear();

  return (
    <div className="landing">
      <div className="dev-banner" role="note" data-testid="dev-banner">
        <div className="container">
          <strong>Development preview.</strong> {PRODUCT_NAME} is under active development; the
          features below are planned for the first release and are not all available yet.
        </div>
      </div>

      <SiteHeader />

      <main>
        <section className="hero" data-testid="landing-hero" aria-labelledby="hero-title">
          <div className="container hero-inner">
            <h1 id="hero-title">Collect, review and share customer testimonials</h1>
            <p className="hero-lead">
              {PRODUCT_NAME} gives your team one place to ask customers for feedback, review every
              submission before it goes public, and show approved testimonials on your website.
            </p>
            <div className="hero-actions">
              <Link to="/signup" className="button button-primary">
                Get started
              </Link>
              <Link to="/login" className="button button-secondary">
                Log in
              </Link>
            </div>
          </div>
        </section>

        <section
          id="features"
          className="section"
          data-testid="landing-features"
          aria-labelledby="features-title"
        >
          <div className="container">
            <h2 id="features-title">What you can do</h2>
            <ul className="feature-grid">
              {FEATURES.map((feature) => (
                <li className="feature" key={feature.title}>
                  <h3>{feature.title}</h3>
                  <p>{feature.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          id="how-it-works"
          className="section section-alt"
          data-testid="landing-how-it-works"
          aria-labelledby="how-title"
        >
          <div className="container">
            <h2 id="how-title">How it works</h2>
            <ol className="steps">
              {STEPS.map((step) => (
                <li className="step" key={step.title}>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="section" aria-labelledby="preview-title">
          <div className="container">
            <h2 id="preview-title">A look at the product</h2>
            <ProductPreview />
          </div>
        </section>
      </main>

      <footer className="site-footer" data-testid="landing-footer">
        <div className="container site-footer-inner">
          <span className="brand">{PRODUCT_NAME}</span>
          <nav aria-label="Footer">
            <ul>
              <li>
                <Link to="/login">Log in</Link>
              </li>
              <li>
                <Link to="/signup">Sign up</Link>
              </li>
            </ul>
          </nav>
          <span className="footer-note">
            © {year} {PRODUCT_NAME}
          </span>
        </div>
      </footer>
    </div>
  );
}
