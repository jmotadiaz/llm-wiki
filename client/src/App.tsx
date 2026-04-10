import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import IngestPage from './pages/IngestPage';
import ChatPage from './pages/ChatPage';
import WikiPage from './pages/WikiPage';
import WikiPageDetail from './pages/WikiPageDetail';
import RawSourcePage from './pages/RawSourcePage';
import GraphPage from './pages/GraphPage';
import DashboardPage from './pages/DashboardPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/ingest" element={<IngestPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/wiki" element={<WikiPage />} />
          <Route path="/wiki/:slug" element={<WikiPageDetail />} />
          <Route path="/raw/:id" element={<RawSourcePage />} />
          <Route path="/graph" element={<GraphPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
