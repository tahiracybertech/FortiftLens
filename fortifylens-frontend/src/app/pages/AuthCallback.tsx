import { useEffect } from 'react';
import { useNavigate } from 'react-router';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/login');
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0A1F44] to-[#050F22] flex items-center justify-center">
      <p className="text-white">Redirecting...</p>
    </div>
  );
}
