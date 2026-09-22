import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import ColdStartBanner from './components/ColdStartBanner';
import Home from './pages/Home';
import Profiles from './pages/Profiles';
import Dashboard from './pages/Dashboard';

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <div className="app-wrapper">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/group/:id" element={<Profiles />} />
              <Route path="/group/:id/dashboard" element={<Dashboard />} />
            </Routes>
            <ColdStartBanner />
          </div>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}
