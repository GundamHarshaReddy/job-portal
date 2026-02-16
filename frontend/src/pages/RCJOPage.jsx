import React, { useState, useEffect } from "react";
import axios from "axios";
import { API } from "../App";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Briefcase, MapPin, ExternalLink, Calendar, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function RCJOPage() {
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        fetchJobs();
    }, []);

    const fetchJobs = async () => {
        try {
            // Assuming the endpoint doesn't require auth token if it's public
            // but in server.py I added get_current_user, so we need auth.
            // We will use axios interceptor or just pass the token if available.
            // But let's assume the user is logged in as per App structure.
            const token = localStorage.getItem("fb_token");
            const headers = token ? { Authorization: `Bearer ${token}` } : {};

            const res = await axios.get(`${API}/rcjo-jobs`, { headers });
            setJobs(res.data);
        } catch (error) {
            console.error("Failed to fetch RCJO jobs", error);
        } finally {
            setLoading(false);
        }
    };

    const filteredJobs = jobs.filter(
        (job) =>
            job.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
            job.company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            job.location.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Real Companies Job Opportunities</h1>
                    <p className="text-muted-foreground mt-1">
                        Curated list of opportunities scraped daily efficiently.
                    </p>
                </div>
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search roles, companies, or locations..."
                    className="pl-9 h-10 w-full md:w-[400px]"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="h-40 bg-muted/20 animate-pulse rounded-xl" />
                    ))}
                </div>
            ) : filteredJobs.length === 0 ? (
                <div className="text-center py-12 bg-muted/30 rounded-xl border border-dashed">
                    <Briefcase className="mx-auto h-12 w-12 text-muted-foreground/50" />
                    <h3 className="mt-4 text-lg font-semibold">No jobs found</h3>
                    <p className="text-muted-foreground">Try adjusting your search filters.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredJobs.map((job) => (
                        <Card key={job.id} className="hover:shadow-md transition-shadow group border-l-4 border-l-primary/50">
                            <CardHeader className="pb-3">
                                <div className="flex justify-between items-start gap-4">
                                    <div>
                                        <CardTitle className="text-lg font-bold group-hover:text-primary transition-colors">
                                            {job.role}
                                        </CardTitle>
                                        <CardDescription className="font-medium text-foreground/80 mt-1">
                                            {job.company_name}
                                        </CardDescription>
                                    </div>
                                    {job.job_type && (
                                        <Badge variant="secondary" className="capitalize shrink-0">
                                            {job.job_type}
                                        </Badge>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent className="pb-3 text-sm space-y-2.5">
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <MapPin className="h-3.5 w-3.5" />
                                    <span>{job.location}</span>
                                </div>
                                {job.deadline && (
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <Calendar className="h-3.5 w-3.5" />
                                        <span>Deadline: {job.deadline.split("T")[0]}</span>
                                    </div>
                                )}
                            </CardContent>
                            <CardFooter className="pt-2">
                                <Button className="w-full gap-2 font-medium" asChild>
                                    <a href={job.apply_link} target="_blank" rel="noopener noreferrer">
                                        Apply Now <ExternalLink className="h-3.5 w-3.5" />
                                    </a>
                                </Button>
                            </CardFooter>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
