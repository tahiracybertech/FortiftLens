import { RouterProvider } from 'react-router';
import { router } from './routes';
import { AuthProvider } from './context/AuthContext';
import { AppProvider } from './context/AppContext';
import { Toaster } from './components/ui/sonner';
import { useEffect } from 'react';

export default function App() {
  // Set page title
  useEffect(() => {
    document.title = 'FortifyLens - Secure SDLC Platform';
  }, []);

  // Clear any Supabase cached data on app load
  useEffect(() => {
    // Clear all Supabase-related localStorage items
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.includes('supabase') || key.includes('sb-'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));

    // Clear all Supabase-related sessionStorage items
    const sessionKeysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && (key.includes('supabase') || key.includes('sb-'))) {
        sessionKeysToRemove.push(key);
      }
    }
    sessionKeysToRemove.forEach(key => sessionStorage.removeItem(key));
  }, []);

  return (
    <AuthProvider>
      <AppProvider>
        <RouterProvider router={router} />
        <Toaster position="top-right" />
      </AppProvider>
    </AuthProvider>
  );
}