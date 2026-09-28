import React, { useState, useRef, useEffect } from "react";
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
} from "firebase/auth";
import type { User } from "firebase/auth";
import { auth, googleProvider } from "../utils/firebase";
import { formatFirebaseError } from "../utils/authErrors";
import type { AuthErrorLike } from "../utils/authErrors";
import {
  LogIn,
  LogOut,
  User as UserIcon,
  AlertCircle,
  ExternalLink,
  Mail,
  Lock,
  Loader2,
} from "lucide-react";

interface AuthWidgetProps {
  user: User | null;
}

const AuthWidget: React.FC<AuthWidgetProps> = ({ user }) => {
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setError(null);
        // Resetting mode to sign-in on close is optional, but keeps it simple
        // setIsRegistering(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleGoogleLogin = async () => {
    setError(null);
    setIsLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      setIsOpen(false);
    } catch (error) {
      const authError = error as AuthErrorLike;
      console.error("Google Login failed", authError);
      if (
        authError.code === "auth/popup-closed-by-user" ||
        authError.code === "auth/cancelled-popup-request"
      ) {
        setIsLoading(false);
        return;
      }
      setError(formatFirebaseError(authError));
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setError(null);
    setIsLoading(true);
    try {
      if (isRegistering) {
        // Registration Flow
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );
        if (displayName.trim()) {
          await updateProfile(userCredential.user, {
            displayName: displayName.trim(),
          });
        }
      } else {
        // Login Flow
        await signInWithEmailAndPassword(auth, email, password);
      }

      setIsOpen(false);
      setEmail("");
      setPassword("");
      setDisplayName("");
    } catch (error) {
      const authError = error as AuthErrorLike;
      console.error("Email Auth failed", authError);
      setError(formatFirebaseError(authError));
    } finally {
      setIsLoading(false);
    }
  };

  let submitLabel = isRegistering ? "Create Account" : "Sign In";
  if (isLoading) {
    submitLabel = isRegistering ? "Creating Account..." : "Signing In...";
  }

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setIsOpen(false);
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  if (user) {
    return (
      <div className="flex items-center gap-2 bg-white/90 backdrop-blur border border-gray-200 rounded-full pl-1 pr-3 py-1 shadow-sm">
        {user.photoURL ? (
          <img
            src={user.photoURL}
            alt="Profile"
            className="w-7 h-7 rounded-full border border-gray-200"
          />
        ) : (
          <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
            <UserIcon size={16} />
          </div>
        )}
        <div className="flex flex-col leading-none mr-2">
          <span className="text-[10px] text-gray-400 font-semibold uppercase">
            Logged In
          </span>
          <span className="text-xs font-medium text-gray-700 max-w-[80px] truncate">
            {user.displayName || user.email || "User"}
          </span>
        </div>
        <button
          onClick={handleLogout}
          className="p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-full transition-colors"
          title="Sign Out"
        >
          <LogOut size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 bg-white/90 backdrop-blur border border-gray-200 text-gray-700 px-3 py-1.5 rounded-full shadow-sm hover:bg-gray-50 transition-all text-sm font-medium ${
          isOpen ? "ring-2 ring-blue-100 border-blue-400" : ""
        }`}
      >
        <LogIn size={16} className="text-blue-600" />
        <span>{isRegistering ? "Sign Up" : "Sign In"}</span>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-50 animate-fade-in-up">
          <div className="p-4">
            <h3 className="font-bold text-gray-800 mb-4">
              {isRegistering ? "Create Account" : "Sign In"}
            </h3>

            {/* Google Login */}
            <button
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm disabled:opacity-50"
            >
              {/* Google Icon SVG */}
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              <span>Continue with Google</span>
            </button>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-gray-400">
                  Or {isRegistering ? "sign up" : "sign in"} with email
                </span>
              </div>
            </div>

            {/* Email Form */}
            <form onSubmit={handleEmailAuth} className="space-y-3">
              {isRegistering && (
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <UserIcon size={16} />
                  </div>
                  <input
                    type="text"
                    placeholder="Full Name (Optional)"
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
              )}
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Mail size={16} />
                </div>
                <input
                  type="email"
                  placeholder="Email address"
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  required
                />
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Lock size={16} />
                </div>
                <input
                  type="password"
                  placeholder="Password"
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg text-sm transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isLoading && <Loader2 size={16} className="animate-spin" />}
                <span>{submitLabel}</span>
              </button>
            </form>

            {/* Toggle Mode */}
            <div className="mt-4 text-center text-xs">
              <span className="text-gray-500">
                {isRegistering
                  ? "Already have an account? "
                  : "Don't have an account? "}
              </span>
              <button
                onClick={() => {
                  setIsRegistering(!isRegistering);
                  setError(null);
                }}
                className="text-blue-600 font-medium hover:underline focus:outline-none"
              >
                {isRegistering ? "Sign In" : "Sign Up"}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border-t border-red-100 p-3">
              <div className="flex items-start gap-2">
                <AlertCircle
                  size={16}
                  className="text-red-600 mt-0.5 flex-shrink-0"
                />
                <div className="text-xs text-red-800 whitespace-pre-wrap leading-relaxed">
                  {error}
                </div>
              </div>
              {error.includes("Domain Not Authorized") && (
                <div className="mt-2 text-[10px] text-blue-700 flex gap-1 items-center hover:underline cursor-pointer">
                  <ExternalLink size={10} />
                  <a
                    href="https://console.firebase.google.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open Firebase Console
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AuthWidget;
