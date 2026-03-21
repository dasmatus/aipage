import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Timer, NotebookPen, Calculator, Play, Pause, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../lib/utils';
import browser from 'webextension-polyfill';

// ─── Timer Card ───────────────────────────────────────────────────────────────

const TimerCard: React.FC = () => {
    const [mode, setMode] = useState<'stopwatch' | 'countdown'>('stopwatch');
    const [running, setRunning] = useState(false);
    const [elapsed, setElapsed] = useState(0); // ms
    const [countdownMinutes, setCountdownMinutes] = useState('5');
    const [countdownTotal, setCountdownTotal] = useState(5 * 60 * 1000);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const startTimeRef = useRef<number>(0);
    const baseElapsedRef = useRef<number>(0);

    const stop = useCallback(() => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        setRunning(false);
    }, []);

    const start = useCallback(() => {
        startTimeRef.current = Date.now();
        setRunning(true);
        intervalRef.current = setInterval(() => {
            const delta = Date.now() - startTimeRef.current;
            const next = baseElapsedRef.current + delta;
            setElapsed(next);
            if (mode === 'countdown' && next >= countdownTotal) {
                stop();
                setElapsed(countdownTotal);
            }
        }, 100);
    }, [mode, countdownTotal, stop]);

    const reset = useCallback(() => {
        stop();
        baseElapsedRef.current = 0;
        setElapsed(0);
    }, [stop]);

    const handleStartStop = () => {
        if (running) {
            baseElapsedRef.current = elapsed;
            stop();
        } else {
            start();
        }
    };

    const handleSetCountdown = () => {
        const mins = parseFloat(countdownMinutes) || 5;
        const total = Math.round(mins * 60 * 1000);
        setCountdownTotal(total);
        stop();
        baseElapsedRef.current = 0;
        setElapsed(0);
    };

    useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

    const displayMs = mode === 'countdown' ? Math.max(0, countdownTotal - elapsed) : elapsed;
    const totalSec = Math.floor(displayMs / 1000);
    const mins = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const secs = String(totalSec % 60).padStart(2, '0');
    const isCountdownDone = mode === 'countdown' && displayMs === 0;

    return (
        <div className="space-y-3">
            <div className="flex gap-2 text-xs">
                <button
                    onClick={() => { setMode('stopwatch'); reset(); }}
                    className={cn("px-2 py-1 rounded-md transition-colors", mode === 'stopwatch' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                    Stopwatch
                </button>
                <button
                    onClick={() => { setMode('countdown'); reset(); }}
                    className={cn("px-2 py-1 rounded-md transition-colors", mode === 'countdown' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                    Countdown
                </button>
            </div>

            {mode === 'countdown' && (
                <div className="flex gap-2 items-center">
                    <Input
                        type="number"
                        value={countdownMinutes}
                        onChange={e => setCountdownMinutes(e.target.value)}
                        placeholder="Minutes"
                        className="h-7 text-xs w-20 bg-muted/30"
                        min="0.1"
                        step="0.5"
                    />
                    <span className="text-xs text-muted-foreground">min</span>
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={handleSetCountdown}>Set</Button>
                </div>
            )}

            <div className={cn(
                "text-4xl font-mono font-bold text-center py-2 tracking-widest transition-colors",
                isCountdownDone ? "text-destructive animate-pulse" : "text-foreground"
            )}>
                {mins}:{secs}
            </div>

            <div className="flex gap-2 justify-center">
                <Button size="sm" variant={running ? "secondary" : "default"} className="h-8 px-4" onClick={handleStartStop}>
                    {running ? <><Pause className="h-3 w-3 mr-1" /> Pause</> : <><Play className="h-3 w-3 mr-1" /> Start</>}
                </Button>
                <Button size="sm" variant="ghost" className="h-8 px-3" onClick={reset}>
                    <RotateCcw className="h-3 w-3" />
                </Button>
            </div>
        </div>
    );
};

// ─── Notes Card ───────────────────────────────────────────────────────────────

const NotesCard: React.FC = () => {
    const [notes, setNotes] = useState('');
    const [saved, setSaved] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        browser.storage.local.get('widget_notes').then((res: any) => {
            setNotes(res.widget_notes || '');
        });
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        setNotes(val);
        setSaved(false);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            await browser.storage.local.set({ widget_notes: val });
            setSaved(true);
            setTimeout(() => setSaved(false), 1500);
        }, 500);
    };

    return (
        <div className="space-y-2">
            <textarea
                value={notes}
                onChange={handleChange}
                placeholder="Quick notes..."
                className="w-full h-28 bg-muted/20 border border-border rounded-lg px-3 py-2 text-xs resize-none outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary placeholder:text-muted-foreground/50"
            />
            <p className={cn("text-[10px] text-right transition-opacity duration-500", saved ? "text-primary opacity-100" : "opacity-0")}>Saved</p>
        </div>
    );
};

