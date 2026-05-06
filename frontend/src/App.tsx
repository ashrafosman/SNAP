import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { RoleProvider } from './context/RoleContext';
import { AppConfigProvider } from './context/AppConfigContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import CaseQueue from './pages/CaseQueue';
import CaseDetail from './pages/CaseDetail';
import AIAssistant from './pages/AIAssistant';
import PipelineMonitor from './pages/PipelineMonitor';
import Settings from './pages/Settings';
import DataCatalog from './pages/DataCatalog';

export default function App() {
  return (
    <BrowserRouter>
      <AppConfigProvider>
        <RoleProvider>
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/queue" element={<CaseQueue />} />
              <Route path="/cases/:id" element={<CaseDetail />} />
              <Route path="/chat" element={<AIAssistant />} />
              <Route path="/pipeline" element={<PipelineMonitor />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/catalog" element={<DataCatalog />} />
            </Routes>
          </Layout>
        </RoleProvider>
      </AppConfigProvider>
    </BrowserRouter>
  );
}
