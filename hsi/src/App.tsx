import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { NavBar } from './components/NavBar';
import { HeroSection } from './components/HeroSection';
import { BrainSection } from './components/BrainSection';
import { AnalysisSection } from './components/AnalysisSection';
import { PersonaSection } from './components/PersonaSection';
import { StatsSection } from './components/StatsSection';
import { CreatorsSection } from './components/CreatorsSection';
import { UpdatesSection } from './components/UpdatesSection';
import { CTASection } from './components/CTASection';
import { FooterSection } from './components/FooterSection';
import { PersonaPopup } from './components/PersonaPopup';
import { PersonaProvider } from './personaContext';
import { LoginPage } from './components/LoginPage';
import { ApplicationPage } from './components/ApplicationPage';
import { NetworkPage } from './components/NetworkPage';
import { ProfilePage } from './components/ProfilePage';
import { VaultPage } from './components/VaultPage';
import { VaultScriptPage, VaultWorkspacePage } from './components/VaultItemPages';
import { SharedViewPage } from './components/SharedViewPage';
import { EntityPage } from './components/EntityPage';
import { CompanyPage } from './components/company/CompanyPage';
import { CompanyEditor } from './components/company/CompanyEditor';
import { PeoplePage } from './components/PeoplePage';
import { MessagesPage } from './components/MessagesPage';
import { SearchPage } from './components/SearchPage';
import { ProjectsPage } from './components/ProjectsPage';
import { AnalyticsPage } from './components/AnalyticsPage';
import { AppLayout } from './components/AppLayout';

// Unlisted deck — lazy so pdf.js stays out of the main bundle.
const ExecutiveSummaryPage = lazy(() => import('./components/DeckViewerPage'));

function LandingPage() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add('in-view');
        });
      },
      { threshold: 0.15 },
    );
    document.querySelectorAll('section:not(.hero)').forEach((el) => observer.observe(el));

    const onScroll = () => {
      const viewH = window.innerHeight;
      document.querySelectorAll('.phrase-highlight').forEach((el) => {
        const rect = (el as HTMLElement).getBoundingClientRect();
        const start = viewH * 0.82;
        const end = viewH * 0.45;
        const progress = Math.max(0, Math.min(1, (start - rect.top) / (start - end)));
        (el as HTMLElement).style.backgroundSize = `${progress * 100}% 100%`;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  return (
    <PersonaProvider>
      <NavBar />
      <HeroSection />
      <PersonaPopup />
      <BrainSection />
      <AnalysisSection />
      <PersonaSection />
      <StatsSection />
      <CreatorsSection />
      <UpdatesSection />
      <CTASection />
      <FooterSection />
    </PersonaProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/apply" element={<ApplicationPage />} />
        <Route path="/search" element={<AppLayout><SearchPage /></AppLayout>} />
        <Route path="/projects" element={<AppLayout><ProjectsPage /></AppLayout>} />
        <Route path="/analytics" element={<AppLayout><AnalyticsPage /></AppLayout>} />
        <Route path="/network" element={<AppLayout><NetworkPage /></AppLayout>} />
        <Route path="/people" element={<AppLayout><PeoplePage /></AppLayout>} />
        <Route path="/messages" element={<AppLayout><MessagesPage /></AppLayout>} />
        <Route path="/profile/:handle" element={<AppLayout><ProfilePage /></AppLayout>} />
        <Route path="/vault" element={<AppLayout><VaultPage /></AppLayout>} />
        <Route path="/vault/script/:slug" element={<AppLayout><VaultScriptPage /></AppLayout>} />
        <Route path="/vault/workspace/:slug" element={<AppLayout><VaultWorkspacePage /></AppLayout>} />
        <Route path="/view/:token" element={<SharedViewPage />} />
        <Route path="/executive-summary" element={<Suspense fallback={null}><ExecutiveSummaryPage /></Suspense>} />
        <Route path="/movie/:slug" element={<AppLayout><EntityPage type="movie" /></AppLayout>} />
        <Route path="/tvshow/:slug" element={<AppLayout><EntityPage type="tvshow" /></AppLayout>} />
        <Route path="/company/new" element={<AppLayout><CompanyEditor /></AppLayout>} />
        <Route path="/company/:slug" element={<AppLayout><CompanyPage /></AppLayout>} />
        <Route path="/company/:slug/edit" element={<AppLayout><CompanyEditor /></AppLayout>} />
        <Route path="/music/:slug" element={<AppLayout><EntityPage type="music" /></AppLayout>} />
      </Routes>
    </BrowserRouter>
  );
}
