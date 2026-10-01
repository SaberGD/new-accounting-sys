import React, { useState } from 'react';
import { updatePassword } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { upsertDoc } from '../services/firestore';

const DEFAULT_PASSWORD = '123456';

// Shown instead of any protected page while the signed-in user's profile has
// mustChangePassword = true (set when an admin resets their password).
const ChangePassword: React.FC = () => {
  const { currentUser, refreshProfile, logout } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('كلمة المرور لازم تكون 6 أحرف على الأقل / Password must be at least 6 characters.');
      return;
    }
    if (password === DEFAULT_PASSWORD) {
      setError('لا يمكن استخدام كلمة المرور الافتراضية / You cannot reuse the default password.');
      return;
    }
    if (password !== confirm) {
      setError('كلمتا المرور غير متطابقتين / Passwords do not match.');
      return;
    }
    if (!auth.currentUser || !currentUser) return;

    setIsSaving(true);
    try {
      await updatePassword(auth.currentUser, password);
      await upsertDoc('users', currentUser.uid, { mustChangePassword: false });
      await refreshProfile();
    } catch (err: any) {
      console.error('Change password failed:', err);
      if (err.code === 'auth/requires-recent-login') {
        setError('من فضلك سجل خروج وادخل تاني بكلمة المرور 123456 ثم أعد المحاولة / Please sign out, sign in again with 123456, then retry.');
      } else if (err.code === 'auth/weak-password') {
        setError('كلمة المرور ضعيفة / Password is too weak.');
      } else {
        setError(`فشل تغيير كلمة المرور / Failed to change password: ${err.message || 'Unknown error'}`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="sg-accounting-login min-h-screen flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-900 px-4 py-10">
      <div className="sg-accounting-login-card max-w-md w-full bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-2xl">
        <img className="sg-accounting-login-logo" src="/saber-group-logo.png" alt="Saber Group" />
        <h1 className="text-2xl font-bold text-center mb-2">تغيير كلمة المرور / Change Password</h1>
        <p className="text-gray-500 dark:text-gray-400 text-center mb-8 text-sm">
          تم إعادة تعيين كلمة المرور بواسطة الأدمن. اختار كلمة مرور جديدة للمتابعة.
          <br />
          Your password was reset by an admin. Choose a new password to continue.
        </p>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-4 mb-6 rounded shadow-sm">
            <p className="text-sm text-red-700 dark:text-red-300 font-medium">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">كلمة المرور الجديدة / New Password</label>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 border rounded-xl dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 outline-none transition-all dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">تأكيد كلمة المرور / Confirm Password</label>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full p-3 border rounded-xl dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 outline-none transition-all dark:text-white"
            />
          </div>
          <button
            type="submit"
            disabled={isSaving}
            className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 rounded-xl shadow-lg transition-all disabled:opacity-60 flex items-center justify-center"
          >
            {isSaving ? <><i className="fas fa-spinner fa-spin mr-2"></i> جاري الحفظ...</> : 'حفظ كلمة المرور / Save Password'}
          </button>
          <button type="button" onClick={logout} className="w-full text-xs font-bold text-gray-500 hover:text-primary-600">
            تسجيل الخروج / Sign out
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChangePassword;
