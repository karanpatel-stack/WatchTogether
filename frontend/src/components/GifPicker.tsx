import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Loader2 } from 'lucide-react'

interface GifResult {
  id: string
  images: {
    fixed_height_small: { url: string; width: string; height: string }
    fixed_height: { url: string; width: string; height: string }
    original: { url: string }
  }
  title: string
}

interface Props {
  onSelect: (gifUrl: string) => void
  onClose: () => void
}

const GIPHY_API_KEY = 'GlVGYHkr3WSBnllca54iNt0yFbjz7L65'
const GIPHY_BASE = 'https://api.giphy.com/v1/gifs'

export default function GifPicker({ onSelect, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [gifs, setGifs] = useState<GifResult[]>([])
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const fetchGifs = useCallback(async (searchQuery: string) => {
    setLoading(true)
    try {
      const endpoint = searchQuery.trim()
        ? `${GIPHY_BASE}/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(searchQuery)}&limit=20&rating=g`
        : `${GIPHY_BASE}/trending?api_key=${GIPHY_API_KEY}&limit=20&rating=g`
      const res = await fetch(endpoint)
      const json = await res.json()
      setGifs(json.data || [])
    } catch {
      setGifs([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchGifs('')
  }, [fetchGifs])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetchGifs(query)
    }, 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, fetchGifs])

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full left-0 mb-2 z-50 w-80 max-h-96 bg-[#14141e] border border-white/10 rounded-2xl overflow-hidden flex flex-col shadow-xl"
    >
      {/* Search */}
      <div className="p-2 border-b border-white/[0.08]">
        <div className="flex items-center gap-2 bg-white/[0.06] rounded-lg px-2.5 py-1.5">
          <Search className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search GIFs..."
            className="flex-1 bg-transparent text-white text-xs placeholder-white/20 outline-none min-w-0"
            autoFocus
          />
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading && gifs.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-white/30" />
          </div>
        ) : gifs.length === 0 ? (
          <p className="text-center text-white/20 text-xs py-8">No GIFs found</p>
        ) : (
          <div className="columns-2 gap-1.5">
            {gifs.map((gif) => (
              <button
                key={gif.id}
                onClick={() => {
                  onSelect(gif.images.original.url)
                  onClose()
                }}
                className="block w-full mb-1.5 rounded-lg overflow-hidden hover:opacity-80 transition-opacity"
              >
                <img
                  src={gif.images.fixed_height_small.url}
                  alt={gif.title}
                  className="w-full h-auto"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* GIPHY attribution */}
      <div className="px-2 py-1.5 border-t border-white/[0.08] flex items-center justify-center">
        <span className="text-[9px] text-white/20">Powered by GIPHY</span>
      </div>
    </div>
  )
}
