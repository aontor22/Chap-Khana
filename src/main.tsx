import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ShopProvider } from './context/ShopContext';
import App from './App';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><BrowserRouter><ShopProvider><App /></ShopProvider></BrowserRouter></React.StrictMode>
);
