import React, { useState, useEffect } from "react";
import { useAuth, API } from "@/App";
import axios from "axios";
import {
    Building2,
    MapPin,
    Calendar,
    Clock,
    Briefcase,
    Send,
    Trash2,
    ExternalLink,
    User,
    Mail,
    Shield,
    Pencil
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getAvatarColor } from "@/lib/avatarUtils";
import { EmptyState } from "@/components/EmptyState";
import { EditJobDialog } from "@/components/EditJobDialog";
import { format } from "date-fns";
import { toast } from "sonner";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";

export default function ProfilePage() {
    const { user, token } = useAuth();
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [deleteDialog, setDeleteDialog] = useState(null);
    const [editDialog, setEditDialog] = useState(null);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        fetchUserJobs();
    }, []);

    const fetchUserJobs = async () => {
        try {
            const res = await axios.get(`${API}/users/me/jobs`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setJobs(res.data);
        } catch (err) {
            console.error(err);
            toast.error("Failed to load your jobs");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteDialog) return;
        setDeleting(true);
        try {
            await axios.delete(`${API}/jobs/${deleteDialog.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setJobs(jobs.filter(j => j.id !== deleteDialog.id));
            toast.success("Job deleted successfully");
            setDeleteDialog(null);
        } catch (err) {
            console.error(err);
            toast.error("Failed to delete job");
        } finally {
            setDeleting(false);
        }
    };

    const handleJobUpdated = (updatedJob) => {
        setJobs(jobs.map(j => j.id === updatedJob.id ? { ...j, ...updatedJob } : j));
    };

    if (!user) return null;

    const avatarStyle = getAvatarColor(user.name);

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
            {/* Profile Header */}
            <Card>
                <CardContent className="p-6 md:p-8 flex flex-col md:flex-row gap-8 items-center md:items-start">
                    <div className={`h-32 w-32 rounded-full ${avatarStyle.bg} flex items-center justify-center ring-4 ring-background shadow-xl`}>
                        <span className={`text-5xl font-bold ${avatarStyle.text}`}>
                            {user.name.charAt(0).toUpperCase()}
                        </span>
                    </div>

                    <div className="flex-1 space-y-4 text-center md:text-left">
                        <div>
                            <h1 className="text-3xl font-bold">{user.name}</h1>
                            <div className="flex items-center justify-center md:justify-start gap-2 text-muted-foreground mt-1">
                                <Mail className="h-4 w-4" />
                                <span>{user.email}</span>
                                <span className="mx-1">•</span>
                                <Shield className="h-4 w-4" />
                                <span className="capitalize">{user.role}</span>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-3 justify-center md:justify-start">
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium">
                                <Briefcase className="h-4 w-4" />
                                {jobs.length} Jobs Posted
                            </div>

                            {user.telegram_chat_id ? (
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-sm font-medium">
                                    <Send className="h-4 w-4" />
                                    Telegram Linked
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted text-muted-foreground text-sm font-medium">
                                    <Send className="h-4 w-4" />
                                    No Telegram Link
                                </div>
                            )}
                        </div>

                        {!user.telegram_chat_id && (
                            <div className="bg-muted/50 p-4 rounded-lg text-sm max-w-lg">
                                <p className="font-semibold mb-1">Get Job Alerts on Telegram 📱</p>
                                <p className="text-muted-foreground">
                                    Start the bot to link your account: <code className="bg-background px-1.5 py-0.5 rounded border text-foreground">/start {user.email}</code>
                                </p>
                                <a
                                    href="https://t.me/FriendBoardBot"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 text-primary hover:underline mt-2 font-medium"
                                >
                                    Open Telegram Bot <ExternalLink className="h-3 w-3" />
                                </a>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Posted Jobs */}
            <div className="space-y-4">
                <h2 className="text-xl font-bold flex items-center gap-2">
                    <Briefcase className="h-5 w-5" />
                    Your Posted Jobs
                </h2>

                {loading ? (
                    <div className="text-center py-12 text-muted-foreground">Loading specific jobs...</div>
                ) : jobs.length === 0 ? (
                    <EmptyState
                        title="No jobs posted yet"
                        description="You haven't posted any jobs. Share an opportunity with the community!"
                        action={
                            <Button onClick={() => window.location.href = "/add-job"} className="gap-2">
                                <div className="h-4 w-4" /> Post a Job
                            </Button>
                        }
                    />
                ) : (
                    <div className="grid gap-4">
                        {jobs.map((job) => (
                            <Card key={job.id} className="group transition-all hover:border-primary/50">
                                <CardContent className="p-5 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-bold text-lg">{job.role}</h3>
                                            <Badge variant="outline">{job.job_type}</Badge>
                                        </div>
                                        <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                            <Building2 className="h-3.5 w-3.5" /> {job.company_name}
                                            <span>•</span>
                                            <MapPin className="h-3.5 w-3.5" /> {job.location}
                                        </div>
                                        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                                            <span className="flex items-center gap-1">
                                                <Clock className="h-3 w-3" /> Posted {format(new Date(job.created_at), "MMM d, yyyy")}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Calendar className="h-3 w-3" /> Due {format(new Date(job.deadline), "MMM d, yyyy")}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 w-full md:w-auto mt-4 md:mt-0">
                                        <Button variant="outline" size="sm" className="flex-1 md:flex-none" onClick={() => window.open(job.apply_link, '_blank')}>
                                            View
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="text-muted-foreground hover:text-primary"
                                            onClick={() => setEditDialog(job)}
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="text-muted-foreground hover:text-destructive"
                                            onClick={() => setDeleteDialog(job)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            {/* Delete Dialog */}
            <Dialog open={!!deleteDialog} onOpenChange={() => setDeleteDialog(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Job</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete "{deleteDialog?.role}" at {deleteDialog?.company_name}? This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteDialog(null)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                            {deleting ? "Deleting..." : "Delete"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <EditJobDialog
                job={editDialog}
                open={!!editDialog}
                onOpenChange={(open) => !open && setEditDialog(null)}
                onJobUpdated={handleJobUpdated}
            />
        </div>
    );
}
