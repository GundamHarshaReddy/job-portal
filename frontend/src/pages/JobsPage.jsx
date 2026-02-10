import React, { useState, useEffect, useCallback } from "react";
import { useAuth, API } from "@/App";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Search,
  ExternalLink,
  Trash2,
  MoreVertical,
  Calendar,
  MapPin,
  Building2,
  Briefcase,
  Clock,
  Inbox,
} from "lucide-react";

export default function JobsPage() {
  const { user, token } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [deleteDialog, setDeleteDialog] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/jobs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setJobs(res.data);
    } catch {
      toast.error("Failed to load jobs");
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const handleDelete = async () => {
    if (!deleteDialog) return;
    setDeleting(true);
    try {
      await axios.delete(`${API}/jobs/${deleteDialog.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success("Job deleted");
      setJobs((prev) => prev.filter((j) => j.id !== deleteDialog.id));
      setDeleteDialog(null);
    } catch {
      toast.error("Failed to delete job");
    }
    setDeleting(false);
  };

  const filtered = jobs.filter((job) => {
    const matchSearch =
      job.company_name.toLowerCase().includes(search.toLowerCase()) ||
      job.role.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === "all" || job.job_type === typeFilter;
    const matchLocation = locationFilter === "all" || job.location === locationFilter;
    return matchSearch && matchType && matchLocation;
  });

  const isExpired = (deadline) => {
    try {
      return new Date(deadline) < new Date();
    } catch {
      return false;
    }
  };

  const formatDate = (dateStr) => {
    try {
      return new Date(dateStr).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const typeBadgeColor = (type) => {
    return type === "Internship" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
  };

  const locationBadgeColor = (loc) => {
    if (loc === "Remote") return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
    if (loc === "Hybrid") return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20";
    return "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in" data-testid="jobs-page">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight" data-testid="jobs-heading">Job Listings</h1>
        <p className="text-muted-foreground mt-1">Browse opportunities shared by your friends</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3" data-testid="jobs-filters">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search jobs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10"
            data-testid="jobs-search-input"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-[160px]" data-testid="jobs-type-filter">
            <SelectValue placeholder="Job Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="Job">Job</SelectItem>
            <SelectItem value="Internship">Internship</SelectItem>
          </SelectContent>
        </Select>
        <Select value={locationFilter} onValueChange={setLocationFilter}>
          <SelectTrigger className="w-full sm:w-[160px]" data-testid="jobs-location-filter">
            <SelectValue placeholder="Location" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Locations</SelectItem>
            <SelectItem value="Remote">Remote</SelectItem>
            <SelectItem value="Onsite">Onsite</SelectItem>
            <SelectItem value="Hybrid">Hybrid</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Job List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center" data-testid="jobs-empty-state">
          <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <Inbox className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold">No jobs found</h3>
          <p className="text-muted-foreground text-sm mt-1">
            {jobs.length === 0 ? "Be the first to post a job!" : "Try adjusting your filters"}
          </p>
        </div>
      ) : (
        <div className="space-y-3" data-testid="jobs-list">
          {filtered.map((job, i) => (
            <Card
              key={job.id}
              data-testid={`job-card-${job.id}`}
              className={`group transition-all duration-200 hover:border-primary/30 hover:shadow-md ${
                isExpired(job.deadline) ? "opacity-60" : ""
              } animate-fade-in`}
              style={{ animationDelay: `${i * 0.04}s` }}
            >
              <CardContent className="p-5">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  {/* Company icon */}
                  <div className="hidden sm:flex h-12 w-12 rounded-xl bg-primary/5 border border-primary/10 items-center justify-center flex-shrink-0">
                    <Building2 className="h-6 w-6 text-primary" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-base leading-tight">{job.role}</h3>
                        <p className="text-sm text-muted-foreground mt-0.5">{job.company_name}</p>
                      </div>
                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <a
                          href={job.apply_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-testid={`job-apply-${job.id}`}
                        >
                          <Button size="sm" className="hidden sm:flex gap-1.5 h-8">
                            Apply <ExternalLink className="h-3 w-3" />
                          </Button>
                        </a>
                        {(user?.role === "admin" || job.posted_by === user?.id) && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`job-menu-${job.id}`}>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleteDialog(job)}
                                data-testid={`job-delete-${job.id}`}
                              >
                                <Trash2 className="h-4 w-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>

                    {/* Tags */}
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border ${typeBadgeColor(job.job_type)}`}>
                        <Briefcase className="h-3 w-3 mr-1" />
                        {job.job_type}
                      </span>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border ${locationBadgeColor(job.location)}`}>
                        <MapPin className="h-3 w-3 mr-1" />
                        {job.location}
                      </span>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium text-muted-foreground">
                        <Calendar className="h-3 w-3 mr-1" />
                        {isExpired(job.deadline) ? "Expired" : `Due ${formatDate(job.deadline)}`}
                      </span>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs text-muted-foreground">
                        <Clock className="h-3 w-3 mr-1" />
                        by {job.posted_by_name}
                      </span>
                    </div>

                    {/* Mobile apply */}
                    <a href={job.apply_link} target="_blank" rel="noopener noreferrer" className="sm:hidden mt-3 block" data-testid={`job-apply-mobile-${job.id}`}>
                      <Button size="sm" className="w-full gap-1.5">
                        Apply <ExternalLink className="h-3 w-3" />
                      </Button>
                    </a>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Dialog */}
      <Dialog open={!!deleteDialog} onOpenChange={() => setDeleteDialog(null)}>
        <DialogContent data-testid="delete-job-dialog">
          <DialogHeader>
            <DialogTitle>Delete Job</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteDialog?.role}" at {deleteDialog?.company_name}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)} data-testid="delete-job-cancel-btn">Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} data-testid="delete-job-confirm-btn">
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
