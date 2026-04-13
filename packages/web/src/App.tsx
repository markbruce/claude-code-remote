/**
 * Claude Code Remote - Web UI
 */

import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout, AuthGuard } from './components';
import { LoginPage, MachinesPage, ProjectsPage, SessionPage, SharedSessionPage } from './pages';
import { WorkspacePage } from './pages/WorkspacePage';
import { useAuthStore } from './stores';

const App: React.FC = () => {
  const { initialize, checkAuth, token } = useAuthStore();

  useEffect(() => {
    initialize();
    if (token) {
      checkAuth();
    }
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/"
          element={
            <AuthGuard>
              <Layout>
                <MachinesPage />
              </Layout>
            </AuthGuard>
          }
        />
        <Route
          path="/machines"
          element={
            <AuthGuard>
              <Layout>
                <MachinesPage />
              </Layout>
            </AuthGuard>
          }
        />
        <Route
          path="/machines/:machineId/projects"
          element={
            <AuthGuard>
              <Layout>
                <ProjectsPage />
              </Layout>
            </AuthGuard>
          }
        />

        {/* 新 IDE 风格工作区 */}
        <Route
          path="/workspace/:sessionId"
          element={
            <AuthGuard>
              <WorkspacePage />
            </AuthGuard>
          }
        />

        {/* 旧路由兼容 */}
        <Route
          path="/session/:sessionId"
          element={
            <AuthGuard>
              <Layout>
                <SessionPage />
              </Layout>
            </AuthGuard>
          }
        />

        {/* 会话分享（无需登录） */}
        <Route
          path="/shared/:shareToken"
          element={<SharedSessionPage />}
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
