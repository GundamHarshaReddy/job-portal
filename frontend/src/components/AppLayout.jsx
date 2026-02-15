import React, { useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/App";
import { useTheme } from "@/components/ThemeProvider";
import { getAvatarColor } from "@/lib/avatarUtils";
import {
  Briefcase,
  Plus,
  Trophy,
  Shield,
  LogOut,
  Sun,
  Moon,
  Menu,
  X,

} from "lucide-react";
import { Button } from "@/components/ui/button";

const navItems = [
  { to: "/jobs", label: "Jobs", icon: Briefcase },
  { to: "/add-job", label: "Post Job", icon: Plus },

  { to: "/rankings", label: "Rankings", icon: Trophy },
];

const adminItems = [
  { to: "/admin", label: "Dashboard", icon: Shield },
];

export default function AppLayout() {
  const { user, token, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);


  const handleLogout = () => {
    logout();
    navigate("/login");
  };



  const items = user?.role === "admin" ? [...adminItems, ...navItems] : navItems;

  return (
    <div className="min-h-screen bg-background" data-testid="app-layout">
      {/* Top Navigation */}
      <nav className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-xl" data-testid="main-nav">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <NavLink to="/" className="flex items-center gap-2.5 group" data-testid="nav-logo">
              <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center transition-transform group-hover:scale-105">
                <Briefcase className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold tracking-tight hidden sm:block">FriendBoard</span>
            </NavLink>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-1">
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  data-testid={`nav-${item.label.toLowerCase().replace(" ", "-")}`}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`
                  }
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              ))}
            </div>

            {/* Right actions */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                data-testid="theme-toggle-btn"
                className="text-muted-foreground hover:text-foreground"
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <div className="hidden sm:flex items-center gap-3 pl-3 border-l ml-1">
                <div className="flex items-center gap-3">
                  <div className="text-right hidden lg:block">
                    <NavLink to="/profile" className="text-sm font-medium leading-none hover:text-primary transition-colors">
                      {user?.name}
                    </NavLink>
                    <p className="text-xs text-muted-foreground mt-0.5 capitalize">{user?.role}</p>
                  </div>
                  <div className={`h-9 w-9 rounded-full ${user ? getAvatarColor(user.name).bg : 'bg-muted'} flex items-center justify-center border ring-2 ring-background`}>
                    <span className={`text-sm font-bold ${user ? getAvatarColor(user.name).text : 'text-muted-foreground'}`}>
                      {user?.name?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={handleLogout} data-testid="logout-btn" className="text-muted-foreground hover:text-destructive">
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => setMobileOpen(!mobileOpen)}
                data-testid="mobile-menu-btn"
              >
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile Nav */}
        {mobileOpen && (
          <div className="md:hidden border-t animate-fade-in" data-testid="mobile-menu">
            <div className="p-4 space-y-1">
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  data-testid={`mobile-nav-${item.label.toLowerCase().replace(" ", "-")}`}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`
                  }
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              ))}
              <div className="pt-3 border-t mt-3">
                <div className="flex items-center justify-between px-4 py-2">
                  <span className="text-sm text-muted-foreground">{user?.name} ({user?.role})</span>
                  <Button variant="ghost" size="sm" onClick={handleLogout} data-testid="mobile-logout-btn">
                    <LogOut className="h-4 w-4 mr-2" /> Logout
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>


    </div>
  );
}
