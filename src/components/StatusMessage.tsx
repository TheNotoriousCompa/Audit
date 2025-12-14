import React from 'react';

interface StatusMessageProps {
  result?: string;
  error?: string;
}

export const StatusMessage: React.FC<StatusMessageProps> = ({ result, error }) => {
  if (!result && !error) return null;

  return (
    <div className="w-full mt-6 space-y-4">
      {result && (
        <div className="p-4 bg-green-900/30 border border-green-800/50 rounded-xl">
          <p className="text-green-400 font-medium">
            <span className="font-bold">Success:</span> {result}
          </p>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-900/30 border border-red-800/50 rounded-xl">
          <p className="text-red-400 font-medium">
            <span className="font-bold">Error:</span> {error}
          </p>
        </div>
      )}
    </div>
  );
};

export default StatusMessage;
