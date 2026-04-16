import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { performRequest } from '../../providers/utils';

interface Teacher {
    id: number;
    name: string;
    subject: string;
    department: string;
    description: string | null;
    imageUrl: string;
    avgRating: number | null;
    ratingCount: number;
}

const AVATAR_COLORS = ['#e53e3e', '#dd6b20', '#d69e2e', '#38a169', '#319795', '#3182ce', '#805ad5', '#d53f8c'];

function nameToColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string): string {
    return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

export function RatehalováView() {
    const [teachers, setTeachers] = useState<Teacher[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        performRequest('https://ratehalova.com/api/teachers', 'GET', {}, null)
            .then((data: Teacher[]) => setTeachers(data))
            .catch((err: Error) => setError(err.message))
            .finally(() => setLoading(false));
    }, []);

    const filtered = search
        ? teachers.filter(t => {
              const q = search.toLowerCase();
              return (
                  t.name.toLowerCase().includes(q) ||
                  t.department.toLowerCase().includes(q) ||
                  t.subject.toLowerCase().includes(q)
              );
          })
        : teachers;

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="px-3 py-2 border-b shrink-0">
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Hľadaj podľa mena alebo predmetu..."
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-muted rounded-md border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto">
                {loading && (
                    <p className="text-xs text-muted-foreground text-center py-8">Načítavam...</p>
                )}
                {error && (
                    <p className="text-xs text-destructive text-center py-8">{error}</p>
                )}
                {!loading && !error && filtered.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-8">Žiadni učitelia</p>
                )}
                {!loading && !error && filtered.map(teacher => (
                    <div key={teacher.id} className="flex items-center gap-2.5 px-3 py-2 border-b last:border-b-0 hover:bg-muted/50 transition-colors">
                        <div
                            className="shrink-0 w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-white text-[10px] font-bold"
                            style={{ backgroundColor: nameToColor(teacher.name) }}
                        >
                            {teacher.imageUrl
                                ? <img src={teacher.imageUrl} alt="" className="w-full h-full object-cover" />
                                : initials(teacher.name)
                            }
                        </div>

                        <div className="flex-1 min-w-0">
                            <a
                                href={`https://ratehalova.com/teachers/${teacher.id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-medium text-primary hover:underline block truncate"
                            >
                                {teacher.name}
                            </a>
                            <p className="text-[10px] text-muted-foreground truncate">
                                {teacher.department} · <span className="font-medium">{teacher.subject}</span>
                            </p>
                            {teacher.avgRating !== null ? (
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <div className="h-1 rounded-full bg-muted flex-1 max-w-[56px] overflow-hidden">
                                        <div
                                            className="h-1 rounded-full bg-green-500"
                                            style={{ width: `${(teacher.avgRating / 10) * 100}%` }}
                                        />
                                    </div>
                                    <span className="text-[10px] font-semibold">{teacher.avgRating.toFixed(1)}</span>
                                    <span className="text-[10px] text-muted-foreground">({teacher.ratingCount}x)</span>
                                </div>
                            ) : (
                                <p className="text-[10px] text-muted-foreground/60 mt-0.5">žiadne hodnotenia</p>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {!loading && !error && (
                <p className="text-[10px] text-muted-foreground text-center py-1.5 border-t shrink-0">
                    {filtered.length} / {teachers.length} učiteľov
                </p>
            )}
        </div>
    );
}
