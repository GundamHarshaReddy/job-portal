import React, { useState, useEffect, useCallback } from "react";
import { useAuth, API } from "@/App";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Users,
  Briefcase,
  TrendingUp,
  Plus,
  Trash2,
  MoreVertical,
  UserPlus,
  Send,
  MessageSquare,
  Bot,
  Activity,
  MousePointerClick,
  Link2,
  Radio,
  Bell,
  CheckCircle2,
  XCircle,
  Clock,
  BarChart3,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { EmptyState } from "@/components/EmptyState";

export default function AdminDashboard() {
  const { token } = useAuth();
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(null);
  const [newUser, setNewUser] = useState({ email: "", password: "", name: "" });
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [broadcasting, setBroadcasting] = useState(false);
  const [botAnalytics, setBotAnalytics] = useState(null);
  const [botLoading, setBotLoading] = useState(false);

  const fetchData = useCallback(async () => {
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const [statsRes, usersRes, jobsRes] = await Promise.all([
        axios.get(`${API}/admin/stats`, { headers }),
        axios.get(`${API}/admin/users`, { headers }),
        axios.get(`${API}/jobs`, { headers }),
      ]);
      setStats(statsRes.data);
      setUsers(usersRes.data);
      setJobs(jobsRes.data);
    } catch {
      toast.error("Failed to load dashboard data");
    }
    setLoading(false);
  }, [token]);

  const fetchBotAnalytics = useCallback(async () => {
    setBotLoading(true);
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const res = await axios.get(`${API}/admin/bot-analytics`, { headers });
      setBotAnalytics(res.data);
    } catch {
      // silently fail — tab will show empty state
    }
    setBotLoading(false);
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUser.email || !newUser.password || !newUser.name) {
      toast.error("Please fill in all fields");
      return;
    }
    setCreating(true);
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const res = await axios.post(`${API}/admin/users`, newUser, { headers });
      setUsers((prev) => [...prev, res.data]);
      setStats((prev) => prev ? { ...prev, total_users: prev.total_users + 1, total_friends: prev.total_friends + 1 } : prev);
      toast.success(`Account created for ${newUser.name}`);
      setNewUser({ email: "", password: "", name: "" });
      setCreateOpen(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create user");
    }
    setCreating(false);
  };

  const handleDeleteUser = async () => {
    if (!deleteDialog) return;
    setDeleting(true);
    const headers = { Authorization: `Bearer ${token}` };
    try {
      await axios.delete(`${API}/admin/users/${deleteDialog.id}`, { headers });
      setUsers((prev) => prev.filter((u) => u.id !== deleteDialog.id));
      setStats((prev) => prev ? { ...prev, total_users: prev.total_users - 1, total_friends: prev.total_friends - 1 } : prev);
      toast.success("User deleted");
      setDeleteDialog(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to delete user");
    }
    setDeleting(false);
  };

  const handleDeleteJob = async (job) => {
    const headers = { Authorization: `Bearer ${token}` };
    try {
      await axios.delete(`${API}/jobs/${job.id}`, { headers });
      setJobs((prev) => prev.filter((j) => j.id !== job.id));
      setStats((prev) => prev ? { ...prev, total_jobs: prev.total_jobs - 1 } : prev);
      toast.success("Job deleted");
    } catch {
      toast.error("Failed to delete job");
    }
  };

  const formatDate = (dateStr) => {
    try {
      return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch {
      return dateStr;
    }
  };

  const handleBroadcast = async () => {
    if (!broadcastMsg.trim()) {
      toast.error("Please enter a message");
      return;
    }
    setBroadcasting(true);
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const res = await axios.post(`${API}/admin/broadcast`, { message: broadcastMsg }, { headers });
      toast.success(`Broadcast sent to ${res.data.sent_count} user(s)!`);
      setBroadcastMsg("");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to send broadcast");
    }
    setBroadcasting(false);
  };

  const linkedUsersCount = users.filter((u) => u.telegram_chat_id).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const statCards = [
    { label: "Total Users", value: stats?.total_users || 0, icon: Users, color: "text-blue-500" },
    { label: "Friends", value: stats?.total_friends || 0, icon: UserPlus, color: "text-emerald-500" },
    { label: "Total Jobs", value: stats?.total_jobs || 0, icon: Briefcase, color: "text-purple-500" },
    { label: "Posted Today", value: stats?.today_jobs || 0, icon: TrendingUp, color: "text-amber-500" },
  ];

  return (
    <div className="space-y-8 animate-fade-in" data-testid="admin-dashboard">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="admin-heading">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-1">Manage users and monitor activity</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2" data-testid="admin-create-user-btn">
          <Plus className="h-4 w-4" /> Add Friend
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="admin-stats">
        {statCards.map((s, i) => (
          <Card key={s.label} className="animate-fade-in" style={{ animationDelay: `${i * 0.05}s` }}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  <p className="text-2xl font-bold mt-1">
                    <AnimatedCounter value={s.value} />
                  </p>
                </div>
                <div className={`h-10 w-10 rounded-xl bg-muted flex items-center justify-center ${s.color}`}>
                  <s.icon className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="users" data-testid="admin-tabs">
        <TabsList className="grid w-full max-w-2xl grid-cols-4">
          <TabsTrigger value="users" data-testid="admin-tab-users">
            <Users className="h-4 w-4 mr-2" /> Users ({users.length})
          </TabsTrigger>
          <TabsTrigger value="jobs" data-testid="admin-tab-jobs">
            <Briefcase className="h-4 w-4 mr-2" /> Jobs ({jobs.length})
          </TabsTrigger>
          <TabsTrigger value="broadcast" data-testid="admin-tab-broadcast">
            <MessageSquare className="h-4 w-4 mr-2" /> Broadcast
          </TabsTrigger>
          <TabsTrigger value="bot-analytics" data-testid="admin-tab-bot-analytics" onClick={() => { if (!botAnalytics) fetchBotAnalytics(); }}>
            <Bot className="h-4 w-4 mr-2" /> Bot Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table data-testid="admin-users-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="hidden sm:table-cell">Telegram</TableHead>
                    <TableHead className="hidden sm:table-cell">Joined</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id} data-testid={`user-row-${u.id}`}>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell className="text-muted-foreground">{u.email}</TableCell>
                      <TableCell>
                        <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${u.role === "admin"
                          ? "bg-primary/10 text-primary"
                          : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          }`}>
                          {u.role}
                        </span>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {u.telegram_chat_id ? (
                          <Send className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <span className="text-xs text-muted-foreground">--</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                        {formatDate(u.created_at)}
                      </TableCell>
                      <TableCell>
                        {u.role !== "admin" && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`user-menu-${u.id}`}>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleteDialog(u)}
                                data-testid={`user-delete-${u.id}`}
                              >
                                <Trash2 className="h-4 w-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jobs" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table data-testid="admin-jobs-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Role</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead className="hidden sm:table-cell">Type</TableHead>
                    <TableHead className="hidden sm:table-cell">Posted By</TableHead>
                    <TableHead className="hidden md:table-cell">Deadline</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((j) => (
                    <TableRow key={j.id} data-testid={`admin-job-row-${j.id}`}>
                      <TableCell className="font-medium">{j.role}</TableCell>
                      <TableCell className="text-muted-foreground">{j.company_name}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${j.job_type === "Internship"
                          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          }`}>
                          {j.job_type}
                        </span>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm">{j.posted_by_name}</TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground text-sm">{formatDate(j.deadline)}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`admin-job-menu-${j.id}`}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => handleDeleteJob(j)}
                              data-testid={`admin-job-delete-${j.id}`}
                            >
                              <Trash2 className="h-4 w-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                  {jobs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="h-48 text-center">
                        <EmptyState
                          title="No jobs posted yet"
                          description="Jobs posted by users will appear here."
                          className="py-4"
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="broadcast" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Send className="h-5 w-5 text-primary" />
                Send Telegram Broadcast
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Send a message to all users with linked Telegram accounts ({linkedUsersCount} of {users.length} linked)
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="broadcast-msg">Message</Label>
                <Textarea
                  id="broadcast-msg"
                  placeholder="Type your broadcast message here... Supports HTML: <b>bold</b>, <i>italic</i>, <code>code</code>"
                  value={broadcastMsg}
                  onChange={(e) => setBroadcastMsg(e.target.value)}
                  rows={5}
                  className="resize-none"
                  data-testid="broadcast-textarea"
                />
              </div>
              {linkedUsersCount === 0 ? (
                <div className="text-sm text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                  ⚠️ No users have linked their Telegram yet. Ask users to message your bot with <code>/start their@email.com</code>
                </div>
              ) : (
                <Button
                  onClick={handleBroadcast}
                  disabled={broadcasting || !broadcastMsg.trim()}
                  className="gap-2"
                  data-testid="broadcast-send-btn"
                >
                  {broadcasting ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Send to {linkedUsersCount} user{linkedUsersCount !== 1 ? "s" : ""}
                    </>
                  )}
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Bot Analytics Tab */}
        <TabsContent value="bot-analytics" className="mt-4 space-y-6">
          {botLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : !botAnalytics ? (
            <Card><CardContent className="py-12"><EmptyState title="No analytics data yet" description="Analytics will appear once users start interacting with the Telegram bot." /></CardContent></Card>
          ) : (
            <>
              {/* Overview Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Linked Users", value: `${botAnalytics.overview.total_linked_users}/${botAnalytics.overview.total_users}`, icon: Link2, color: "text-blue-500" },
                  { label: "Button Clicks", value: botAnalytics.overview.total_button_clicks, icon: MousePointerClick, color: "text-violet-500" },
                  { label: "Broadcasts Sent", value: botAnalytics.overview.total_broadcasts_sent, icon: Radio, color: "text-emerald-500" },
                  { label: "Reminders Sent", value: botAnalytics.overview.total_reminders_sent, icon: Bell, color: "text-amber-500" },
                ].map((s, i) => (
                  <Card key={s.label} className="animate-fade-in" style={{ animationDelay: `${i * 0.05}s` }}>
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">{s.label}</p>
                          <p className="text-2xl font-bold mt-1">
                            {typeof s.value === "number" ? <AnimatedCounter value={s.value} /> : s.value}
                          </p>
                        </div>
                        <div className={`h-10 w-10 rounded-xl bg-muted flex items-center justify-center ${s.color}`}>
                          <s.icon className="h-5 w-5" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Response Breakdown Bar */}
              {(() => {
                const bd = botAnalytics.response_breakdown;
                const total = bd.applied + bd.not_interested + bd.remind;
                if (total === 0) return null;
                const items = [
                  { key: "applied", label: "Applied", count: bd.applied, color: "bg-emerald-500", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
                  { key: "not_interested", label: "Not Interested", count: bd.not_interested, color: "bg-red-400", icon: <XCircle className="h-3.5 w-3.5" /> },
                  { key: "remind", label: "Remind Later", count: bd.remind, color: "bg-amber-400", icon: <Clock className="h-3.5 w-3.5" /> },
                ];
                return (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <BarChart3 className="h-5 w-5 text-primary" /> Response Breakdown
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Stacked bar */}
                      <div className="w-full h-5 rounded-full overflow-hidden flex bg-muted">
                        {items.map(it => {
                          const pct = (it.count / total * 100).toFixed(1);
                          return pct > 0 ? <div key={it.key} className={`${it.color} transition-all duration-700`} style={{ width: `${pct}%` }} title={`${it.label}: ${pct}%`} /> : null;
                        })}
                      </div>
                      {/* Legend */}
                      <div className="flex flex-wrap gap-4">
                        {items.map(it => (
                          <div key={it.key} className="flex items-center gap-1.5 text-sm">
                            <div className={`w-3 h-3 rounded-sm ${it.color}`} />
                            <span className="flex items-center gap-1">{it.icon} {it.label}</span>
                            <span className="font-semibold">{it.count}</span>
                            <span className="text-muted-foreground">({(it.count / total * 100).toFixed(0)}%)</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}

              {/* Per-Job Response Table */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Per-Job Responses</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Job</TableHead>
                        <TableHead className="hidden sm:table-cell">Company</TableHead>
                        <TableHead className="text-center">Notified</TableHead>
                        <TableHead className="text-center">✅</TableHead>
                        <TableHead className="text-center">❌</TableHead>
                        <TableHead className="text-center">🔔</TableHead>
                        <TableHead className="text-center hidden sm:table-cell">No Reply</TableHead>
                        <TableHead className="text-center">Rate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {botAnalytics.per_job_responses.length === 0 ? (
                        <TableRow><TableCell colSpan={8} className="h-32 text-center"><EmptyState title="No job data" description="Job responses will appear here." className="py-4" /></TableCell></TableRow>
                      ) : botAnalytics.per_job_responses.map((j) => (
                        <TableRow key={j.job_id}>
                          <TableCell className="font-medium max-w-[200px] truncate">{j.job_title}</TableCell>
                          <TableCell className="hidden sm:table-cell text-muted-foreground">{j.company}</TableCell>
                          <TableCell className="text-center">{j.total_notified}</TableCell>
                          <TableCell className="text-center font-medium text-emerald-600 dark:text-emerald-400">{j.applied}</TableCell>
                          <TableCell className="text-center font-medium text-red-500">{j.not_interested}</TableCell>
                          <TableCell className="text-center font-medium text-amber-500">{j.remind}</TableCell>
                          <TableCell className="text-center hidden sm:table-cell text-muted-foreground">{j.no_response}</TableCell>
                          <TableCell className="text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-semibold ${j.response_rate >= 70 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : j.response_rate >= 40 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                  : "bg-red-500/10 text-red-500"
                              }`}>
                              {j.response_rate}%
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Per-User Activity Table */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Per-User Activity</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead className="hidden sm:table-cell">Email</TableHead>
                        <TableHead className="text-center">Total</TableHead>
                        <TableHead className="text-center">✅</TableHead>
                        <TableHead className="text-center">❌</TableHead>
                        <TableHead className="text-center">🔔</TableHead>
                        <TableHead className="hidden sm:table-cell">Last Active</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {botAnalytics.per_user_activity.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="h-32 text-center"><EmptyState title="No user activity" description="User bot activity will appear here." className="py-4" /></TableCell></TableRow>
                      ) : botAnalytics.per_user_activity.map((u) => (
                        <TableRow key={u.chat_id}>
                          <TableCell className="font-medium">{u.user_name}</TableCell>
                          <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">{u.user_email}</TableCell>
                          <TableCell className="text-center font-bold">{u.total_clicks}</TableCell>
                          <TableCell className="text-center font-medium text-emerald-600 dark:text-emerald-400">{u.applied}</TableCell>
                          <TableCell className="text-center font-medium text-red-500">{u.not_interested}</TableCell>
                          <TableCell className="text-center font-medium text-amber-500">{u.remind}</TableCell>
                          <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                            {u.last_active ? formatDate(u.last_active) : "--"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Daily Activity Chart */}
              {botAnalytics.daily_activity.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Activity className="h-5 w-5 text-primary" /> Daily Bot Activity (Last 30 Days)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-end gap-1 h-40 overflow-x-auto pb-6 relative">
                      {(() => {
                        const maxVal = Math.max(...botAnalytics.daily_activity.map(d => d.total), 1);
                        return botAnalytics.daily_activity.map((d, i) => (
                          <div key={d.date} className="flex flex-col items-center flex-1 min-w-[18px] group relative">
                            <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-popover text-popover-foreground border shadow-lg rounded-md px-2 py-1 text-xs whitespace-nowrap z-10 pointer-events-none">
                              <div className="font-semibold">{d.date}</div>
                              <div>Clicks: {d.clicks} · Notifs: {d.notifications} · Rem: {d.reminders}</div>
                            </div>
                            <div
                              className="w-full rounded-t-sm bg-gradient-to-t from-primary/80 to-primary transition-all duration-500 hover:from-primary hover:to-primary/90 cursor-pointer"
                              style={{ height: `${Math.max((d.total / maxVal) * 100, 4)}%`, animationDelay: `${i * 30}ms` }}
                            />
                            <span className="text-[10px] text-muted-foreground mt-1 -rotate-45 origin-top-left absolute -bottom-5 left-1/2">
                              {d.date.slice(5)}
                            </span>
                          </div>
                        ));
                      })()}
                    </div>
                    <div className="flex gap-4 mt-4 text-xs text-muted-foreground">
                      <span>📊 Hover bars for details</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Recent Activity Feed */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Activity className="h-5 w-5 text-primary" /> Recent Bot Activity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {botAnalytics.recent_events.length === 0 ? (
                    <EmptyState title="No recent events" description="Bot events will appear here in real time." />
                  ) : (
                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                      {botAnalytics.recent_events.map((ev, i) => {
                        let icon, text, dotColor;
                        const name = ev.user_name || ev.user_email || `Chat ${ev.chat_id?.slice(-4)}`;
                        switch (ev.event_type) {
                          case "button_click":
                            icon = ev.action === "applied" ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                              : ev.action === "not_interested" ? <XCircle className="h-4 w-4 text-red-400" />
                                : <Clock className="h-4 w-4 text-amber-400" />;
                            text = <><span className="font-medium">{name}</span> clicked <span className="font-semibold">{ev.action === "applied" ? "✅ Applied" : ev.action === "not_interested" ? "❌ Not Interested" : "🔔 Remind"}</span> on <span className="font-medium">{ev.job_title || "a job"}</span></>;
                            dotColor = ev.action === "applied" ? "bg-emerald-500" : ev.action === "not_interested" ? "bg-red-400" : "bg-amber-400";
                            break;
                          case "link_success":
                            icon = <Link2 className="h-4 w-4 text-blue-500" />;
                            text = <><span className="font-medium">{name}</span> linked their Telegram</>;
                            dotColor = "bg-blue-500";
                            break;
                          case "link_failed":
                            icon = <XCircle className="h-4 w-4 text-red-400" />;
                            text = <><span className="font-medium">{ev.user_email || "Someone"}</span> failed to link Telegram</>;
                            dotColor = "bg-red-400";
                            break;
                          case "broadcast_sent":
                            icon = <Radio className="h-4 w-4 text-violet-500" />;
                            text = <>Broadcast sent to <span className="font-medium">{name}</span></>;
                            dotColor = "bg-violet-500";
                            break;
                          case "reminder_sent":
                            icon = <Bell className="h-4 w-4 text-amber-500" />;
                            text = <>Reminder sent for <span className="font-medium">{ev.job_title || "a job"}</span></>;
                            dotColor = "bg-amber-500";
                            break;
                          case "job_notification_sent":
                            icon = <Send className="h-4 w-4 text-blue-500" />;
                            text = <>Job notification sent to <span className="font-medium">{name}</span> for <span className="font-medium">{ev.job_title || "a job"}</span></>;
                            dotColor = "bg-blue-500";
                            break;
                          case "command_start":
                            icon = <Bot className="h-4 w-4 text-primary" />;
                            text = <><span className="font-medium">{name}</span> used /start command</>;
                            dotColor = "bg-primary";
                            break;
                          default:
                            icon = <Activity className="h-4 w-4 text-muted-foreground" />;
                            text = <>{ev.event_type}</>;
                            dotColor = "bg-muted-foreground";
                        }
                        const timeAgo = (() => {
                          try {
                            const diff = (Date.now() - new Date(ev.created_at).getTime()) / 1000;
                            if (diff < 60) return "just now";
                            if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
                            if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
                            return `${Math.floor(diff / 86400)}d ago`;
                          } catch { return ""; }
                        })();
                        return (
                          <div key={i} className="flex items-start gap-3 py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                            <div className="mt-0.5 shrink-0">{icon}</div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm leading-relaxed">{text}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{timeAgo}</p>
                            </div>
                            <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${dotColor}`} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Refresh button */}
              <div className="flex justify-center">
                <Button variant="outline" onClick={fetchBotAnalytics} disabled={botLoading} className="gap-2">
                  <Activity className="h-4 w-4" /> Refresh Analytics
                </Button>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Create User Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent data-testid="create-user-dialog">
          <DialogHeader>
            <DialogTitle>Add Friend</DialogTitle>
            <DialogDescription>Create a new account for a friend to join FriendBoard.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateUser} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="new-name">Name</Label>
              <Input
                id="new-name"
                placeholder="Friend's name"
                value={newUser.name}
                onChange={(e) => setNewUser((p) => ({ ...p, name: e.target.value }))}
                data-testid="create-user-name-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-email">Email</Label>
              <Input
                id="new-email"
                type="email"
                placeholder="friend@email.com"
                value={newUser.email}
                onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))}
                data-testid="create-user-email-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">Password</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="Set a password"
                value={newUser.password}
                onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))}
                data-testid="create-user-password-input"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} data-testid="create-user-cancel-btn">Cancel</Button>
              <Button type="submit" disabled={creating} data-testid="create-user-submit-btn">
                {creating ? "Creating..." : "Create Account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <Dialog open={!!deleteDialog} onOpenChange={() => setDeleteDialog(null)}>
        <DialogContent data-testid="delete-user-dialog">
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {deleteDialog?.name}'s account? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)} data-testid="delete-user-cancel-btn">Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteUser} disabled={deleting} data-testid="delete-user-confirm-btn">
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
