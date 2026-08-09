import type { ReactNode } from "react";

type ErrorPageShellProps = {
  code: string;
  eyebrow: string;
  title: string;
  description: string;
  primaryAction?: ReactNode;
  secondaryHref?: string;
  secondaryLabel?: string;
};

export function ErrorPageShell({
  code,
  eyebrow,
  title,
  description,
  primaryAction,
  secondaryHref = "/blog",
  secondaryLabel = "Explore our thinking",
}: ErrorPageShellProps) {
  return (
    <div className="error-page-root">
      <header className="site-header error-site-header" aria-label="Main navigation">
        <a className="brand" href="/" aria-label="Digital Commerce Coalition home">
          <img
            className="brand-logo"
            src="/assets/Dcc_logo.svg"
            alt="Digital Commerce Coalition"
          />
        </a>

        <nav className="nav-links" aria-label="Sections">
          <a href="/#about" data-label="About">About</a>
          <a href="/#focus" data-label="Focus Areas">Focus Areas</a>
          <a href="/#work" data-label="How We Work">How We Work</a>
          <a href="/blog" data-label="Thinking">Thinking</a>
        </nav>
      </header>

      <main className="error-main">
        <div className="diamond-rails" aria-hidden="true">
          <span />
          <span />
        </div>

        <section className="error-page" aria-labelledby="error-page-title">
          <div className="error-code-panel" aria-hidden="true">
            <span className="error-code">{code}</span>
            <i className="error-orbit error-orbit-one" />
            <i className="error-orbit error-orbit-two" />
            <i className="error-orbit error-orbit-three" />
          </div>

          <div className="error-copy">
            <p className="error-eyebrow">{eyebrow}</p>
            <h1 id="error-page-title">{title}</h1>
            <p>{description}</p>
            <div className="error-actions">
              {primaryAction ?? <a className="error-button error-button-primary" href="/">Return home</a>}
              <a className="error-button error-button-secondary" href={secondaryHref}>{secondaryLabel}</a>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer error-footer">
        <div className="footer-left">
          <img
            className="brand-logo footer-logo"
            src="/assets/Dcc_logo.svg"
            alt="Digital Commerce Coalition"
          />
          <p>© 2026 Digital Commerce Coalition. All rights reserved.</p>
        </div>

        <div className="footer-right">
          <a
            href="mailto:secretariat@digitalcommercecoalition.com"
            className="error-footer-contact"
          >
            Need help finding something?<br />
            <strong>Contact the Secretariat</strong>
          </a>
        </div>
      </footer>
    </div>
  );
}
