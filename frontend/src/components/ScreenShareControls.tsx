import { Monitor, MonitorOff, AlertCircle } from 'lucide-react'
import { useScreenShare } from '../lib/ScreenShareContext'

export default function ScreenShareControls() {
  const { isSharing, isViewing, screenError, startSharing, stopSharing } = useScreenShare()

  return (
    <div className="absolute bottom-3 right-3 z-10 flex flex-col items-end gap-2">
      {/* Error message */}
      {screenError && !isSharing && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-red-500/20 border border-red-500/30 backdrop-blur-xl">
          <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
          <span className="text-[11px] text-red-300 font-medium">{screenError}</span>
        </div>
      )}

      {isSharing ? (
        <button
          onClick={stopSharing}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 backdrop-blur-xl transition-all text-xs font-medium shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
          title="Stop sharing your screen"
        >
          <MonitorOff className="w-4 h-4" />
          Stop Sharing
        </button>
      ) : isViewing ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-accent-500/20 border border-accent-500/30 backdrop-blur-xl text-xs font-medium text-[var(--accent-text)] shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
          <Monitor className="w-4 h-4" />
          Screen share active
        </div>
      ) : (
        <button
          onClick={startSharing}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.08] text-white/40 hover:text-white/70 hover:bg-white/[0.1] hover:border-white/[0.15] backdrop-blur-xl transition-all text-xs font-medium shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
          title="Share your screen"
        >
          <Monitor className="w-4 h-4" />
          Share Screen
        </button>
      )}
    </div>
  )
}
