import { BrowserRouter, Link, Route, Routes } from 'react-router';
import { AuthProvider, useAuth } from './lib/auth';
import { DataProvider } from './lib/data';
import { Layout, Loading, btn } from './components/Layout';
import { Dashboard, Landing } from './pages/Home';
import { EventDetail, EventList } from './pages/Practice';
import { Session } from './pages/Session';
import { Progress, Results } from './pages/Results';
import { Admin } from './pages/Admin';
import { Study } from './pages/Study';

function NotFound() {
  return (
    <div className="py-16">
      <h1 className="font-wide text-3xl font-black text-navy-950">That page doesn’t exist</h1>
      <Link to="/" className={`${btn.navy} mt-6`}>Go home</Link>
    </div>
  );
}

function Shell() {
  const { status } = useAuth();
  if (status === 'loading') {
    return (
      <Routes><Route element={<Layout />}><Route path="*" element={<Loading />} /></Route></Routes>
    );
  }
  if (status === 'signedOut') {
    // Every page asks for sign-in first. The URL stays the same, so members land where they were headed.
    return (
      <Routes><Route element={<Layout />}><Route path="*" element={<Landing />} /></Route></Routes>
    );
  }
  return (
    <DataProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="practice" element={<EventList />} />
          <Route path="practice/:eventId" element={<EventDetail />} />
          <Route path="study/:eventId/:topic" element={<Study />} />
          <Route path="session" element={<Session />} />
          <Route path="results/:sessionId" element={<Results />} />
          <Route path="progress" element={<Progress />} />
          <Route path="admin" element={<Admin />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </DataProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Shell />
      </BrowserRouter>
    </AuthProvider>
  );
}
