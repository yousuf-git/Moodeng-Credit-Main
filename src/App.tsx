import { useEffect } from 'react';
import posthog from 'posthog-js';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';

import Footer from '@/components/Footer';
import Header from '@/components/Header/Header';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { WalletLoadingOverlay } from '@/components/loading/WalletLoadingOverlay';
import { type RootState } from '@/store/store';

import Benefits from '@/app/benefits/page';
import Dashboard from '@/app/dashboard/page';
import FAQ from '@/app/faq/page';
import ForgotPassword from '@/app/forgot-password/page';
import Guide from '@/app/guide/page';
import Login from '@/app/login/page';
import SignUp from '@/app/signup/page';
import AuthConfirm from '@/app/auth/confirm/page';
import AuthSuccess from '@/app/auth-success/page';
// Import pages
import Home from '@/app/page';
import Profile from '@/app/profile/page';
import ResetPassword from '@/app/reset-password/page';
import Simple from '@/app/simple/page';
import Test from '@/app/test/page';
import UserProfile from '@/app/user/[username]/page';
import Ut from '@/app/ut/page';
import WhyLend from '@/app/whylend/page';

function Layout({ children }: { children: React.ReactNode }) {
   return (
      <div className="flex flex-col min-h-screen">
         <Header />
         <main className="flex-grow">{children}</main>
         <Footer />
      </div>
   );
}

export default function App() {
   const location = useLocation();
   const isPosthogEnabled = import.meta.env.PROD && Boolean(import.meta.env.VITE_PUBLIC_POSTHOG_KEY);
   const { user, username } = useSelector((state: RootState) => state.auth);

   useEffect(() => {
      if (!isPosthogEnabled) {
         return;
      }

      posthog.capture('$pageview', {
         $current_url: window.location.href
      });
   }, [isPosthogEnabled, location]);

   useEffect(() => {
      if (!isPosthogEnabled) {
         return;
      }

      if (user?.id) {
         posthog.identify(user.id, {
            email: user.email,
            username: user.username || username
         });
         return;
      }

      posthog.reset();
   }, [isPosthogEnabled, user?.email, user?.id, user?.username, username]);

   return (
      <>
         <WalletLoadingOverlay />
         <Routes>
            <Route
               path="/"
               element={
                  <Layout>
                     <Home />
                  </Layout>
               }
            />
            <Route
               path="/dashboard"
               element={
                  <ProtectedRoute>
                     <Dashboard />
                  </ProtectedRoute>
               }
            />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<SignUp />} />
            <Route
               path="/faq"
               element={
                  <Layout>
                     <FAQ />
                  </Layout>
               }
            />
            <Route
               path="/guide"
               element={
                  <Layout>
                     <Guide />
                  </Layout>
               }
            />
            <Route
               path="/profile"
               element={
                  <ProtectedRoute>
                     <Layout>
                        <Profile />
                     </Layout>
                  </ProtectedRoute>
               }
            />
            <Route
               path="/forgot-password"
               element={
                  <Layout>
                     <ForgotPassword />
                  </Layout>
               }
            />
            <Route
               path="/reset-password"
               element={
                  <Layout>
                     <ResetPassword />
                  </Layout>
               }
            />
            <Route path="/auth-success" element={<AuthSuccess />} />
            <Route path="/auth/confirm" element={<AuthConfirm />} />
            <Route
               path="/benefits"
               element={
                  <Layout>
                     <Benefits />
                  </Layout>
               }
            />
            <Route
               path="/whylend"
               element={
                  <Layout>
                     <WhyLend />
                  </Layout>
               }
            />
            <Route
               path="/simple"
               element={
                  <Layout>
                     <Simple />
                  </Layout>
               }
            />
            <Route
               path="/test"
               element={
                  <Layout>
                     <Test />
                  </Layout>
               }
            />
            <Route path="/user/:username" element={<UserProfile />} />
            <Route
               path="/ut"
               element={
                  <Layout>
                     <Ut />
                  </Layout>
               }
            />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
         </Routes>
      </>
   );
}
