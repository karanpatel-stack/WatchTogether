import { ListMusic, ChevronUp, ChevronDown, X } from 'lucide-react'
import type { QueueItem } from '../lib/types'

interface Props {
  queue: QueueItem[]
  onRemove: (itemId: string) => void
  onReorder: (itemId: string, newIndex: number) => void
}

export default function QueuePanel({ queue, onRemove, onReorder }: Props) {
  if (queue.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-white/20 p-6">
        <ListMusic className="w-12 h-12 mb-3 opacity-30" />
        <p className="text-sm font-medium">Queue is empty</p>
        <p className="text-xs mt-1 text-white/10 text-center">
          Use "Queue" button to add videos that play automatically when the current one ends
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-3 space-y-2">
        {queue.map((item, index) => (
          <div
            key={item.id}
            className="flex items-center gap-3 p-2 rounded-lg bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] backdrop-blur-sm transition-colors group"
          >
            {/* Thumbnail */}
            <div className="w-20 h-12 rounded overflow-hidden flex-shrink-0 bg-black/40">
              <img
                src={`https://img.youtube.com/vi/${item.videoId}/mqdefault.jpg`}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white/70 truncate">
                {item.videoId}
              </p>
              <p className="text-[10px] text-white/30 mt-0.5">
                Added by {item.addedBy}
              </p>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => onReorder(item.id, index - 1)}
                disabled={index === 0}
                className="p-1 rounded text-white/30 hover:text-white/60 hover:bg-white/[0.06] disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                title="Move up"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onReorder(item.id, index + 1)}
                disabled={index === queue.length - 1}
                className="p-1 rounded text-white/30 hover:text-white/60 hover:bg-white/[0.06] disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                title="Move down"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onRemove(item.id)}
                className="p-1 rounded text-white/30 hover:text-[var(--accent-text)] hover:bg-accent-500/10 transition-colors"
                title="Remove"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="px-3 pb-3">
        <p className="text-[10px] text-white/15 text-center">
          {queue.length} {queue.length === 1 ? 'video' : 'videos'} in queue
        </p>
      </div>
    </div>
  )
}
