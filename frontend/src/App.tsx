import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import SprintBoard from './pages/SprintBoard';
import StoryContext from './pages/StoryContext';
import ExecutionMonitor from './pages/ExecutionMonitor';
import RepoRegistry from './pages/RepoRegistry';
import RunHistory from './pages/RunHistory';
import Settings from './pages/Settings';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<SprintBoard />} />
          <Route path="/story/:storyId" element={<StoryContext />} />
          <Route path="/configure" element={<StoryContext />} />
          <Route path="/run/:runId" element={<ExecutionMonitor />} />
          <Route path="/repos" element={<RepoRegistry />} />
          <Route path="/history" element={<RunHistory />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
