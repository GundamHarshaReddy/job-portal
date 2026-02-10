import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, API } from "@/App";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format } from "date-fns";
import { CalendarIcon, ArrowLeft, Send } from "lucide-react";

export default function AddJobPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    company_name: "",
    role: "",
    job_type: "",
    location: "",
    apply_link: "",
  });
  const [deadline, setDeadline] = useState(null);
  const [loading, setLoading] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

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
      await axios.post(
        `${API}/jobs`,
        { ...form, deadline: deadline.toISOString() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("Job posted successfully! Notifications sent.");
      navigate("/jobs");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to post job");
    }
    setLoading(false);
  };

  return (
    <div className="max-w-2xl mx-auto animate-fade-in" data-testid="add-job-page">
      <Button
        variant="ghost"
        onClick={() => navigate("/jobs")}
        className="mb-6 -ml-2 text-muted-foreground hover:text-foreground"
        data-testid="add-job-back-btn"
      >
        <ArrowLeft className="h-4 w-4 mr-2" /> Back to Jobs
      </Button>

      <Card className="border">
        <CardHeader className="pb-4">
          <CardTitle className="text-2xl font-bold tracking-tight" data-testid="add-job-heading">Post a Job</CardTitle>
          <CardDescription>Share an opportunity with your friends</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5" data-testid="add-job-form">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="company">Company Name</Label>
                <Input
                  id="company"
                  placeholder="e.g. Google"
                  value={form.company_name}
                  onChange={(e) => handleChange("company_name", e.target.value)}
                  className="h-10"
                  data-testid="add-job-company-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Input
                  id="role"
                  placeholder="e.g. Software Engineer"
                  value={form.role}
                  onChange={(e) => handleChange("role", e.target.value)}
                  className="h-10"
                  data-testid="add-job-role-input"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Job Type</Label>
                <Select value={form.job_type} onValueChange={(v) => handleChange("job_type", v)}>
                  <SelectTrigger className="h-10" data-testid="add-job-type-select">
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
                  <SelectTrigger className="h-10" data-testid="add-job-location-select">
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

            <div className="space-y-2">
              <Label htmlFor="link">Apply Link</Label>
              <Input
                id="link"
                type="url"
                placeholder="https://careers.example.com/apply"
                value={form.apply_link}
                onChange={(e) => handleChange("apply_link", e.target.value)}
                className="h-10"
                data-testid="add-job-link-input"
              />
            </div>

            <div className="space-y-2">
              <Label>Application Deadline</Label>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={`w-full h-10 justify-start text-left font-normal ${!deadline ? "text-muted-foreground" : ""}`}
                    data-testid="add-job-deadline-btn"
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
                    disabled={(date) => date < new Date()}
                    initialFocus
                    data-testid="add-job-calendar"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                className="w-full h-11 font-semibold"
                disabled={loading}
                data-testid="add-job-submit-btn"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full" />
                    Posting...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Send className="h-4 w-4" /> Post Job
                  </div>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
