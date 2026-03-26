import { useState, useCallback } from 'react';

/**
 * InvitePanel — Copy Link + Web Share button for inviting friends.
 * Zero external dependencies — uses Clipboard API and Web Share API.
 */
export function InvitePanel() {
  const [copied, setCopied] = useState(false);
  const url = window.location.href;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API denied — ignore silently
    }
  }, [url]);

  const handleShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'PoTagGame — Join my game!',
          text:  'Come play tag with me!',
          url,
        });
      } catch {
        // User cancelled or share failed — ignore
      }
    }
  }, [url]);

  const canShare = typeof navigator.share === 'function';

  const messengerUrl = `https://www.facebook.com/dialog/send?link=${encodeURIComponent(url)}&app_id=0&redirect_uri=${encodeURIComponent(url)}`;

  return (
    <div className="flex gap-2 items-center">
      <button
        onClick={handleCopy}
        className="flex items-center gap-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm px-3 py-1.5 rounded border border-gray-600 transition-colors"
      >
        {copied ? (
          <>
            <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Copied!
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Copy Link
          </>
        )}
      </button>

      <a
        href={messengerUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 bg-[#0084FF] hover:bg-[#0077E6] text-white text-sm px-3 py-1.5 rounded transition-colors"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.477 2 2 6.145 2 11.243c0 2.908 1.434 5.503 3.678 7.2V22l3.455-1.9c.92.256 1.896.394 2.867.394 5.523 0 10-4.145 10-9.243S17.523 2 12 2zm1.07 12.445l-2.55-2.72-4.975 2.72 5.475-5.81 2.613 2.72 4.912-2.72-5.475 5.81z" />
        </svg>
        Messenger
      </a>

      {canShare && (
        <button
          onClick={handleShare}
          className="flex items-center gap-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm px-3 py-1.5 rounded border border-gray-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          Share
        </button>
      )}
    </div>
  );
}
