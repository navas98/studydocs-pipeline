import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import App from './App';
import Home from './pages/Home';
import Demo from './pages/Demo';
import Decisions from './pages/Decisions';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<App />}>
          <Route index element={<Home />} />
          <Route path="demo" element={<Demo />} />
          <Route path="decisions" element={<Decisions />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
