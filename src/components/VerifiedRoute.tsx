import { Navigate, useLocation } from "react-router-dom";
import { useCurrentUser } from "@/hooks/useCurrentUser";

interface VerifiedRouteProps {
  children: React.ReactNode;
}

const VerifiedRoute = ({ children }: VerifiedRouteProps) => {
  const location = useLocation();
  const hasLocalToken = Boolean(localStorage.getItem("token"));
  const { isVerified, isLoading } = useCurrentUser();

  if (!hasLocalToken) {
    return <Navigate to="/welcome" replace />;
  }

  if (isLoading || isVerified === null) {
    return null;
  }

  if (!isVerified) {
    return <Navigate to="/profile" replace state={{ from: location.pathname, verificationRequired: true }} />;
  }

  return <>{children}</>;
};

export default VerifiedRoute;

