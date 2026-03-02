import React, { useState, useEffect } from "react";
import { useAuth } from "@/App";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Briefcase, Eye, EyeOff, Users, FileText, Send } from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import { AnimatedCounter } from "@/components/AnimatedCounter";

const API = `${process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"}/api`;

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    axios.get(`${API}/public/stats`)
      .then(res => setStats(res.data))
      .catch(() => { }); // silently fail — stats are non-critical
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please fill in all fields");
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Welcome back!");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Invalid credentials");
    }
    setLoading(false);
  };

  const statItems = [
    { label: "Job Postings", value: stats?.total_job_postings || 0, icon: Briefcase, color: "text-blue-500" },
    { label: "Applications", value: stats?.total_applications || 0, icon: Send, color: "text-emerald-500" },
    { label: "Active Users", value: stats?.active_users || 0, icon: Users, color: "text-violet-500" },
  ];

  return (
    <div className="min-h-screen grid lg:grid-cols-2" data-testid="login-page">
      {/* Left - Form */}
      <div className="flex items-center justify-center p-8 md:p-12">
        <div className="w-full max-w-md animate-fade-in">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-12">
            <div className="h-11 w-11 rounded-xl bg-primary flex items-center justify-center">
              <Briefcase className="h-6 w-6 text-primary-foreground" />
            </div>
            <span className="text-2xl font-bold tracking-tight">FriendBoard</span>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight" data-testid="login-heading">
              Welcome back
            </h1>
            <p className="text-muted-foreground mt-3 text-base">
              Sign in to access job listings shared by your circle.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5" data-testid="login-form">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11"
                data-testid="login-email-input"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPass ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 pr-10"
                  data-testid="login-password-input"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="login-toggle-password"
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button
              type="submit"
              className="w-full h-11 text-sm font-semibold"
              disabled={loading}
              data-testid="login-submit-btn"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="animate-spin h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full" />
                  Signing in...
                </div>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground mt-8 text-center">
            This is a private platform. Contact your admin for access.
          </p>
        </div>
      </div>

      {/* Right - Image + Stats */}
      <div className="hidden lg:block relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5" />
        <img
          src="https://images.unsplash.com/photo-1734208682292-df2643d0c8d9?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzZ8MHwxfHNlYXJjaHwzfHxtb2Rlcm4lMjBtaW5pbWFsJTIwb2ZmaWNlJTIwd29ya3NwYWNlJTIwYWVzdGhldGljfGVufDB8fHx8MTc3MDcwMjY5MXww&ixlib=rb-4.1.0&q=85"
          alt="Workspace"
          className="h-full w-full object-cover"
          data-testid="login-bg-image"
        />

        {/* Stats bar */}
        {stats && (
          <div className="absolute top-8 left-8 right-8">
            <div className="grid grid-cols-3 gap-3">
              {statItems.map((s) => (
                <Card key={s.label} className="bg-background/80 backdrop-blur-xl border-border/50">
                  <CardContent className="p-4 flex flex-col items-center text-center">
                    <s.icon className={`h-5 w-5 mb-1.5 ${s.color}`} />
                    <span className="text-2xl font-bold tracking-tight">
                      <AnimatedCounter value={s.value} />+
                    </span>
                    <span className="text-xs text-muted-foreground mt-0.5">{s.label}</span>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        <div className="absolute bottom-12 left-12 right-12">
          <Card className="bg-background/80 backdrop-blur-xl border-border/50">
            <CardContent className="p-6">
              <p className="text-sm font-medium">"Best way to help your friends is to share opportunities."</p>
              <p className="text-xs text-muted-foreground mt-2">-- FriendBoard Community</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
