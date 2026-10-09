import { Link, useLocation, useNavigate } from "react-router-dom";
import { Heart, Menu, X, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useProfileStore } from "@/stores/profileStore";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { toast } from "sonner";

const navItems = [
  { label: "Home", path: "/" },
  { label: "Tracking", path: "/tracking" },
  { label: "Checker", path: "/checker" },
  { label: "Health Insights", path: "/insights" },
  { label: "History", path: "/history" },
];

const Header = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { name, avatar, setName, setEmail, setAvatar, resetProfile } = useProfileStore();
  const { signOut } = useAuth();
  const { user } = useCurrentUser();

  useEffect(() => {
    if (!user) return;
    setName(user.profile?.displayName || "");
    setEmail(user.email || "");
    setAvatar(user.profile?.avatarUrl || null);
  }, [user, setName, setEmail, setAvatar]);

  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleSignOut = async () => {
    localStorage.removeItem("token");
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("auth-token-updated"));
    }
    resetProfile();
    try {
      await signOut();
    } catch {
      // Keep logout UX deterministic even if Supabase signout fails.
    }
    navigate("/welcome", { replace: true });
    toast.success("Signed out successfully");
  };

  return (
    <header className="sticky top-0 z-50 w-full backdrop-blur-lg bg-background/80 border-b border-border/50">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-soft group-hover:shadow-elevated transition-all duration-300">
              <Heart className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-serif text-xl font-semibold text-foreground">
              Bloom
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
                  location.pathname === item.path
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {item.label}
              </Link>
            ))}

            {/* Profile Avatar */}
            <Link
              to="/profile"
              className={`ml-1 w-10 h-10 rounded-full overflow-hidden flex items-center justify-center transition-all duration-300 shadow-soft hover:shadow-elevated hover:scale-105 ${
                location.pathname === "/profile"
                  ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                  : ""
              }`}
            >
              {avatar ? (
                <img
                  src={avatar}
                  alt="Profile"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full gradient-primary flex items-center justify-center">
                  <span className="text-sm font-semibold text-primary-foreground">
                    {initials || "U"}
                  </span>
                </div>
              )}
            </Link>

            {/* Logout Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSignOut}
              className="ml-1 text-muted-foreground hover:text-foreground"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </nav>

          {/* Mobile: Profile + Menu */}
          <div className="md:hidden flex items-center gap-2">
            <Link
              to="/profile"
              className={`w-9 h-9 rounded-full overflow-hidden flex items-center justify-center shadow-soft ${
                location.pathname === "/profile"
                  ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                  : ""
              }`}
            >
              {avatar ? (
                <img
                  src={avatar}
                  alt="Profile"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full gradient-primary flex items-center justify-center">
                  <span className="text-xs font-semibold text-primary-foreground">
                    {initials || "U"}
                  </span>
                </div>
              )}
            </Link>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <nav className="md:hidden py-4 border-t border-border/50 animate-fade-in">
            <div className="flex flex-col gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`px-4 py-3 rounded-lg text-sm font-medium transition-all duration-300 ${
                    location.pathname === item.path
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleSignOut();
                }}
                className="px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted text-left flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
};

export default Header;
