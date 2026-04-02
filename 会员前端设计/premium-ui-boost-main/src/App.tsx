import { useState, useCallback } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/hooks/use-theme";
import SplashScreen from "@/components/member/SplashScreen";
import PageTransition from "@/components/member/PageTransition";

import LoginPage from "./pages/LoginPage.tsx";
import MemberDashboard from "./pages/member/MemberDashboard.tsx";
import MemberPoints from "./pages/member/MemberPoints.tsx";
import MemberSpin from "./pages/member/MemberSpin.tsx";
import MemberInvite from "./pages/member/MemberInvite.tsx";
import MemberSettings from "./pages/member/MemberSettings.tsx";
import MemberWallet from "./pages/member/MemberWallet.tsx";
import MemberOrders from "./pages/member/MemberOrders.tsx";
import MemberNotifications from "./pages/member/MemberNotifications.tsx";
import MemberProfile from "./pages/member/MemberProfile.tsx";
import MemberOnboarding from "./pages/member/MemberOnboarding.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<PageTransition><LoginPage /></PageTransition>} />
        <Route path="/login" element={<PageTransition><LoginPage /></PageTransition>} />
        <Route path="/member/dashboard" element={<PageTransition><MemberDashboard /></PageTransition>} />
        <Route path="/member/points" element={<PageTransition><MemberPoints /></PageTransition>} />
        <Route path="/member/spin" element={<PageTransition><MemberSpin /></PageTransition>} />
        <Route path="/member/invite" element={<PageTransition><MemberInvite /></PageTransition>} />
        <Route path="/member/settings" element={<PageTransition><MemberSettings /></PageTransition>} />
        <Route path="/member/wallet" element={<PageTransition><MemberWallet /></PageTransition>} />
        <Route path="/member/orders" element={<PageTransition><MemberOrders /></PageTransition>} />
        <Route path="/member/notifications" element={<PageTransition><MemberNotifications /></PageTransition>} />
        <Route path="/member/profile" element={<PageTransition><MemberProfile /></PageTransition>} />
        <Route path="/member/onboarding" element={<PageTransition><MemberOnboarding /></PageTransition>} />
        <Route path="*" element={<PageTransition><NotFound /></PageTransition>} />
      </Routes>
    </AnimatePresence>
  );
}

const App = () => {
  const [splashDone, setSplashDone] = useState(false);
  const handleSplashComplete = useCallback(() => setSplashDone(true), []);

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          {!splashDone && <SplashScreen onComplete={handleSplashComplete} />}
          <BrowserRouter>
            <AnimatedRoutes />
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
};

export default App;
