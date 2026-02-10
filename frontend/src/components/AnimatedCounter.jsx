import React, { useEffect, useState } from "react";

export function AnimatedCounter({ value, duration = 1000 }) {
    const [count, setCount] = useState(0);

    useEffect(() => {
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);

            // Easing function for smooth deceleration (easeOutExpo)
            const easeOutExpo = (x) => (x === 1 ? 1 : 1 - Math.pow(2, -10 * x));

            setCount(Math.floor(easeOutExpo(progress) * value));

            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };

        window.requestAnimationFrame(step);
    }, [value, duration]);

    return <span>{count}</span>;
}
