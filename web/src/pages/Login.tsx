import { SignIn1 } from '@/components/ui/modern-stunning-sign-in';
import { post, setToken } from '../api';

export default function Login({ onDone }: { onDone: () => void }) {
  const submit = async (username: string, password: string) => {
    const { token } = await post<{ token: string }>('/api/admin/login', { username, password });
    setToken(token);
    onDone();
  };
  return <SignIn1 onSubmit={submit} />;
}
