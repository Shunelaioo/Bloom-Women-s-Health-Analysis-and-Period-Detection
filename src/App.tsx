import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Landing from "./pages/Landing";
import AuthForm from "./pages/AuthForm";
import ForgotPassword from "./pages/ForgotPassword";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import Index from "./pages/Index";
import Tracking from "./pages/Tracking";
import Insights from "./pages/Insights";
import History from "./pages/History";
import Profile from "./pages/Profile";
import Checker from "./pages/Checker";
import Notifications from "./pages/Notifications";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/ProtectedRoute";
import VerifiedRoute from "./components/VerifiedRoute";
import CycleChatbot from "./components/CycleChatbot";
import EmailVerificationBanner from "./components/EmailVerificationBanner";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";

const queryClient = new QueryClient();

const ChatbotGuard = () => {
  const location = useLocation();
  const hasLocalToken = Boolean(localStorage.getItem("token"));
  const isPublicRoute = ["/welcome", "/login", "/auth"].includes(location.pathname);
  const { isVerified } = useCurrentUser();

  if (!hasLocalToken || isPublicRoute || isVerified !== true) return null;
  return <CycleChatbot />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <NotificationProvider>
          <Routes>
            <Route path="/welcome" element={<Landing />} />
            <Route path="/login" element={<AuthForm />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/auth" element={<AuthForm />} />

            <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/home" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/tracking" element={<ProtectedRoute><Tracking /></ProtectedRoute>} />
            <Route path="/checker" element={<VerifiedRoute><Checker /></VerifiedRoute>} />
            <Route path="/insights" element={<VerifiedRoute><Insights /></VerifiedRoute>} />
            <Route path="/history" element={<ProtectedRoute><History /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          <EmailVerificationBanner />
          <ChatbotGuard />
        </NotificationProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
