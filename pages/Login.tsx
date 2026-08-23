
import React, { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Link, useNavigate } from 'react-router-dom';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isGoogleLoggingIn, setIsGoogleLoggingIn] = useState(false);
  const { authError, setAuthError, currentUser, userProfile, gateStatus, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Redirect to dashboard if already fully authenticated and allowed
  useEffect(() => {
    if (currentUser && userProfile && gateStatus === 'allowed') {
      navigate('/');
    }
  }, [currentUser, userProfile, gateStatus, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setAuthError(null);
    setIsLoggingIn(true);
    
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      console.error("Login attempt failed:", err);
      let errorMessage = "Failed to sign in. Please check your credentials.";
      if (err.code === 'auth/operation-not-allowed') {
        errorMessage = "Email/Password sign-in is not enabled in Firebase Console. Please use Google Sign-In or enable it in the console.";
      } else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        errorMessage = "Invalid email or password.";
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = "Invalid email format.";
      }
      setLocalError(errorMessage);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLocalError(null);
    setAuthError(null);
    setIsGoogleLoggingIn(true);
    const provider = new GoogleAuthProvider();
    
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error("Google Login failed:", err);
      setLocalError("Google Sign-In failed. Please try again.");
    } finally {
      setIsGoogleLoggingIn(false);
    }
  };

  const seedAdmin = async () => {
    const seedEmail = 'admin@example.com';
    try {
      await setDoc(doc(db, 'allowed_users', seedEmail), {
        email: seedEmail,
        name: 'System Administrator',
        role: 'admin',
        isActive: true
      });
      alert("Success: Seed admin invitation created for " + seedEmail);
    } catch (err: any) {
      alert("Seed failed: " + err.message);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-900 px-4 py-10 relative">
      
      {/* Top Bar Link to Landing Page */}
      <div className="absolute top-6 right-6 left-6 flex items-center justify-between max-w-md mx-auto">
        <Link 
          to="/landing" 
          className="text-xs font-bold text-gray-500 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 flex items-center gap-2 transition-colors bg-white/50 dark:bg-gray-800/50 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 backdrop-blur-sm"
        >
          <i className="fas fa-arrow-right text-xs"></i>
          <span>العودة للواجهة الرئيسية / Back to Landing</span>
        </Link>
      </div>

      <div className="max-w-md w-full bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-2xl transition-all mt-8">
        <div className="w-16 h-16 bg-primary-600 rounded-2xl mx-auto flex items-center justify-center text-white text-2xl font-bold mb-6 shadow-lg shadow-primary-500/30">SG</div>
        <h1 className="text-2xl font-bold text-center mb-2">SGCA Login</h1>
        <p className="text-gray-500 dark:text-gray-400 text-center mb-8 text-sm">Revenue & CRM Management System</p>
        
        {(authError || localError) && (
          <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-4 mb-6 rounded shadow-sm">
            <div className="flex">
              <i className="fas fa-exclamation-circle text-red-500 mt-1 mr-3"></i>
              <p className="text-sm text-red-700 dark:text-red-300 font-medium">
                {authError || localError}
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">Email Address</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                <i className="fas fa-envelope"></i>
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 p-3 border rounded-xl dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 outline-none transition-all dark:text-white"
                placeholder="Enter your email address"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">Password</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                <i className="fas fa-lock"></i>
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 p-3 border rounded-xl dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 outline-none transition-all dark:text-white"
                placeholder="••••••••"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={isLoggingIn || authLoading}
            className="w-full py-3.5 bg-primary-600 text-white rounded-xl font-bold hover:bg-primary-700 active:scale-95 transition-all shadow-lg shadow-primary-500/20 disabled:opacity-50 flex items-center justify-center space-x-2"
          >
            {isLoggingIn || (authLoading && currentUser) ? (
              <>
                <i className="fas fa-circle-notch fa-spin"></i>
                <span>Signing In...</span>
              </>
            ) : (
              <span>Sign In</span>
            )}
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
          New to the academy? <Link to="/signup" className="text-primary-600 font-bold hover:underline">Request access / Sign Up</Link>
        </div>

        <div className="mt-10 pt-6 border-t dark:border-gray-700 flex flex-col items-center">
            <button 
                onClick={seedAdmin}
                className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 uppercase tracking-widest font-bold px-4 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
                Initialize System Invitation (Seed)
            </button>
        </div>
      </div>

      {/* Temporary Debug Panel */}
      <div className="max-w-md w-full mt-8 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-2xl border border-blue-200 dark:border-blue-800 shadow-sm text-xs font-mono">
        <h3 className="font-bold text-blue-800 dark:text-blue-300 mb-2 border-b border-blue-200 dark:border-blue-800 pb-1">System Debug Status</h3>
        <div className="space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500">Auth State:</span>
            <span className={currentUser ? "text-green-600 font-bold" : "text-gray-400"}>
              {currentUser ? currentUser.email : "Signed Out"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Gate Check:</span>
            <span className={`font-bold ${
              gateStatus === 'allowed' ? 'text-green-600' : 
              gateStatus === 'denied' ? 'text-red-600' : 'text-amber-600'
            }`}>
              {gateStatus.toUpperCase()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Profile Loaded:</span>
            <span className={userProfile ? "text-green-600" : "text-gray-400"}>
              {userProfile ? "YES" : "NO"}
            </span>
          </div>
          {authError && (
            <div className="mt-2 text-red-500 italic">
              Error: {authError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
