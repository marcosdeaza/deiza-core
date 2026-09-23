import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const Code = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    const plan = user?.plan || 'free';
    if (plan === 'free') {
      toast.info('Deiza Code está reservado para planes de pago.', {
        action: { label: 'Ver planes', onClick: () => navigate('/plans') },
      });
      navigate('/plans');
    } else {
      window.location.href = '/opencode/';
    }
  }, [user, navigate]);

  return null;
};

export default Code;
