import React, { useState, useEffect } from "react";
import { useAuth, API } from "@/App";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { JOB_SOURCES, getSourceConfig } from "@/lib/jobSources";
import { Calendar } from "@/components/ui/calendar";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { format } from "date-fns";
import { CalendarIcon, Save } from "lucide-react";

export function EditJobDialog({ job, open, onOpenChange, onJobUpdated }) {
    const { token } = useAuth();
    const [loading, setLoading] = useState(false);
    const [calendarOpen, setCalendarOpen] = useState(false);

    const [form, setForm] = useState({
        company_name: "",
        role: "",
        job_type: "",
        location: "",
        apply_link: "",
        source: "company_website",
    });
    const [deadline, setDeadline] = useState(null);

    useEffect(() => {
        if (job) {
            setForm({
                company_name: job.company_name,
                role: job.role,
                job_type: job.job_type,
                location: job.location,
                apply_link: job.apply_link,
                source: job.source || "company_website",
            });
            setDeadline(new Date(job.deadline));
        }
    }, [job]);

    const handleChange = (field, value) => {
        setForm((prev) => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!form.company_name || !form.role || !form.job_type || !form.location || !form.apply_link || !deadline) {
            toast.error("Please fill in all fields");
            return;
        }

        setLoading(true);
        try {
            const res = await axios.put(
                `${API}/jobs/${job.id || job._id}`, // Handle both id formats if inconsistent
                { ...form, deadline: deadline.toISOString() },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            toast.success("Job updated successfully!");
            if (onJobUpdated) onJobUpdated(res.data);
            onOpenChange(false);
        } catch (err) {
            console.error(err);
            toast.error(err.response?.data?.detail || "Failed to update job");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Edit Job</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="edit-company">Company Name</Label>
                            <Input
                                id="edit-company"
                                value={form.company_name}
                                onChange={(e) => handleChange("company_name", e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-role">Role</Label>
                            <Input
                                id="edit-role"
                                value={form.role}
                                onChange={(e) => handleChange("role", e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Job Type</Label>
                            <Select value={form.job_type} onValueChange={(v) => handleChange("job_type", v)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Job">Job</SelectItem>
                                    <SelectItem value="Internship">Internship</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Location</Label>
                            <Select value={form.location} onValueChange={(v) => handleChange("location", v)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select location" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Remote">Remote</SelectItem>
                                    <SelectItem value="Onsite">Onsite</SelectItem>
                                    <SelectItem value="Hybrid">Hybrid</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Job Source</Label>
                            <Select value={form.source} onValueChange={(v) => handleChange("source", v)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select source" />
                                </SelectTrigger>
                                <SelectContent className="max-h-[200px]">
                                    {JOB_SOURCES.map((src) => (
                                        <SelectItem key={src.value} value={src.value}>
                                            {src.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="edit-link">Apply Link</Label>
                        <Input
                            id="edit-link"
                            type="url"
                            value={form.apply_link}
                            onChange={(e) => handleChange("apply_link", e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Application Deadline</Label>
                        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className={`w-full justify-start text-left font-normal ${!deadline ? "text-muted-foreground" : ""}`}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {deadline ? format(deadline, "PPP") : "Pick a date"}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    mode="single"
                                    selected={deadline}
                                    onSelect={(date) => {
                                        setDeadline(date);
                                        setCalendarOpen(false);
                                    }}
                                    initialFocus
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                    <DialogFooter className="mt-4">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? "Saving..." : "Save Changes"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
