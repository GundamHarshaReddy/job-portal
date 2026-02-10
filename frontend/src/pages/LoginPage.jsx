import React, { useState } from "react";
import { useAuth } from "@/App";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Briefcase, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

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

      {/* Right - Image */}
      <div className="hidden lg:block relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5" />
        <img
          src="https://images.unsplash.com/photo-1734208682292-df2643d0c8d9?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzZ8MHwxfHNlYXJjaHwzfHxtb2Rlcm4lMjBtaW5pbWFsJTIwb2ZmaWNlJTIwd29ya3NwYWNlJTIwYWVzdGhldGljfGVufDB8fHx8MTc3MDcwMjY5MXww&ixlib=rb-4.1.0&q=85"
          alt="Workspace"
          className="h-full w-full object-cover"
          data-testid="login-bg-image"
        />
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
