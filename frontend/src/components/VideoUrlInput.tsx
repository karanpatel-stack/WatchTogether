import { useState } from 'react'
import { Link, Loader2, ListPlus } from 'lucide-react'

interface Props {
  onLoadVideo: (url: string) => void
  onAddToQueue?: (url: string) => void
}

export default function VideoUrlInput({ onLoadVideo, onAddToQueue }: Props) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [queueLoading, setQueueLoading] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return
    setLoading(true)
    onLoadVideo(url.trim())
    setTimeout(() => {
      setLoading(false)
      setUrl('')
    }, 500)
  }

  const handleAddToQueue = () => {
    if (!url.trim() || !onAddToQueue) return
    setQueueLoading(true)
    onAddToQueue(url.trim())
    setTimeout(() => {
      setQueueLoading(false)
      setUrl('')
    }, 500)
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.10] bg-white/[0.07] backdrop-blur-xl">
      <div className="flex-1 flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 focus-within:border-red-500/30 focus-within:bg-white/[0.07] transition-all">
        <Link className="w-4 h-4 text-white/20 flex-shrink-0" />
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste YouTube URL here..."
          className="flex-1 bg-transparent text-white text-sm placeholder-white/20 outline-none min-w-0"
        />
      </div>
      <button
        type="submit"
        disabled={!url.trim() || loading}
        className="px-4 py-2 bg-red-600/80 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
        Play Now
      </button>
      {onAddToQueue && (
        <button
          type="button"
          onClick={handleAddToQueue}
          disabled={!url.trim() || queueLoading}
          className="px-3 py-2 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] hover:border-white/[0.15] text-white text-xs font-semibold rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5 whitespace-nowrap"
        >
          {queueLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ListPlus className="w-3.5 h-3.5" />}
          Queue
        </button>
      )}
    </form>
  )
}
