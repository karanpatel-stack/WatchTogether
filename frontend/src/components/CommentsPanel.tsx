import { useState, useEffect, useCallback, useRef } from 'react'
import { MessageCircle, ThumbsUp, Loader2, AlertCircle, ArrowUpDown } from 'lucide-react'

interface Comment {
  author: string
  authorThumbnails?: { url: string; width: number; height: number }[]
  content: string
  contentHtml: string
  likeCount: number
  publishedText: string
  commentId: string
}

interface CommentsResponse {
  commentCount?: number
  comments: Comment[]
  continuation?: string
}

interface Props {
  videoId: string
}

const SERVER_URL = import.meta.env.VITE_SERVER_URL || ''

export default function CommentsPanel({ videoId }: Props) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [continuation, setContinuation] = useState<string | undefined>()
  const [sortBy, setSortBy] = useState<'top' | 'new'>('top')
  const [loadingMore, setLoadingMore] = useState(false)
  const lastVideoId = useRef('')
  const lastSortBy = useRef(sortBy)

  const fetchComments = useCallback(async (vid: string, sort: 'top' | 'new', cont?: string) => {
    if (!vid) return

    const isLoadMore = !!cont
    if (isLoadMore) {
      setLoadingMore(true)
    } else {
      setLoading(true)
      setError('')
    }

    try {
      let url = `${SERVER_URL}/api/comments/${vid}?sort_by=${sort}`
      if (cont) {
        url += `&continuation=${encodeURIComponent(cont)}`
      }

      const res = await fetch(url)
      if (!res.ok) {
        throw new Error('Failed to load comments')
      }

      const data: CommentsResponse = await res.json()

      if (isLoadMore) {
        setComments((prev) => [...prev, ...data.comments])
      } else {
        setComments(data.comments || [])
      }
      setContinuation(data.continuation)
    } catch {
      setError('Could not load comments. Try again later.')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    if (videoId && (videoId !== lastVideoId.current || sortBy !== lastSortBy.current)) {
      lastVideoId.current = videoId
      lastSortBy.current = sortBy
      setComments([])
      setContinuation(undefined)
      fetchComments(videoId, sortBy)
    }
  }, [videoId, sortBy, fetchComments])

  const handleLoadMore = () => {
    if (continuation && videoId) {
      fetchComments(videoId, sortBy, continuation)
    }
  }

  const toggleSort = () => {
    setSortBy((prev) => (prev === 'top' ? 'new' : 'top'))
  }

  if (!videoId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-white/20 p-6">
        <MessageCircle className="w-12 h-12 mb-3 opacity-30" />
        <p className="text-sm font-medium">No video loaded</p>
        <p className="text-xs mt-1 text-white/10">
          Load a video to see its comments
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-white/30">
        <Loader2 className="w-6 h-6 animate-spin mb-2" />
        <p className="text-xs">Loading comments...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-white/20 p-6">
        <AlertCircle className="w-10 h-10 mb-3 opacity-40 text-[var(--accent-text)]" />
        <p className="text-sm font-medium text-[var(--accent-text)] opacity-60">{error}</p>
        <button
          onClick={() => fetchComments(videoId, sortBy)}
          className="mt-3 px-4 py-1.5 text-xs font-medium rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-white/50 hover:text-white/70 transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  if (comments.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-white/20 p-6">
        <MessageCircle className="w-12 h-12 mb-3 opacity-30" />
        <p className="text-sm font-medium">No comments found</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Sort toggle */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.08]">
        <span className="text-[10px] text-white/20 uppercase tracking-wider">
          {comments.length} comments
        </span>
        <button
          onClick={toggleSort}
          className="flex items-center gap-1.5 text-[10px] text-white/30 hover:text-white/50 transition-colors uppercase tracking-wider"
        >
          <ArrowUpDown className="w-3 h-3" />
          {sortBy === 'top' ? 'Top' : 'Newest'}
        </button>
      </div>

      {/* Comments list */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-3 space-y-3">
          {comments.map((comment) => (
            <div key={comment.commentId} className="flex gap-2.5">
              {/* Avatar */}
              <div className="w-7 h-7 rounded-full bg-white/[0.06] flex-shrink-0 overflow-hidden">
                {comment.authorThumbnails?.[0]?.url ? (
                  <img
                    src={comment.authorThumbnails[0].url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] text-white/30">
                    {comment.author?.[0] || '?'}
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-white/50 truncate">
                    {comment.author}
                  </span>
                  <span className="text-[10px] text-white/15 flex-shrink-0">
                    {comment.publishedText}
                  </span>
                </div>
                <p className="text-xs text-white/40 mt-0.5 leading-relaxed break-words whitespace-pre-wrap">
                  {comment.content}
                </p>
                {comment.likeCount > 0 && (
                  <div className="flex items-center gap-1 mt-1 text-white/15">
                    <ThumbsUp className="w-3 h-3" />
                    <span className="text-[10px]">{comment.likeCount.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Load more */}
        {continuation && (
          <div className="px-3 pb-3">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="w-full py-2 text-xs font-medium text-white/30 hover:text-white/50 bg-white/[0.03] hover:bg-white/[0.06] rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loadingMore ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Loading...
                </>
              ) : (
                'Load more comments'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