// ─── Calculator Card ──────────────────────────────────────────────────────────

const CalculatorCard: React.FC = () => {
    const [expr, setExpr] = useState('');
    const [result, setResult] = useState<string | null>(null);
    const [history, setHistory] = useState<string[]>([]);
    const [error, setError] = useState(false);

    const evaluate = () => {
        if (!expr.trim()) return;
        try {
            // Safe eval: only allow digits, operators, parens, dot, space
            if (!/^[\d\s+\-*/().^%,]+$/.test(expr)) throw new Error('Invalid');
            const sanitized = expr.replace(/\^/g, '**');
            // eslint-disable-next-line no-new-func
            const val = Function(`'use strict'; return (${sanitized})`)();
            const res = String(val);
            setResult(res);
            setError(false);
            setHistory(prev => [`${expr} = ${res}`, ...prev.slice(0, 4)]);
        } catch {
            setResult('Error');
            setError(true);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') { e.preventDefault(); evaluate(); }
    };

    return (
        <div className="space-y-2">
            <div className="flex gap-2">
                <Input
                    value={expr}
                    onChange={e => { setExpr(e.target.value); setResult(null); setError(false); }}
                    onKeyDown={handleKeyDown}
                    placeholder="2 + 2 * 3"
                    className="h-8 text-xs bg-muted/30 font-mono"
                />
                <Button size="sm" className="h-8 px-3 shrink-0" onClick={evaluate}>=</Button>
            </div>
            {result !== null && (
                <div className={cn("text-center text-lg font-mono font-bold py-1", error ? "text-destructive" : "text-primary")}>
                    {result}
                </div>
            )}
            {history.length > 0 && (
                <div className="space-y-0.5">
                    {history.map((h, i) => (
                        <p key={i} className="text-[10px] text-muted-foreground font-mono cursor-pointer hover:text-foreground truncate"
                            onClick={() => { const parts = h.split(' = '); setExpr(parts[0]); setResult(null); }}>
                            {h}
                        </p>
                    ))}
                </div>
            )}
        </div>
    );
};

// ─── Collapsible Widget Wrapper ───────────────────────────────────────────────

interface WidgetCardProps {
    title: string;
    icon: React.ReactNode;
    children: React.ReactNode;
    defaultOpen?: boolean;
}

const WidgetCard: React.FC<WidgetCardProps> = ({ title, icon, children, defaultOpen = true }) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <Card className="overflow-hidden">
            <CardHeader
                className="py-3 px-4 bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors"
                onClick={() => setOpen(o => !o)}
            >
                <CardTitle className="text-sm flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {icon}
                        {title}
                    </div>
                    {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                </CardTitle>
            </CardHeader>
            {open && (
                <CardContent className="p-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    {children}
                </CardContent>
            )}
        </Card>
    );
};

// ─── Main WidgetsView ─────────────────────────────────────────────────────────

export const WidgetsView: React.FC = () => {
    return (
        <div className="flex flex-col h-full bg-background overflow-y-auto px-4 py-6 space-y-4">
            <header className="flex flex-col gap-1">
                <h2 className="text-2xl font-bold tracking-tight text-foreground">Widgets</h2>
                <p className="text-sm text-muted-foreground">Handy tools for studying.</p>
            </header>

            <WidgetCard title="Timer" icon={<Timer className="h-4 w-4 text-primary" />}>
                <TimerCard />
            </WidgetCard>

            <WidgetCard title="Notes" icon={<NotebookPen className="h-4 w-4 text-primary" />}>
                <NotesCard />
            </WidgetCard>

            <WidgetCard title="Calculator" icon={<Calculator className="h-4 w-4 text-primary" />} defaultOpen={false}>
                <CalculatorCard />
            </WidgetCard>
        </div>
    );
};
