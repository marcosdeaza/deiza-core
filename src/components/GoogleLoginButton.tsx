import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';

declare global {
  interface Window {
    google?: any;
  }
}

interface GoogleLoginButtonProps {
  onSuccess?: () => void;
}

const GoogleLoginButton = ({ onSuccess }: GoogleLoginButtonProps) => {
  const { login } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const buttonRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;

    const initGoogle = () => {
      if (!window.google || !buttonRef.current) return;

      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      if (!clientId) {
        console.error('VITE_GOOGLE_CLIENT_ID not configured');
        toast.error('Google Sign-In not configured. Check environment variables.');
        return;
      }

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredentialResponse,
      });

      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'pill',
        logo_alignment: 'left',
      });

      initialized.current = true;
    };

    if (window.google) {
      initGoogle();
    } else {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = initGoogle;
      document.head.appendChild(script);
    }
  }, []);

  const handleCredentialResponse = async (response: any) => {
    try {
      await login(response.credential);
      toast.success(t('auth.success'));
      if (onSuccess) {
        onSuccess();
      }
      navigate('/workspace');
    } catch {
      toast.error(t('auth.error'));
    }
  };

  return <div ref={buttonRef} className="flex justify-center" role="button" aria-label="Sign in with Google" />;
};

export default GoogleLoginButton;
