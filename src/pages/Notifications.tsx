import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, RefreshCw, CheckCheck, X, Trash2, ArrowRight } from "lucide-react";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { useNotifications } from "@/contexts/NotificationContext";

type NotifRow = any;

const apiOrigin = () =>
  (import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "http://localhost:5000").replace(
    /\/api$/,
    ""
  );

function severityPill(severity: string) {
  if (severity === "critical") return "bg-destructive text-destructive-foreground";
  if (severity === "high") return "bg-orange-500 text-white";
  if (severity === "medium") return "bg-amber-500 text-white";
  return "bg-sky-500 text-white";
}

export default function Notifications() {
  const [rows, setRows] = useState<NotifRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [includeDismissed, setIncludeDismissed] = useState(false);
  const didAutoMarkRead = useRef(false);
  const { markAllRead: markAllReadInContext, refreshNotifications } = useNotifications();

  const unreadCount = useMemo(() => rows.filter((r) => !r?.readAt && !r?.dismissedAt).length, [rows]);

  const load = async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${apiOrigin()}/api/notifications?includeDismissed=${includeDismissed ? "true" : "false"}&limit=100`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error("Failed to load notifications");
      const data = await res.json();
      setRows(data?.data ?? []);
      // Keep header badge in sync (context list excludes dismissed)
      refreshNotifications({ includeDismissed: false, limit: 50 }).catch(() => { });
    } catch {
      toast({ title: "Unable to load notifications", description: "Please try again." });
    } finally {
      setLoading(false);
    }
  };

  const markAllRead = async () => {
    try {
      await markAllReadInContext();
      await load();
      toast({ title: "Marked all as read" });
    } catch {
      toast({ title: "Action failed", description: "Could not mark all as read." });
    }
  };

  const dismiss = async (id: string) => {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const res = await fetch(`${apiOrigin()}/api/notifications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ dismissed: true }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error || "Dismiss failed");
      }
      await load();
    } catch (err: any) {
      toast({
        title: "Dismiss failed",
        description: err?.message || "Could not dismiss notification.",
      });
    }
  };

  const remove = async (id: string) => {
    const ok = window.confirm("Delete this notification permanently?");
    if (!ok) return;

    const token = localStorage.getItem("token");
    if (!token) return;

    try {
      const res = await fetch(`${apiOrigin()}/api/notifications/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error || "Delete failed");
      }
      await load();
      refreshNotifications({ includeDismissed: false, limit: 50 }).catch(() => { });
      toast({ title: "Notification deleted" });
    } catch (err: any) {
      toast({
        title: "Delete failed",
        description: err?.message || "Could not delete notification.",
      });
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeDismissed]);

  // Mark as read on open (once per mount).
  useEffect(() => {
    if (didAutoMarkRead.current) return;
    if (!rows.length) return;
    const unread = rows.some((r) => !r?.readAt && !r?.dismissedAt);
    if (!unread) {
      didAutoMarkRead.current = true;
      return;
    }

    didAutoMarkRead.current = true;
    markAllReadInContext()
      .then(() => load())
      .catch(() => { });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, markAllReadInContext]);

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 md:py-12 max-w-5xl">
        <section className="mb-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shadow-soft">
                <Bell className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="font-serif text-3xl font-bold text-foreground">Notifications</h1>
                <p className="text-sm text-muted-foreground">
                  {unreadCount ? `${unreadCount} unread` : "You're all caught up."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={markAllRead} disabled={!rows.length}>
                <CheckCheck className="w-4 h-4 mr-2" />
                Mark all read
              </Button>
              <Button variant="outline" onClick={load} disabled={loading}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </section>

        <section className="mb-6">
          <div className="glass-card p-4 rounded-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Include dismissed</p>
                <p className="text-sm text-muted-foreground">Show notifications you already dismissed</p>
              </div>
              <Switch checked={includeDismissed} onCheckedChange={setIncludeDismissed} />
            </div>
          </div>
        </section>

        <section>
          {loading ? (
            <div className="glass-card p-6 text-sm text-muted-foreground">Loading notifications...</div>
          ) : rows.length ? (
            <div className="space-y-3">
              {rows.map((n: any) => {
                const createdAt = n?.createdAt ? new Date(n.createdAt).toLocaleString() : "—";
                const isUnread = !n?.readAt;
                const isDismissed = Boolean(n?.dismissedAt);
                const sev = String(n?.severity || "low");
                const hasLink = Boolean(n?.actionUrl);

                const handleNavigate = () => {
                  if (isUnread && n?._id) {
                    const token = localStorage.getItem("token");
                    if (token) {
                      fetch(`${apiOrigin()}/api/notifications/${n._id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ read: true }),
                      }).then(() => load()).catch(() => { });
                    }
                  }
                };

                const cardContent = (
                  <>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${severityPill(sev)}`}>
                        {sev.toUpperCase()}
                      </span>
                      {isUnread ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary">
                          UNREAD
                        </span>
                      ) : null}
                      {isDismissed ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground">
                          DISMISSED
                        </span>
                      ) : null}
                      <span className="text-xs text-muted-foreground">{createdAt}</span>
                    </div>

                    <p className="font-semibold text-foreground group-hover:text-primary transition-colors">{n?.title}</p>
                    <p className="text-sm text-muted-foreground mt-1">{n?.message}</p>

                    {hasLink && (
                      <span className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-primary">
                        {n?.actionLabel || "View details"}
                        <ArrowRight className="w-3 h-3" />
                      </span>
                    )}

                    {n?.emailMeta?.sentAt ? (
                      <p className="text-xs text-emerald-600 mt-2">
                        Email sent to {n?.emailMeta?.to || "your email"} at{" "}
                        {new Date(n.emailMeta.sentAt).toLocaleString()}
                      </p>
                    ) : n?.emailMeta?.error ? (
                      <p className="text-xs text-amber-600 mt-2">Email: {n.emailMeta.error}</p>
                    ) : null}
                  </>
                );

                return (
                  <div
                    key={n?._id}
                    className={`glass-card p-5 rounded-2xl border transition-all ${isUnread ? "border-primary/30 bg-primary/5" : "border-border"
                      }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        {hasLink ? (
                          <Link
                            to={n.actionUrl}
                            onClick={handleNavigate}
                            className="block group rounded-xl -m-2 p-2 hover:bg-primary/5 transition-colors"
                          >
                            {cardContent}
                          </Link>
                        ) : (
                          <div>{cardContent}</div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {!isDismissed ? (
                          <Button variant="outline" size="sm" onClick={() => dismiss(n._id)}>
                            <X className="w-4 h-4 mr-2" />
                            Dismiss
                          </Button>
                        ) : null}
                        <Button variant="outline" size="sm" onClick={() => remove(n._id)}>
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}

            </div>
          ) : (
            <div className="glass-card p-6 text-sm text-muted-foreground">No notifications yet.</div>
          )}
        </section>
      </div>
    </Layout>
  );
}

