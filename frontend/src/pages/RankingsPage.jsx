import React, { useState, useEffect, useCallback } from "react";
import { useAuth, API } from "@/App";
import { getAvatarColor } from "@/lib/avatarUtils";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy, Medal, Award, Crown, Flame } from "lucide-react";

export default function RankingsPage() {
  const { user, token } = useAuth();
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchRankings = useCallback(async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get(`${API}/rankings`, { headers });
      setRankings(res.data);
    } catch {
      toast.error("Failed to load rankings");
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    fetchRankings();
  }, [fetchRankings]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const podium = rankings.slice(0, 3);
  const rest = rankings.slice(3);

  const podiumConfig = [
    {
      rank: 1,
      color: "from-amber-400 to-yellow-500",
      ring: "ring-amber-400/50",
      bg: "bg-amber-500/10",
      borderColor: "border-amber-400/30",
      icon: Crown,
      size: "h-24 w-24",
      textSize: "text-3xl",
      label: "1st",
    },
    {
      rank: 2,
      color: "from-slate-300 to-slate-400",
      ring: "ring-slate-400/50",
      bg: "bg-slate-400/10",
      borderColor: "border-slate-400/30",
      icon: Medal,
      size: "h-20 w-20",
      textSize: "text-2xl",
      label: "2nd",
    },
    {
      rank: 3,
      color: "from-amber-600 to-amber-700",
      ring: "ring-amber-600/50",
      bg: "bg-amber-700/10",
      borderColor: "border-amber-700/30",
      icon: Award,
      size: "h-18 w-18",
      textSize: "text-xl",
      label: "3rd",
    },
  ];

  // Reorder podium for display: 2nd, 1st, 3rd
  const displayOrder = [1, 0, 2];

  return (
    <div className="space-y-8 animate-fade-in" data-testid="rankings-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight" data-testid="rankings-heading">
          Leaderboard
        </h1>
        <p className="text-muted-foreground mt-1">See who's sharing the most opportunities</p>
      </div>

      {rankings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center" data-testid="rankings-empty-state">
          <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <Trophy className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold">No rankings yet</h3>
          <p className="text-muted-foreground text-sm mt-1">Post jobs to climb the leaderboard!</p>
        </div>
      ) : (
        <>
          {/* Podium */}
          <div className="flex items-end justify-center gap-4 sm:gap-8 pt-8 pb-4" data-testid="rankings-podium">
            {displayOrder.map((idx) => {
              const u = podium[idx];
              const config = podiumConfig[idx];
              if (!u) return <div key={idx} className="w-28" />;

              const styles = getAvatarColor(u.name);

              return (
                <div
                  key={u.user_id}
                  className={`flex flex-col items-center animate-scale-in`}
                  style={{ animationDelay: `${idx * 0.1}s` }}
                  data-testid={`podium-${config.label}`}
                >
                  <div className={`relative ${config.size} rounded-full bg-gradient-to-br ${styles.gradient} flex items-center justify-center ring-4 ${config.ring} mb-3`}>
                    <span className={`${config.textSize} font-bold text-white`}>
                      {u.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="absolute -top-2 -right-1">
                      <config.icon className="h-6 w-6 text-amber-500 drop-shadow" />
                    </div>
                  </div>
                  <p className="font-semibold text-sm text-center">{u.name}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <Flame className="h-3.5 w-3.5 text-primary" />
                    <span className="text-sm font-bold text-primary">{u.job_count}</span>
                    <span className="text-xs text-muted-foreground">posts</span>
                  </div>
                  <span className={`mt-2 px-3 py-0.5 rounded-full text-xs font-medium border ${config.bg} ${config.borderColor}`}>
                    {config.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Rest of rankings */}
          {rest.length > 0 && (
            <div className="space-y-2" data-testid="rankings-list">
              {rest.map((u, i) => {
                const styles = getAvatarColor(u.name);
                return (
                  <Card
                    key={u.user_id}
                    className="transition-all duration-200 hover:border-primary/30 animate-fade-in"
                    style={{ animationDelay: `${(i + 3) * 0.05}s` }}
                    data-testid={`ranking-row-${i + 4}`}
                  >
                    <CardContent className="flex items-center gap-4 p-4">
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground">
                        #{i + 4}
                      </div>
                      <div className={`h-10 w-10 rounded-full ${styles.bg} flex items-center justify-center text-sm font-semibold ${styles.text}`}>
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">{u.name}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Flame className="h-4 w-4 text-primary" />
                        <span className="text-lg font-bold">{u.job_count}</span>
                        <span className="text-xs text-muted-foreground">posts</span>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
