import { useEffect, useState } from "react";
import {
  BarChart3,
  BookOpen,
  Check,
  ChevronRight,
  GraduationCap,
  Settings2,
  Spade,
  X,
} from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { TrainPage } from "./pages/TrainPage";
import { PlayPage } from "./pages/PlayPage";
import { StrategyPage } from "./pages/StrategyPage";
import { StatsPage } from "./pages/StatsPage";
import { Settings } from "./pages/Settings";
import { useStore } from "./state";

const TABS = [
  { id: "train", label: "Training", icon: GraduationCap },
  { id: "play", label: "Spielen", icon: Spade },
  { id: "strategy", label: "Strategie", icon: BookOpen },
  { id: "stats", label: "Statistik", icon: BarChart3 },
] as const;
type Tab = (typeof TABS)[number]["id"];
const readTab = () =>
  TABS.some((t) => `#${t.id}` === location.hash)
    ? (location.hash.slice(1) as Tab)
    : "train";
export default function App() {
  const [tab, setTab] = useState<Tab>(readTab);
  const [settings, setSettings] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const { notice, setNotice } = useStore();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady],
    updateServiceWorker,
  } = useRegisterSW();
  useEffect(() => {
    const hash = () => {
      setTab(readTab());
      window.scrollTo(0, 0);
    };
    const connectivity = () => setOnline(navigator.onLine);
    window.addEventListener("hashchange", hash);
    window.addEventListener("online", connectivity);
    window.addEventListener("offline", connectivity);
    return () => {
      window.removeEventListener("hashchange", hash);
      window.removeEventListener("online", connectivity);
      window.removeEventListener("offline", connectivity);
    };
  }, []);
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Zum Inhalt
      </a>
      <header className="site-header">
        <a
          href="#train"
          className="brand"
          aria-label="European Blackjack Trainer – Training"
        >
          <span className="brand-mark">
            <Spade size={24} fill="currentColor" />
          </span>
          <span>
            <strong>EUROPEAN BLACKJACK</strong>
            <small>T R A I N E R</small>
          </span>
        </a>
        <nav className="desktop-nav" aria-label="Hauptnavigation">
          {TABS.map((t) => (
            <a
              key={t.id}
              href={`#${t.id}`}
              className={tab === t.id ? "active" : ""}
              aria-current={tab === t.id ? "page" : undefined}
            >
              <t.icon size={17} />
              {t.label}
            </a>
          ))}
        </nav>
        <div className="header-tools">
          <span className="local-status">
            <span className="status-dot" />
            {!online
              ? "Offline"
              : offlineReady
                ? "Offline bereit"
                : "Lokal gespeichert"}
          </span>
          <button
            className="icon-button settings-button"
            aria-label="Einstellungen öffnen"
            onClick={() => setSettings(true)}
          >
            <Settings2 size={20} />
          </button>
        </div>
      </header>
      <div className="rules-strip">
        <div>
          <span className="status-dot" />
          <strong>Wiesbaden Rules</strong>
          <span className="rules-details">
            6 Decks <i /> ENHC <i /> S17 <i /> D9–11 <i /> DAS
          </span>
        </div>
        <button onClick={() => setSettings(true)}>
          Regelprofil <ChevronRight size={14} />
        </button>
      </div>
      {notice && (
        <div className="notice" role="status">
          <span>{notice}</span>
          <button
            className="icon-button"
            aria-label="Hinweis schließen"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {needRefresh && (
        <div className="notice">
          <span>
            Eine neue Version ist bereit. Dein Spielstand bleibt gespeichert.
          </span>
          <button
            className="text-button"
            onClick={() => updateServiceWorker(true)}
          >
            Aktualisieren <Check size={15} />
          </button>
          <button
            className="icon-button"
            aria-label="Später aktualisieren"
            onClick={() => setNeedRefresh(false)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <main id="main-content" tabIndex={-1} key={epoch}>
        <div hidden={tab !== "train"}>
          <TrainPage active={tab === "train" && !settings} />
        </div>
        <div hidden={tab !== "play"}>
          <PlayPage active={tab === "play" && !settings} />
        </div>
        {tab === "strategy" && <StrategyPage />}
        {tab === "stats" && <StatsPage />}
      </main>
      <footer className="site-footer">
        <span>Ein guter Spielzug bleibt gut. Auch wenn die Hand verliert.</span>
        <button onClick={() => setSettings(true)}>
          Über dieses Lernprojekt <ChevronRight size={13} />
        </button>
      </footer>
      <nav className="mobile-nav" aria-label="Mobile Hauptnavigation">
        {TABS.map((t) => (
          <a
            key={t.id}
            href={`#${t.id}`}
            className={tab === t.id ? "active" : ""}
            aria-current={tab === t.id ? "page" : undefined}
          >
            <t.icon size={21} />
            <span>{t.label}</span>
          </a>
        ))}
      </nav>
      {settings && (
        <Settings
          onClose={() => setSettings(false)}
          onReset={() => setEpoch((e) => e + 1)}
        />
      )}
    </div>
  );
}
