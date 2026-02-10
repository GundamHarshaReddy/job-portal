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
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          <TabsTrigger value="users" data-testid="admin-tab-users">
            <Users className="h-4 w-4 mr-2" /> Users ({users.length})
          </TabsTrigger>
          <TabsTrigger value="jobs" data-testid="admin-tab-jobs">
            <Briefcase className="h-4 w-4 mr-2" /> Jobs ({jobs.length})
          </TabsTrigger>
          <TabsTrigger value="broadcast" data-testid="admin-tab-broadcast">
            <MessageSquare className="h-4 w-4 mr-2" /> Broadcast
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
