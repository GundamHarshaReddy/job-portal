export function getAvatarColor(name) {
    if (!name) return {
        bg: "bg-slate-100 dark:bg-slate-800",
        text: "text-slate-600 dark:text-slate-400",
        ring: "ring-slate-100 dark:ring-slate-800",
        gradient: "from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700"
    };

    const colors = [
        { bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400", ring: "ring-red-500/20", gradient: "from-red-500/20 to-red-500/5" },
        { bg: "bg-orange-500/10", text: "text-orange-600 dark:text-orange-400", ring: "ring-orange-500/20", gradient: "from-orange-500/20 to-orange-500/5" },
        { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", ring: "ring-amber-500/20", gradient: "from-amber-500/20 to-amber-500/5" },
        { bg: "bg-yellow-500/10", text: "text-yellow-600 dark:text-yellow-400", ring: "ring-yellow-500/20", gradient: "from-yellow-500/20 to-yellow-500/5" },
        { bg: "bg-lime-500/10", text: "text-lime-600 dark:text-lime-400", ring: "ring-lime-500/20", gradient: "from-lime-500/20 to-lime-500/5" },
        { bg: "bg-green-500/10", text: "text-green-600 dark:text-green-400", ring: "ring-green-500/20", gradient: "from-green-500/20 to-green-500/5" },
        { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", ring: "ring-emerald-500/20", gradient: "from-emerald-500/20 to-emerald-500/5" },
        { bg: "bg-teal-500/10", text: "text-teal-600 dark:text-teal-400", ring: "ring-teal-500/20", gradient: "from-teal-500/20 to-teal-500/5" },
        { bg: "bg-cyan-500/10", text: "text-cyan-600 dark:text-cyan-400", ring: "ring-cyan-500/20", gradient: "from-cyan-500/20 to-cyan-500/5" },
        { bg: "bg-sky-500/10", text: "text-sky-600 dark:text-sky-400", ring: "ring-sky-500/20", gradient: "from-sky-500/20 to-sky-500/5" },
        { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", ring: "ring-blue-500/20", gradient: "from-blue-500/20 to-blue-500/5" },
        { bg: "bg-indigo-500/10", text: "text-indigo-600 dark:text-indigo-400", ring: "ring-indigo-500/20", gradient: "from-indigo-500/20 to-indigo-500/5" },
        { bg: "bg-violet-500/10", text: "text-violet-600 dark:text-violet-400", ring: "ring-violet-500/20", gradient: "from-violet-500/20 to-violet-500/5" },
        { bg: "bg-purple-500/10", text: "text-purple-600 dark:text-purple-400", ring: "ring-purple-500/20", gradient: "from-purple-500/20 to-purple-500/5" },
        { bg: "bg-fuchsia-500/10", text: "text-fuchsia-600 dark:text-fuchsia-400", ring: "ring-fuchsia-500/20", gradient: "from-fuchsia-500/20 to-fuchsia-500/5" },
        { bg: "bg-pink-500/10", text: "text-pink-600 dark:text-pink-400", ring: "ring-pink-500/20", gradient: "from-pink-500/20 to-pink-500/5" },
        { bg: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-400", ring: "ring-rose-500/20", gradient: "from-rose-500/20 to-rose-500/5" }
    ];

    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }

    const index = Math.abs(hash) % colors.length;
    return colors[index];
}
