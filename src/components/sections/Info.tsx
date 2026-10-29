import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface InfoProps {
  show: boolean;
  onClose: () => void;
}

const FAQS = [
  {
    question: 'What is Audit?',
    answer: 'A YouTube → MP3/MP4 converter with a built-in library and player.',
  },
  {
    question: 'How do I convert something?',
    answer: "Paste a YouTube link (or 'Artist — Song') and press Download. MP3 is the default.",
  },
  {
    question: 'Which formats are supported?',
    answer: 'MP3 and MP4. More formats are on the way.',
  },
  {
    question: 'FFMPEG not found?',
    answer: 'Put ffmpeg in the app folder and restart.',
  },
];

const Info: React.FC<InfoProps> = ({ show, onClose }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on ESC
  useEffect(() => {
    if (!show) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [show, onClose]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          ref={containerRef}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.18, ease: 'easeOut' } }}
          exit={{ opacity: 0, y: -6, transition: { duration: 0.12, ease: 'easeIn' } }}
          className="w-full"
        >
          {/* Header — sits directly on the popover, no nested surface */}
          <div className="flex items-center justify-between px-1 pb-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-1.5 h-1.5 rounded-full acc-bg shrink-0" />
              <h2 className="text-sm font-semibold text-white">Info</h2>
              <span className="text-[11px] text-gray-500 truncate">Audit v1.4.0</span>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="p-1 -mr-1 rounded-lg text-gray-400 acc-hover-text transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="px-1 text-[11px] leading-relaxed text-gray-400">
            One window for downloads, your library and playback.
          </p>

          {/* Single bordered group with dividers instead of stacked cards */}
          <div className="mt-3 rounded-xl border border-white/5 divide-y divide-white/5">
            {FAQS.map((faq) => (
              <div key={faq.question} className="px-3 py-2.5">
                <h3 className="text-xs font-medium text-gray-100">{faq.question}</h3>
                <p className="mt-0.5 text-[11px] leading-relaxed text-gray-400">{faq.answer}</p>
              </div>
            ))}
          </div>

          <p className="mt-3 text-center text-[10px] text-gray-600">
            {new Date().getFullYear()} Audit
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Info;
