import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { useTheme } from './utils/useTheme'
import ThemeToggle from './components/ThemeToggle'
import ErrorBoundary from './components/ErrorBoundary'
import { IconFilm } from './components/Icons'
import TemplateListPage from './pages/TemplateListPage'
import EditorPage from './pages/EditorPage'
import DigitalHumanListPage from './pages/DigitalHumanListPage'
import DigitalHumanDetailPage from './pages/DigitalHumanDetailPage'
import RenderResultPage from './pages/RenderResultPage'
import PersonalCenterPage from './pages/PersonalCenterPage'
import DebugPage from './pages/DebugPage'
import AssetHubPage from './pages/AssetHubPage'
import ApiToastHost from './components/ApiToast'

function NavBar() {
  const location = useLocation()
  const path = location.pathname

  const isEditorOrRender = path.startsWith('/editor') || path.startsWith('/render')

  const isNavActive = (href: string) => {
    if (href === '/') {
      return (path === '/' || path === '') && !isEditorOrRender
    }
    return path === href || path.startsWith(`${href}/`)
  }

  const linkCls = (href: string) =>
    `text-sm px-3 py-1.5 rounded-md no-underline transition-colors ${
      isNavActive(href)
        ? 'bg-accent text-accent-foreground font-medium'
        : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
    }`

  return (
    <nav className="bg-card border-b border-border px-4 flex items-center gap-2 h-11 shrink-0">
      <Link to="/" className="font-medium text-[18px] text-foreground no-underline flex items-center gap-2 mr-2">
        <IconFilm size={18} />
        <span>数字人导购</span>
      </Link>
      <Link to="/" className={linkCls('/')}>模板中心</Link>
      <Link to="/assets" className={linkCls('/assets')}>资产库</Link>
      <Link to="/my-videos" className={linkCls('/my-videos')}>我的视频</Link>
      <div className="flex-1" />
      <ThemeToggle />
    </nav>
  )
}

export default function App() {
  useTheme()

  return (
    <div className="min-h-screen bg-background text-foreground">
      <NavBar />
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<TemplateListPage />} />
          <Route path="/editor/:id" element={<EditorPage />} />
          <Route path="/assets" element={<AssetHubPage />} />
          <Route path="/digital-humans" element={<DigitalHumanListPage />} />
          <Route path="/digital-humans/:id" element={<DigitalHumanDetailPage />} />
          <Route path="/render/:id" element={<RenderResultPage />} />
          <Route path="/my-videos" element={<PersonalCenterPage />} />
          <Route path="/debug" element={<DebugPage />} />
        </Routes>
      </ErrorBoundary>
      <ApiToastHost />
    </div>
  )
}