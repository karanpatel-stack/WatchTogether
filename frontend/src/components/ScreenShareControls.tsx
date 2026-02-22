import { Monitor, AlertCircle } from 'lucide-react'
import { useScreenShare } from '../lib/ScreenShareContext'

export default function ScreenShareControls({ rightOffset = 0 }: { rightOffset?: number }) {
  const { isSharing, isViewing, screenError } = useScreenShare()

  if (!isSharing && !isViewing && !screenError) return null

  return (
    <div className="absolute bottom-3 z-10 flex flex-col items-end gap-2" style={{ right: 12 + rightOffset, transition: 'right 0.3s ease' }}>
      {/* Error message */}
      {screenError && !isSharing && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-red-500/20 border border-red-500/30 backdrop-blur-xl">
          <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
          <span className="text-[11px] text-red-300 font-medium">{screenError}</span>
        </div>
      )}

      {isViewing && !isSharing && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-accent-500/20 border border-accent-500/30 backdrop-blur-xl text-xs font-medium text-[var(--accent-text)] shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
          <Monitor className="w-4 h-4" />
          Screen share active
        </div>
      )}
    </div>
  )
}
