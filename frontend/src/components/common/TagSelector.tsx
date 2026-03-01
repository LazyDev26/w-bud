type Tag = 'planning' | 'execution' | 'both';

const tagStyles: Record<Tag, { active: string; label: string }> = {
  planning: { active: 'bg-violet-500/20 text-violet-400 ring-1 ring-violet-500/30', label: 'Plan' },
  execution: { active: 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30', label: 'Exec' },
  both: { active: 'bg-primary/20 text-primary ring-1 ring-primary/30', label: 'Both' },
};

interface TagSelectorProps {
  value: Tag;
  onChange: (tag: Tag) => void;
}

export default function TagSelector({ value, onChange }: TagSelectorProps) {
  return (
    <div className="flex items-center gap-1.5">
      {(Object.keys(tagStyles) as Tag[]).map((tag) => (
        <button
          key={tag}
          onClick={() => onChange(tag)}
          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
            value === tag ? tagStyles[tag].active : 'text-slate-600 hover:text-slate-400'
          }`}
        >
          {tagStyles[tag].label}
        </button>
      ))}
    </div>
  );
}

export type { Tag };
