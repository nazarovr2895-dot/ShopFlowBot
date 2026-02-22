import { useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTelegramWebApp } from '../hooks/useTelegramWebApp';
import { DesktopBackNav } from './DesktopBackNav';

interface Section {
  id: string;
  title: string;
}

interface LegalPageLayoutProps {
  title: string;
  sections: Section[];
  children: ReactNode;
}

export function LegalPageLayout({ title, sections, children }: LegalPageLayoutProps) {
  const navigate = useNavigate();
  const { setBackButton } = useTelegramWebApp();

  useEffect(() => {
    setBackButton(true, () => navigate(-1));
    return () => setBackButton(false);
  }, [setBackButton, navigate]);

  return (
    <div className="legal-page">
      <DesktopBackNav title={title} />

      <div className="legal-page__container">
        <h1 className="legal-page__title">{title}</h1>

        <nav className="legal-page__toc">
          <h2 className="legal-page__toc-title">Содержание</h2>
          <ol className="legal-page__toc-list">
            {sections.map(({ id, title: sectionTitle }) => (
              <li key={id}>
                <a href={`#${id}`} className="legal-page__toc-link">
                  {sectionTitle}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="legal-page__content">
          {children}
        </div>

        <p className="legal-page__updated">
          Последнее обновление: 22 февраля 2026 г.
        </p>
      </div>
    </div>
  );
}
