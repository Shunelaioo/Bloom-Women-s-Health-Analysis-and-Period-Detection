import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Bell, AlertTriangle, Stethoscope, Calendar, ChevronDown, ChevronUp } from "lucide-react";
import { useNotifications, Notification, NotificationSeverity } from "@/contexts/NotificationContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

const getSeverityStyles = (severity: NotificationSeverity) => {
  switch (severity) {
    case "critical":
      return {
        bg: "bg-destructive/10",
        border: "border-destructive/30",
        text: "text-destructive",
        icon: AlertTriangle,
      };
    case "high":
      return {
        bg: "bg-orange-500/10",
        border: "border-orange-500/30",
        text: "text-orange-600 dark:text-orange-400",
        icon: AlertTriangle,
      };
    case "medium":
      return {
        bg: "bg-amber-500/10",
        border: "border-amber-500/30",
        text: "text-amber-600 dark:text-amber-400",
        icon: Bell,
      };
    default:
      return {
        bg: "bg-blue-500/10",
        border: "border-blue-500/30",
        text: "text-blue-600 dark:text-blue-400",
        icon: Bell,
      };
  };
};

const getTypeIcon = (type: Notification["type"]) => {
  switch (type) {
    case "daily_log":
      return Calendar;
    case "red_flag":
    case "warning":
      return Stethoscope;
    default:
      return Bell;
  }
};

interface NotificationItemProps {
  notification: Notification;
  onDismiss: (id: string) => void;
}

const NotificationItem = ({ notification, onDismiss }: NotificationItemProps) => {
  const styles = getSeverityStyles(notification.severity);
  const Icon = getTypeIcon(notification.type);

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn(
        "glass-card p-4 rounded-2xl border-2 transition-all",
        styles.bg,
        styles.border,
        "hover:shadow-lg"
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", styles.bg)}>
          <Icon className={cn("w-5 h-5", styles.text)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <h4 className={cn("font-semibold text-sm mb-1", styles.text)}>{notification.title}</h4>
              <p className="text-sm text-muted-foreground">{notification.message}</p>
            </div>
            <button
              onClick={() => onDismiss(notification.id)}
              className="shrink-0 w-6 h-6 rounded-full hover:bg-background/50 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
          {notification.actionUrl && (
            <Link to={notification.actionUrl}>
              <Button
                variant="outline"
                size="sm"
                className={cn("mt-3 w-full", styles.border, styles.text)}
              >
                {notification.actionLabel || "View"}
              </Button>
            </Link>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export const NotificationCenter = () => {
  const { notifications, dismissNotification } = useNotifications();
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const location = useLocation();
  
  // Only show on authenticated routes
  const isPublicRoute = ["/welcome", "/login", "/auth"].includes(location.pathname);
  const hasToken = Boolean(localStorage.getItem("token"));

  const activeNotifications = notifications.filter((n) => !n.dismissedAt);

  useEffect(() => {
    setHasUnread(activeNotifications.length > 0);
  }, [activeNotifications.length]);

  if (isPublicRoute || !hasToken || activeNotifications.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm w-full sm:w-96">
      <AnimatePresence>
        {isExpanded ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="glass-card p-4 rounded-2xl border border-border shadow-elevated"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-foreground">Notifications</h3>
                {hasUnread && (
                  <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                )}
              </div>
              <button
                onClick={() => setIsExpanded(false)}
                className="w-6 h-6 rounded-full hover:bg-muted flex items-center justify-center transition-colors"
              >
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              <AnimatePresence>
                {activeNotifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onDismiss={dismissNotification}
                  />
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        ) : (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => setIsExpanded(true)}
            className="glass-card p-4 rounded-2xl border border-border shadow-elevated hover:shadow-lg transition-all flex items-center gap-3 w-full"
          >
            <div className="relative">
              <Bell className="w-6 h-6 text-primary" />
              {hasUnread && (
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-destructive animate-pulse" />
              )}
            </div>
            <div className="flex-1 text-left">
              <p className="font-semibold text-sm text-foreground">
                {activeNotifications.length} notification{activeNotifications.length > 1 ? "s" : ""}
              </p>
              <p className="text-xs text-muted-foreground">Click to view</p>
            </div>
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};
