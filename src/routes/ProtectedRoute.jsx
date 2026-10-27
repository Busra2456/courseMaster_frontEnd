import { Navigate } from "react-router-dom";
import { useEffect, useState } from "react";

import { getToken } from "../utils/auth";
import { getMe } from "../services/auth.api";

export default function ProtectedRoute({ children, allowedRole }) {
  const token = getToken();

  // Development-only bypass for local testing
  const isBypass =
    import.meta.env.DEV &&
    localStorage.getItem("dev_bypass") === "true";

  const [status, setStatus] = useState(() => {
    if (isBypass) return "allowed";
    if (!token) return "unauthenticated";
    return "loading";
  });

  const [user, setUser] = useState(null);

  useEffect(() => {
    let active = true;

    // No API request is needed for local development bypass
    if (isBypass || !token) {
      return () => {
        active = false;
      };
    }

    getMe()
      .then((res) => {
        if (!active) return;

        const currentUser = res.data?.user ?? res.data;

        if (!currentUser?.role) {
          setStatus("unauthenticated");
          return;
        }

        setUser(currentUser);
        setStatus("authenticated");
      })
      .catch((error) => {
        if (!active) return;

        console.error("Authentication verification failed:", error);
        setStatus("unauthenticated");
      });

    return () => {
      active = false;
    };
  }, [token, isBypass]);

  // Loading state
  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  // Allow only local development bypass
  if (status === "allowed" && isBypass) {
    return children;
  }

  // Redirect unauthenticated users
  if (status === "unauthenticated") {
    return <Navigate to="/login" replace />;
  }

  // Verify user role
  if (
    status === "authenticated" &&
    allowedRole &&
    user?.role !== allowedRole
  ) {
    return (
      <Navigate
        to={user?.role === "admin" ? "/admin" : "/student"}
        replace
      />
    );
  }

  return children;
}
