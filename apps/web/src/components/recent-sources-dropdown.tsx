import { History, X, Trash2, FileCode, Link } from "lucide-react";
import { SiGithub, SiGitlab, SiBitbucket } from "@icons-pack/react-simple-icons";

import { Button } from "~/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { ScrollArea } from "~/components/ui/scroll-area";
import type { RecentSource } from "~/hooks/use-recent-sources";
import type { SourceType } from "@fileconcat/core";

interface RecentSourcesDropdownProps {
  sources: RecentSource[];
  onSelect: (source: RecentSource) => void;
  onRemove: (url: string) => void;
  onClear: () => void;
  disabled?: boolean;
}

const SOURCE_ICONS: Record<SourceType, React.ReactNode> = {
  github: <SiGithub className="h-3.5 w-3.5" />,
  gitlab: <SiGitlab className="h-3.5 w-3.5" />,
  bitbucket: <SiBitbucket className="h-3.5 w-3.5" />,
  gist: <FileCode className="h-3.5 w-3.5" />,
  url: <Link className="h-3.5 w-3.5" />,
  local: null,
};

function formatTimestamp(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  if (diff < 604800_000) return `${Math.floor(diff / 86400_000)}d ago`;

  return new Date(timestamp).toLocaleDateString();
}

export function RecentSourcesDropdown({
  sources,
  onSelect,
  onRemove,
  onClear,
  disabled,
}: RecentSourcesDropdownProps) {
  if (sources.length === 0) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" disabled={disabled} title="Recent sources">
          <History className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Recent Sources</span>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive h-7 text-xs"
            onClick={onClear}
          >
            <Trash2 className="mr-1 h-3 w-3" />
            Clear
          </Button>
        </div>
        <ScrollArea className="max-h-[250px]">
          <div className="p-1">
            {sources.map((source) => (
              <div
                key={source.url}
                className="hover:bg-accent group flex items-center gap-2 rounded-md px-2 py-1.5"
              >
                <button
                  className="flex flex-1 items-center gap-2 text-left"
                  onClick={() => onSelect(source)}
                >
                  <span className="text-muted-foreground shrink-0">
                    {SOURCE_ICONS[source.type]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{source.name}</div>
                    <div className="text-muted-foreground truncate text-xs">{source.url}</div>
                  </div>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {formatTimestamp(source.timestamp)}
                  </span>
                </button>
                <button
                  className="hover:text-destructive shrink-0 p-1 opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(source.url);
                  }}
                  title="Remove from history"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
