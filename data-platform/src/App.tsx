import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import Sidebar from "./components/Sidebar";
import WorkspaceHeader from "./components/WorkspaceHeader";
import CaseSearch from "./pages/CaseSearch";
import EvidencePage from "./pages/EvidencePage";
import { ComparisonProvider } from "./pages/vehicle-scores/ComparisonContext";
import Benchmark from "./pages/Benchmark";
import AcceptanceTesting from "./pages/AcceptanceTesting";
import Home from "./pages/Home";
import Results from "./pages/Results";
import History from "./pages/History";
import Database from "./pages/Database";
import TestCases from "./pages/TestCases";
import VectorManager from "./pages/VectorManager";
import NASBrowser from "./pages/NASBrowser";
import VehicleScores from "./pages/VehicleScores";
import VehiclePK from "./pages/VehiclePK";
import Login from "./pages/Login";
import Account from "./pages/Account";
import Settings from "./pages/Settings";
import AdminUsers from "./pages/AdminUsers";
import AdminAskaiLogs from "./pages/AdminAskaiLogs";
import Architecture from "./pages/Architecture";
import RequireAuth from "./components/RequireAuth";
import { LanguageProvider } from "./contexts/LanguageContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { useFocusTracker } from "./hooks/useFocusTracker";

/**
 * Shell：登录后的整体布局（sidebar + topbar + 路由出口）。
 * 单独抽出来是为了让 /login 这种「不需要 sidebar」的页面走另一套 layout。
 */
const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useFocusTracker(); // 全局网页聚焦时长跟踪
  return (
    <div className="app-shell flex h-[100dvh] bg-surface font-sans text-text-primary">
      <Sidebar />
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden relative">
        <WorkspaceHeader />
        <div className="workspace-scroll flex-1 overflow-auto relative">
          {children}
        </div>
      </main>
    </div>
  );
};

/** /login 路由的特殊处理：已登录的人直接送到首页（所有角色都有首页权限） */
const LoginRoute: React.FC = () => {
  const { isAuthed, bootstrapping, mustResetPwd } = useAuth();
  const location = useLocation();
  if (bootstrapping) return <Login />;
  if (isAuthed && !mustResetPwd) {
    const from = (location.state as any)?.from;
    return <Navigate to={from || "/"} replace />;
  }
  return <Login />;
};

const ProtectedRoutes: React.FC = () => {
  return (
    <RequireAuth>
      <ComparisonProvider>
        <AppShell>
          <Routes>
            {/* 查用例与可分享的证据入口 */}
            <Route path="/" element={<CaseSearch />} />
            <Route path="/evidence" element={<EvidencePage />} />
            {/* 旧视频分析控制台迁到 /console（仅 admin/analyst） */}
            <Route
              path="/console"
              element={
                <RequireAuth roles={["admin", "analyst"]}>
                  <Home />
                </RequireAuth>
              }
            />
            {/* 评测结果详情 / 历史记录：仅内部角色，不对 viewer/tester 开放 */}
            <Route
              path="/results/:id"
              element={
                <RequireAuth roles={["admin", "analyst"]}>
                  <Results />
                </RequireAuth>
              }
            />
            <Route
              path="/history"
              element={
                <RequireAuth roles={["admin", "analyst"]}>
                  <History />
                </RequireAuth>
              }
            />
            <Route
              path="/database"
              element={
                <RequireAuth roles={["admin", "analyst"]}>
                  <Database />
                </RequireAuth>
              }
            />
            {/* 标杆测评：对外开放的车型库 + 单车总览 + 测试视频 */}
            <Route
              path="/benchmark"
              element={
                <RequireAuth roles={["admin", "analyst", "viewer", "tester"]}>
                  <Benchmark />
                </RequireAuth>
              }
            />
            {/* 工具平台：软硬件介绍，对外开放 */}
            <Route
              path="/tool-platform"
              element={<Navigate to="/" replace />}
            />
            {/* 验收分析：基线与任务改进 */}
            <Route
              path="/acceptance-testing"
              element={
                <RequireAuth roles={["admin", "analyst", "viewer", "tester"]}>
                  <AcceptanceTesting />
                </RequireAuth>
              }
            />
            {/* 测试用例库：迁入「管理」组，不对 viewer 开放 */}
            <Route
              path="/test-cases"
              element={
                <RequireAuth roles={["admin", "analyst"]}>
                  <TestCases />
                </RequireAuth>
              }
            />
            <Route
              path="/vector-manager"
              element={
                <RequireAuth roles={["admin", "analyst"]}>
                  <VectorManager />
                </RequireAuth>
              }
            />
            <Route
              path="/nas"
              element={
                <RequireAuth roles={["admin", "analyst"]}>
                  <NASBrowser />
                </RequireAuth>
              }
            />
            {/* 车型评分 / 车型PK 独立入口仅内部角色；viewer 走标杆平台内嵌访问 */}
            <Route
              path="/vehicle-scores"
              element={
                <RequireAuth roles={["admin", "analyst"]}>
                  <VehicleScores />
                </RequireAuth>
              }
            />
            <Route
              path="/vehicle-pk"
              element={
                <RequireAuth roles={["admin", "analyst"]}>
                  <VehiclePK />
                </RequireAuth>
              }
            />
            <Route path="/drbee" element={<Navigate to="/" replace />} />
            <Route
              path="/drbee/sessions"
              element={<Navigate to="/" replace />}
            />
            <Route path="/account" element={<Account />} />
            <Route
              path="/admin/users"
              element={
                <RequireAuth roles={["admin"]}>
                  <AdminUsers />
                </RequireAuth>
              }
            />
            <Route
              path="/admin/askai-logs"
              element={
                <RequireAuth roles={["admin"]}>
                  <AdminAskaiLogs />
                </RequireAuth>
              }
            />
            {/* 报告平台入口：viewer 可进入但看到整页模糊遮罩(不开放)；tester/内部角色正常 */}
            <Route path="/reports" element={<Navigate to="/" replace />} />
            {/* 单个报告完整查看：不对 viewer 开放 */}
            <Route
              path="/reports/view/:id"
              element={<Navigate to="/" replace />}
            />
            {/* 模板规范编辑：仅内部角色 */}
            <Route
              path="/reports/templates"
              element={<Navigate to="/" replace />}
            />
            <Route
              path="/architecture"
              element={
                <RequireAuth roles={["admin", "analyst"]}>
                  <Architecture />
                </RequireAuth>
              }
            />
            <Route
              path="/settings"
              element={
                <RequireAuth roles={["admin"]}>
                  <Settings />
                </RequireAuth>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
      </ComparisonProvider>
    </RequireAuth>
  );
};

function App() {
  return (
    <Router basename={import.meta.env.BASE_URL.replace(/\/$/, "") || "/"}>
      <LanguageProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginRoute />} />
            <Route path="/*" element={<ProtectedRoutes />} />
          </Routes>
        </AuthProvider>
      </LanguageProvider>
    </Router>
  );
}

export default App;
