import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./index.css";
import { AuthProvider } from "./lib/auth";
import { Layout } from "./components/Layout";
import { RequireAuth } from "./components/RequireAuth";
import { Landing } from "./pages/Landing";
import { Signup } from "./pages/Signup";
import { Login } from "./pages/Login";
import { Onboarding } from "./pages/Onboarding";
import { Matching } from "./pages/Matching";
import { Results } from "./pages/Results";
import { Matches } from "./pages/Matches";
import { Explore } from "./pages/Explore";
import { Government } from "./pages/Government";
import { GovernmentVacancy } from "./pages/GovernmentVacancy";
import { Settings } from "./pages/Settings";
import { Privacy } from "./pages/Privacy";
import { Paused } from "./pages/Paused";
import { AdminLayout } from "./admin/AdminLayout";
import { AdminLogin } from "./admin/AdminLogin";
import { Overview } from "./admin/Overview";
import { Users } from "./admin/Users";
import { Jobs } from "./admin/Jobs";
import { GovernmentAdmin } from "./admin/GovernmentAdmin";
import { Usage } from "./admin/Usage";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Overview />} />
            <Route path="users" element={<Users />} />
            <Route path="jobs" element={<Jobs />} />
            <Route path="government" element={<GovernmentAdmin />} />
            <Route path="usage" element={<Usage />} />
          </Route>
          <Route element={<Layout />}>
            <Route path="/" element={<Landing />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/login" element={<Login />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/paused" element={<Paused />} />
            <Route path="/onboarding" element={<RequireAuth><Onboarding /></RequireAuth>} />
            <Route path="/matching" element={<RequireAuth><Matching /></RequireAuth>} />
            <Route path="/results" element={<RequireAuth><Results /></RequireAuth>} />
            <Route path="/matches" element={<RequireAuth><Matches /></RequireAuth>} />
            <Route path="/explore" element={<RequireAuth><Explore /></RequireAuth>} />
            <Route path="/government" element={<RequireAuth><Government /></RequireAuth>} />
            <Route path="/government/:id" element={<RequireAuth><GovernmentVacancy /></RequireAuth>} />
            <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
