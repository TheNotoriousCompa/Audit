import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Settings, HelpCircle, AlertTriangle, FileText, Info as InfoIcon } from 'lucide-react';

interface FAQItem {
  question: string;
  answer: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
}

interface InfoProps {
  show: boolean;
  onClose: () => void;
}

const Info: React.FC<InfoProps> = ({ show, onClose }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const faqs: FAQItem[] = [
    {
      question: "Cos'è Audit?",
      answer: "Audit è un'applicazione per la conversione di contenuti multimediali con funzionalità avanzate e un'interfaccia intuitiva.",
      icon: InfoIcon,
      iconClass: "text-blue-400"
    },
    {
      question: "Come posso convertire un file?",
      answer: "Incolla l'URL del contenuto, seleziona il formato desiderato e clicca su 'Converti'.",
      icon: HelpCircle,
      iconClass: "text-purple-400"
    },
    {
      question: "Quali formati sono supportati?",
      answer: "Supportiamo MP3, MP4, WAV e molti altri formati. Vedi la sezione Formati supportati per l'elenco completo.",
      icon: FileText,
      iconClass: "text-emerald-400"
    },
    {
      question: "Ci sono limiti di dimensione?",
      answer: "Sì, il limite massimo è di 2GB per file. Per file più grandi, consigliamo di utilizzare la versione desktop.",
      icon: AlertTriangle,
      iconClass: "text-yellow-400"
    }
  ];

  // Gestione della chiusura con tasto ESC
  useEffect(() => {
    if (!show) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [show, onClose]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          ref={containerRef}
          initial={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0, overflow: 'hidden' }}
          animate={{
            opacity: 1,
            height: 'auto',
            marginTop: '1.5rem',
            marginBottom: '1rem',
            overflow: 'visible',
          }}
          exit={{ 
            opacity: 0, 
            height: 0, 
            marginTop: 0, 
            marginBottom: 0, 
            overflow: 'hidden',
            transition: { duration: 0.2 }
          }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          className="w-full"
        >
          <div className="bg-black/30 backdrop-blur-md border border-gray-700/50 rounded-xl p-6 shadow-lg">
            {/* Header */}
            <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-800">
              <h2 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                Information and Help
              </h2>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white hover:bg-gray-800 p-1 rounded-full transition-colors"
                aria-label="Close"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            {/* Info App */}
            <div className="mb-8 p-4 bg-gray-800/50 border border-gray-700/50 rounded-xl">
              <div className="flex items-center space-x-4">
                <div className="p-2.5 bg-emerald-500/20 rounded-xl border border-emerald-400/30">
                  <Settings className="w-7 h-7 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Audit</h3>
                  <p className="text-sm text-gray-300">Versione 1.1</p>
                </div>
              </div>
              <p className="mt-3 text-gray-200 text-sm leading-relaxed">
                Un&apos;applicazione potente per la gestione e l&apos;analisi di contenuti multimediali con funzionalità avanzate e controlli intuitivi.
              </p>
            </div>

            {/* FAQ Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 w-1.5 h-5 rounded-full mr-2" />
                Domande Frequenti
              </h3>
              
              <div className="space-y-3">
                {faqs.map((faq, index) => {
                  const Icon = faq.icon;
                  return (
                    <motion.div 
                      key={index}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 * index }}
                      className="bg-gray-800/70 hover:bg-gray-800/90 transition-colors border border-gray-700/60 rounded-xl p-4 shadow-sm"
                    >
                      <div className="flex items-start space-x-3">
                        <div className={`p-1.5 ${faq.iconClass.replace('text-', 'bg-')}/10 rounded-lg mt-0.5`}>
                          <Icon className={`w-5 h-5 ${faq.iconClass}`} />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-white">{faq.question}</h4>
                          <p className="text-sm text-gray-200 mt-1.5 leading-relaxed">{faq.answer}</p>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="mt-8 pt-6 border-t border-gray-800/70">
              <p className="text-xs text-center text-gray-400">
                {new Date().getFullYear()} Audit - Tutti i diritti riservati
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Info;